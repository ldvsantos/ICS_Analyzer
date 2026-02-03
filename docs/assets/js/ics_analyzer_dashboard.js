/* ICS Analyzer - Dashboard (MVP) */

(function () {
  function formatNumberPtBR(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const d = Number.isFinite(digits) ? digits : 2;
    try {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
    } catch {
      return value.toFixed(d).replace('.', ',');
    }
  }

  function depthToTag(depth) {
    const d = String(depth || '').trim();
    if (d === '10-20') return 'dados_1020';
    return 'dados_010';
  }

  function safeText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(text ?? '');
  }

  function groupBy(items, keyFn) {
    const out = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(it);
    }
    return out;
  }

  function linearRegression(xs, ys) {
    const n = xs.length;
    if (!n) return null;
    let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
    const den = (n * sxx - sx * sx);
    if (den === 0) return { slope: 0, intercept: sy / n };
    const slope = (n * sxy - sx * sy) / den;
    const intercept = (sy - slope * sx) / n;
    return { slope, intercept };
  }

  async function loadRecords() {
    const bank = window.ICSBank;
    if (!bank || typeof bank.getAllISPCRecords !== 'function') {
      throw new Error('Banco local (ICSBank/IndexedDB) indisponível.');
    }
    return bank.getAllISPCRecords();
  }

  function computeISPCScore(rec) {
    const fuzzy = window.ICS_Fuzzy;
    if (!fuzzy || typeof fuzzy.evaluateISPCReduced !== 'function') return null;

    const reducedInputs = {
      dmg: rec.dmg,
      estoque_c: rec.estoque_c,
      na: rec.na,
      icv: rec.icv,
      altura: rec.altura,
      diam_espiga: rec.diam_espiga,
      comp_espiga: rec.comp_espiga,
      n_plantas: rec.n_plantas,
      n_espigas: rec.n_espigas,
      produtividade: rec.produtividade,
    };

    const anyMissing = Object.values(reducedInputs).some((v) => !Number.isFinite(v));
    if (anyMissing) return null;

    const depthTag = depthToTag(rec.profundidade_cm);
    const out = fuzzy.evaluateISPCReduced(reducedInputs, { depthTag });
    return Number.isFinite(out?.score) ? out.score : null;
  }

  function buildRecommendations(series) {
    const out = [];
    if (!series || !series.length) return out;

    const years = series.map((p) => p.year);
    const vals = series.map((p) => p.value);
    const lr = linearRegression(years, vals);
    if (lr && Number.isFinite(lr.slope)) {
      const slope = lr.slope;
      if (slope < -0.05) out.push(`Tendência de queda (${formatNumberPtBR(slope, 3)} ponto/ano): priorizar práticas conservacionistas e monitorar.`);
      else if (slope > 0.05) out.push(`Tendência de melhora (${formatNumberPtBR(slope, 3)} ponto/ano): manter manejo e consolidar cobertura/rotação.`);
      else out.push('Tendência aproximadamente estável: manter manejo e reamostrar periodicamente.');
    }

    const last = vals[vals.length - 1];
    if (Number.isFinite(last)) {
      if (last < 4) out.push('ISPC recente baixo: revisar cobertura, compactação e estratégias de incremento de C no solo.');
      else if (last < 7) out.push('ISPC recente intermediário: reforçar manutenção de cobertura e reduzir perturbação.');
      else out.push('ISPC recente alto: manter práticas atuais e focar em estabilidade no longo prazo.');
    }

    return out;
  }

  function renderChart(ctx, cfg) {
    if (typeof Chart === 'undefined') return null;
    return new Chart(ctx, cfg);
  }

  async function initDashboard() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const statusEl = document.getElementById('dash-status');
    const setStatus = (txt) => { if (statusEl) statusEl.textContent = String(txt || ''); };

    setStatus('Carregando banco local…');
    const records = await loadRecords();

    safeText('dash-total', records.length);

    if (!records.length) {
      setStatus('Sem registros no banco local. Importe um CSV no módulo de Análise Conservacionista (ISPC) para alimentar o dashboard.');
      return;
    }

    setStatus('Computando séries e estatísticas…');

    const withScore = records
      .map((r) => ({ ...r, ispcScore: computeISPCScore(r) }))
      .filter((r) => Number.isFinite(r.ano) && Number.isFinite(r.ispcScore));

    safeText('dash-valid', withScore.length);

    const byDepth = groupBy(withScore, (r) => String(r.profundidade_cm || ''));

    const seriesByDepth = [];
    for (const [depth, rows] of byDepth.entries()) {
      const byYear = groupBy(rows, (r) => r.ano);
      const years = Array.from(byYear.keys()).filter(Number.isFinite).sort((a, b) => a - b);
      const points = years.map((y) => {
        const arr = byYear.get(y);
        const avg = arr.reduce((acc, it) => acc + it.ispcScore, 0) / arr.length;
        return { year: y, value: avg };
      });
      seriesByDepth.push({ depth, points });
    }

    // Recomendação (usa a série com maior cobertura)
    const bestSeries = seriesByDepth
      .map((s) => ({ ...s, n: s.points.length }))
      .sort((a, b) => b.n - a.n)[0];

    const recs = buildRecommendations(bestSeries?.points || []);
    const recList = document.getElementById('dash-recs');
    if (recList) {
      recList.innerHTML = '';
      recs.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        recList.appendChild(li);
      });
    }

    // Chart: ISPC médio por ano (linhas por profundidade)
    const ctx = document.getElementById('dash-ispc-series');
    if (ctx && typeof Chart !== 'undefined') {
      const allYearsSet = new Set();
      seriesByDepth.forEach((s) => s.points.forEach((p) => allYearsSet.add(p.year)));
      const allYears = Array.from(allYearsSet).sort((a, b) => a - b);

      const palette = ['#1565c0', '#2e7d32', '#7b1fa2', '#c2185b', '#ef6c00'];

      const datasets = seriesByDepth.map((s, idx) => {
        const map = new Map(s.points.map((p) => [p.year, p.value]));
        return {
          label: `ISPC médio (${s.depth || 'prof. indef.'})`,
          data: allYears.map((y) => (map.has(y) ? map.get(y) : null)),
          borderColor: palette[idx % palette.length],
          backgroundColor: 'rgba(21, 101, 192, 0.08)',
          tension: 0.25,
          spanGaps: true,
        };
      });

      renderChart(ctx, {
        type: 'line',
        data: {
          labels: allYears,
          datasets,
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: 'ISPC médio por ano (banco local)' },
          },
          scales: {
            y: { min: 0, max: 10 },
          },
        },
      });
    }

    setStatus('OK.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDashboard().catch((err) => {
        console.error(err);
        const el = document.getElementById('dash-status');
        if (el) el.textContent = `Falha ao carregar dashboard: ${err?.message || err}`;
      });
    });
  } else {
    initDashboard().catch(() => { /* handled */ });
  }
})();
