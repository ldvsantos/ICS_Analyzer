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

  function formatNumberPtBRNoGroup(value, digits) {
    if (!Number.isFinite(value)) return '';
    const d = Number.isFinite(digits) ? digits : 3;
    // pt-BR: separador decimal "," e sem separador de milhar (pra CSV)
    try {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: false,
      }).format(value);
    } catch {
      return value.toFixed(d).replace('.', ',');
    }
  }

  function downloadTextFile(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const s = String(value ?? '');
    // Para Excel pt-BR, vamos usar ';' como separador.
    // Se tiver aspas/;\n, envolve em aspas e duplica aspas internas.
    if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildDashboardCsv(state) {
    const sep = ';';
    const lines = [];

    // BOM ajuda Excel a entender UTF-8
    lines.push('\ufeffcampo' + sep + 'valor');
    lines.push(['gerado_em', state.generatedAt].map(csvEscape).join(sep));
    lines.push(['registros_total', state.totalRecords].map(csvEscape).join(sep));
    lines.push(['registros_validos', state.validRecords].map(csvEscape).join(sep));
    lines.push(['ultimo_ano', state.lastYear ?? ''].map(csvEscape).join(sep));
    lines.push(['ispc_medio_global', formatNumberPtBRNoGroup(state.meanGlobal, 3)].map(csvEscape).join(sep));
    lines.push(['tendencia_ponto_por_ano', formatNumberPtBRNoGroup(state.trendSlope, 4)].map(csvEscape).join(sep));

    lines.push('');
    lines.push('serie_global' + sep + 'ano' + sep + 'ispc_medio' + sep + 'n');
    for (const row of (state.globalByYear || [])) {
      lines.push([
        'serie_global',
        row.year,
        formatNumberPtBRNoGroup(row.value, 3),
        row.n,
      ].map(csvEscape).join(sep));
    }

    lines.push('');
    lines.push('serie_por_profundidade' + sep + 'profundidade' + sep + 'ano' + sep + 'ispc_medio');
    for (const s of (state.seriesByDepth || [])) {
      for (const p of (s.points || [])) {
        lines.push([
          'serie_por_profundidade',
          s.depth || 'indef.',
          p.year,
          formatNumberPtBRNoGroup(p.value, 3),
        ].map(csvEscape).join(sep));
      }
    }

    lines.push('');
    lines.push('drivers_pearson' + sep + 'profundidade' + sep + 'variavel' + sep + 'r');
    for (const d of (state.driversByDepth || [])) {
      for (const it of (d.drivers || [])) {
        lines.push([
          'drivers_pearson',
          d.depth || 'indef.',
          it.key,
          formatNumberPtBRNoGroup(it.corr, 4),
        ].map(csvEscape).join(sep));
      }
    }

    lines.push('');
    lines.push('model_quality' + sep + 'profundidade_tag' + sep + 'target' + sep + 'n' + sep + 'alpha' + sep + 'cv_group' + sep + 'k' + sep + 'rmse' + sep + 'rmse_std' + sep + 'r2' + sep + 'r2_std' + sep + 'ok' + sep + 'reason');
    for (const r of (state.modelQuality || [])) {
      lines.push([
        'model_quality',
        r.depthTag,
        r.target,
        (Number.isFinite(r.n) ? String(r.n) : ''),
        (Number.isFinite(r.alpha) ? formatNumberPtBRNoGroup(r.alpha, 4) : ''),
        (r.cvGroup || ''),
        (Number.isFinite(r.k) ? String(r.k) : ''),
        (Number.isFinite(r.rmse) ? formatNumberPtBRNoGroup(r.rmse, 6) : ''),
        (Number.isFinite(r.rmseStd) ? formatNumberPtBRNoGroup(r.rmseStd, 6) : ''),
        (Number.isFinite(r.r2) ? formatNumberPtBRNoGroup(r.r2, 6) : ''),
        (Number.isFinite(r.r2Std) ? formatNumberPtBRNoGroup(r.r2Std, 6) : ''),
        (r.ok === true ? 'true' : 'false'),
        (r.reason || ''),
      ].map(csvEscape).join(sep));
    }

    return lines.join('\r\n');
  }

  function exportDashboardCsv(state) {
    if (!state) throw new Error('Dashboard ainda não está pronto para exportação.');
    const stamp = String(state.generatedAt || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, '-');
    const csv = buildDashboardCsv(state);
    downloadTextFile(`ics_dashboard_${stamp}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportDashboardPdf(state) {
    if (!state) throw new Error('Dashboard ainda não está pronto para exportação.');
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Biblioteca de PDF não carregou (jsPDF).');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    try {
      doc.setProperties({
        title: 'ICS Analyzer — Dashboard (ISPC)',
        subject: 'Dashboard (banco local) — séries, drivers e resumo anual',
        author: '',
        keywords: 'ICS, ISPC, dashboard, banco local, séries, drivers, correlação',
        creator: 'ICS Analyzer',
      });
    } catch {
      // ignore
    }

    const marginX = 14;
    let y = 16;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    doc.text('ICS Analyzer — Dashboard (ISPC)', marginX, y);
    y += 7;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Gerado em: ${new Date(state.generatedAt).toLocaleString('pt-BR')}`, marginX, y);
    y += 6;

    doc.setTextColor(0);
    doc.text(`Registros: ${state.totalRecords} (válidos: ${state.validRecords})`, marginX, y);
    y += 5;
    doc.text(`Último ano: ${state.lastYear ?? '—'}  •  ISPC médio (global): ${formatNumberPtBR(state.meanGlobal, 2)}`, marginX, y);
    y += 5;
    doc.text(`Tendência: ${Number.isFinite(state.trendSlope) ? formatNumberPtBR(state.trendSlope, 3) : '—'} ponto/ano`, marginX, y);
    y += 8;

    const canAutoTable = typeof doc.autoTable === 'function';

    const globalBody = (state.globalByYear || []).map((r) => [
      String(r.year),
      formatNumberPtBR(r.value, 2),
      String(r.n),
    ]);

    if (canAutoTable) {
      doc.setFont(undefined, 'bold');
      doc.text('Série global (média anual)', marginX, y);
      y += 2;
      doc.autoTable({
        startY: y,
        head: [['Ano', 'ISPC médio', 'n']],
        body: globalBody,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 58, 138] },
        margin: { left: marginX, right: marginX },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont(undefined, 'bold');
      doc.text('Série global (média anual)', marginX, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      globalBody.slice(0, 20).forEach((row) => {
        doc.text(`${row[0]}  —  ${row[1]}  (n=${row[2]})`, marginX, y);
        y += 4;
      });
      y += 4;
    }

    const yearRows = state.yearsPick || [];
    const yearBody = yearRows.map((r) => [String(r.year), formatNumberPtBR(r.value, 2), String(r.n), String(r.group)]);
    if (yearBody.length && canAutoTable) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text('Melhores e piores anos (top/bottom)', marginX, y);
      y += 2;
      doc.autoTable({
        startY: y,
        head: [['Ano', 'ISPC médio', 'n', 'Grupo']],
        body: yearBody,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] },
        margin: { left: marginX, right: marginX },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    const driversDepths = (state.driversByDepth || []).slice(0, 4);
    if (driversDepths.length) {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text('Drivers por profundidade (|r| maior primeiro)', marginX, y);
      y += 4;

      for (const d of driversDepths) {
        const top = (d.drivers || []).slice(0, 6);
        if (!top.length) continue;

        if (canAutoTable) {
          doc.setFont(undefined, 'bold');
          doc.setFontSize(10);
          doc.text(`Profundidade: ${d.depth || 'indef.'} (n=${d.n})`, marginX, y);
          y += 2;

          const body = top.map((it) => [
            it.key,
            (it.corr >= 0 ? '+' : '') + formatNumberPtBR(it.corr, 3),
          ]);

          doc.autoTable({
            startY: y,
            head: [['Variável', 'r (Pearson)']],
            body,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [37, 99, 235] },
            margin: { left: marginX, right: marginX },
          });
          y = doc.lastAutoTable.finalY + 6;
        } else {
          doc.setFont(undefined, 'bold');
          doc.text(`Profundidade: ${d.depth || 'indef.'} (n=${d.n})`, marginX, y);
          y += 4;
          doc.setFont(undefined, 'normal');
          top.forEach((it) => {
            doc.text(`- ${it.key}: r=${(it.corr >= 0 ? '+' : '') + formatNumberPtBR(it.corr, 3)}`, marginX, y);
            y += 4;
          });
          y += 2;
        }

        if (y > 260) {
          doc.addPage();
          y = 16;
        }
      }
    }

    if ((state.recommendations || []).length) {
      if (y > 240) {
        doc.addPage();
        y = 16;
      }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text('Recomendações (MVP)', marginX, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      for (const r of state.recommendations.slice(0, 8)) {
        const lines = doc.splitTextToSize(String(r), 180);
        doc.text(lines, marginX, y);
        y += 4 * Math.max(1, lines.length);
        if (y > 270) {
          doc.addPage();
          y = 16;
        }
      }
    }

    const stamp = String(state.generatedAt || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, '-');
    doc.save(`ics_dashboard_${stamp}.pdf`);
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

  function getReducedMLModels() {
    if (typeof ISPC_ReducedMLModels !== 'undefined' && ISPC_ReducedMLModels) return ISPC_ReducedMLModels;
    if (typeof window !== 'undefined' && window.ISPC_ReducedMLModels) return window.ISPC_ReducedMLModels;
    if (typeof require === 'function') {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require('./ics_analyzer_ispc_reduced_ml_models.js');
      } catch {
        return null;
      }
    }
    return null;
  }

  function depthTagLabel(tag) {
    const t = String(tag || '').trim();
    if (t === 'dados_1020') return '10–20 cm';
    return '0–10 cm';
  }

  function modelQualityFlags(row) {
    const flags = [];

    if (Number.isFinite(row.n) && row.n < 30) flags.push('n_baixo');
    if (row.ok !== true) flags.push('falha');

    if (Number.isFinite(row.r2) && row.r2 < 0) flags.push('r2_baixo');
    if (Number.isFinite(row.r2Std) && row.r2Std > 0.2) flags.push('r2_instavel');

    return flags;
  }

  function severityFromFlags(flags) {
    const f = new Set(flags || []);
    if (f.has('falha') || f.has('r2_baixo')) return 'bad';
    if (f.has('r2_instavel') || f.has('n_baixo')) return 'warn';
    return 'ok';
  }

  function renderModelQualityTable() {
    const table = document.getElementById('dash-model-quality');
    if (!table) return [];

    const summary = document.getElementById('dash-model-quality-summary');

    const ml = getReducedMLModels();
    if (!ml || !ml.by_tag) {
      table.innerHTML = '<tbody><tr><td>Modelos reduzidos indisponíveis para leitura de qualidade.</td></tr></tbody>';
      return [];
    }

    const rows = [];
    const tags = Object.keys(ml.by_tag || {}).sort();
    for (const depthTag of tags) {
      const block = ml.by_tag[depthTag] || {};
      const models = block.models || {};
      const targets = Object.keys(models).sort();
      for (const target of targets) {
        const m = models[target] || {};
        const cv = m.cv || {};
        const folds = Array.isArray(m.cv_folds) ? m.cv_folds : [];

        const rmseStd = Number.isFinite(cv.rmse_std)
          ? Number(cv.rmse_std)
          : (folds.length && Number.isFinite(cv.rmse)
            ? Math.sqrt(folds.reduce((acc, f) => acc + Math.pow((Number(f.rmse) - Number(cv.rmse)), 2), 0) / folds.length)
            : null);

        const r2Std = Number.isFinite(cv.r2_std)
          ? Number(cv.r2_std)
          : (folds.length && Number.isFinite(cv.r2)
            ? Math.sqrt(folds.reduce((acc, f) => acc + Math.pow((Number(f.r2) - Number(cv.r2)), 2), 0) / folds.length)
            : null);

        rows.push({
          depthTag,
          depthLabel: depthTagLabel(depthTag),
          target,
          ok: m.ok === true,
          reason: m.reason || '',
          n: Number.isFinite(m.n) ? Number(m.n) : null,
          alpha: Number.isFinite(m.alpha) ? Number(m.alpha) : null,
          cvGroup: (cv.group ? String(cv.group) : ''),
          k: Number.isFinite(cv.k) ? Number(cv.k) : null,
          rmse: Number.isFinite(cv.rmse) ? Number(cv.rmse) : null,
          rmseStd: Number.isFinite(rmseStd) ? Number(rmseStd) : null,
          r2: Number.isFinite(cv.r2) ? Number(cv.r2) : null,
          r2Std: Number.isFinite(r2Std) ? Number(r2Std) : null,
        });
      }
    }

    for (const r of rows) {
      r.flags = modelQualityFlags(r);
      r.severity = severityFromFlags(r.flags);
    }

    if (summary) {
      const bad = rows.filter(r => r.severity === 'bad').length;
      const warn = rows.filter(r => r.severity === 'warn').length;
      const ok = rows.filter(r => r.severity === 'ok').length;
      const group = rows.find(r => r.cvGroup)?.cvGroup || '—';
      const kUsed = rows.find(r => Number.isFinite(r.k))?.k || '—';
      const total = rows.length;
      summary.textContent = `Resumo de triagem. Total ${total}. OK ${ok}. Alerta ${warn}. Crítico ${bad}. CV com k ${kUsed} e grupo ${group}.`;
    }

    table.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Profundidade</th><th>Variável</th><th>n</th><th>k</th><th>Grupo</th><th>RMSE (CV)</th><th>R² (CV)</th><th>Alpha</th><th>Status</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.severity === 'bad') tr.classList.add('dash-quality-bad');
      if (r.severity === 'warn') tr.classList.add('dash-quality-warn');
      const rmseTxt = Number.isFinite(r.rmse)
        ? `${formatNumberPtBR(r.rmse, 3)}${Number.isFinite(r.rmseStd) ? ` ± ${formatNumberPtBR(r.rmseStd, 3)}` : ''}`
        : '—';
      const r2Txt = Number.isFinite(r.r2)
        ? `${formatNumberPtBR(r.r2, 3)}${Number.isFinite(r.r2Std) ? ` ± ${formatNumberPtBR(r.r2Std, 3)}` : ''}`
        : '—';
      const alphaTxt = Number.isFinite(r.alpha) ? formatNumberPtBR(r.alpha, 3) : '—';
      const statusTxt = r.ok ? 'OK' : (r.reason ? `Falha (${r.reason})` : 'Falha');

      tr.innerHTML = `
        <td>${r.depthLabel}</td>
        <td>${r.target}</td>
        <td>${Number.isFinite(r.n) ? r.n : '—'}</td>
        <td>${Number.isFinite(r.k) ? r.k : '—'}</td>
        <td>${r.cvGroup || '—'}</td>
        <td>${rmseTxt}</td>
        <td>${r2Txt}</td>
        <td>${alphaTxt}</td>
        <td>${statusTxt}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return rows;
  }

  function pearsonCorrelation(xs, ys) {
    const pairs = [];
    for (let i = 0; i < xs.length; i += 1) {
      const x = xs[i];
      const y = ys[i];
      if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }

    const n = pairs.length;
    if (n < 5) return null;

    let sx = 0; let sy = 0;
    for (const [x, y] of pairs) {
      sx += x;
      sy += y;
    }
    const mx = sx / n;
    const my = sy / n;

    let sxx = 0; let syy = 0; let sxy = 0;
    for (const [x, y] of pairs) {
      const dx = x - mx;
      const dy = y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
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

  function computeDrivers(records) {
    const keys = [
      'dmg',
      'estoque_c',
      'na',
      'icv',
      'altura',
      'diam_espiga',
      'comp_espiga',
      'n_plantas',
      'n_espigas',
      'produtividade',
    ];

    const score = records.map((r) => r.ispcScore);
    const out = [];
    for (const k of keys) {
      const xs = records.map((r) => r[k]);
      const corr = pearsonCorrelation(xs, score);
      if (!Number.isFinite(corr)) continue;
      out.push({ key: k, corr });
    }
    out.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    return out;
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

    const btnCsv = document.getElementById('dash-export-csv');
    const btnPdf = document.getElementById('dash-export-pdf');
    if (btnCsv) btnCsv.disabled = true;
    if (btnPdf) btnPdf.disabled = true;

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

    // Stats globais (agregado)
    const allYearsRaw = withScore.map((r) => r.ano).filter(Number.isFinite);
    const lastYear = allYearsRaw.length ? Math.max(...allYearsRaw) : null;
    safeText('dash-last-year', Number.isFinite(lastYear) ? String(lastYear) : '—');

    const allValues = withScore.map((r) => r.ispcScore).filter(Number.isFinite);
    const mean = allValues.length ? (allValues.reduce((a, b) => a + b, 0) / allValues.length) : null;
    safeText('dash-ispc-mean', Number.isFinite(mean) ? formatNumberPtBR(mean, 2) : '—');

    const byYearGlobal = groupBy(withScore, (r) => r.ano);
    const gYears = Array.from(byYearGlobal.keys()).filter(Number.isFinite).sort((a, b) => a - b);
    const gVals = gYears.map((y) => {
      const arr = byYearGlobal.get(y) || [];
      return arr.reduce((acc, it) => acc + it.ispcScore, 0) / (arr.length || 1);
    });
    const gLr = linearRegression(gYears, gVals);
    safeText('dash-trend', (gLr && Number.isFinite(gLr.slope)) ? formatNumberPtBR(gLr.slope, 3) : '—');

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

    // Chart: comparação por profundidade no último ano
    const ctxLast = document.getElementById('dash-ispc-lastyear');
    if (ctxLast && typeof Chart !== 'undefined' && Number.isFinite(lastYear)) {
      const labels = [];
      const values = [];

      const depthsSorted = Array.from(byDepth.keys()).sort();
      for (const depth of depthsSorted) {
        const rows = byDepth.get(depth) || [];
        const inYear = rows.filter((r) => r.ano === lastYear);
        if (!inYear.length) continue;
        const avg = inYear.reduce((acc, it) => acc + it.ispcScore, 0) / inYear.length;
        labels.push(depth || 'indef.');
        values.push(avg);
      }

      renderChart(ctxLast, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: `ISPC médio em ${lastYear}`,
            data: values,
            backgroundColor: 'rgba(37, 99, 235, 0.25)',
            borderColor: 'rgba(37, 99, 235, 0.9)',
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: `ISPC médio por profundidade (${lastYear})` },
            legend: { display: false },
          },
          scales: { y: { min: 0, max: 10 } },
        },
      });
    }

    // Chart: contagem de registros por ano
    const ctxCount = document.getElementById('dash-count-by-year');
    if (ctxCount && typeof Chart !== 'undefined') {
      const counts = gYears.map((y) => (byYearGlobal.get(y) || []).length);
      renderChart(ctxCount, {
        type: 'bar',
        data: {
          labels: gYears,
          datasets: [{
            label: 'Registros',
            data: counts,
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderColor: 'rgba(16, 185, 129, 0.9)',
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: 'Registros por ano (banco local)' },
            legend: { display: false },
          },
        },
      });
    }

    // Drivers (correlação por profundidade)
    const driversByDepth = [];
    const driversRoot = document.getElementById('dash-drivers');
    if (driversRoot) {
      driversRoot.innerHTML = '';
      const depthsSorted = Array.from(byDepth.keys()).sort();

      for (const depth of depthsSorted) {
        const rows = (byDepth.get(depth) || []).filter((r) => Number.isFinite(r.ispcScore));
        if (rows.length < 8) continue;

        const drivers = computeDrivers(rows);
        if (!drivers.length) continue;

        driversByDepth.push({ depth, n: rows.length, drivers });

        const box = document.createElement('div');
        box.className = 'card dash-driver-card';

        const title = document.createElement('div');
        title.className = 'section-title dash-driver-title';
        title.textContent = `Profundidade: ${depth || 'indef.'} (n=${rows.length})`;
        box.appendChild(title);

        const top = drivers.slice(0, 6);

        const ul = document.createElement('ul');
        ul.className = 'dash-driver-list';
        for (const it of top) {
          const li = document.createElement('li');
          const s = it.corr;
          const sign = s >= 0 ? '+' : '';
          const abs = Math.abs(s);
          const strength = abs >= 0.5 ? 'forte' : abs >= 0.3 ? 'moderada' : 'fraca';
          li.textContent = `${it.key}: r=${sign}${formatNumberPtBR(s, 3)} (associação ${strength})`;
          ul.appendChild(li);
        }

        const hint = document.createElement('p');
  hint.className = 'lt-muted dash-driver-hint';
        hint.textContent = 'Sugestão prática: priorize intervenções nos fatores com maior |r| e que sejam manejáveis (interpretação operacional).';

        box.appendChild(ul);
        box.appendChild(hint);
        driversRoot.appendChild(box);
      }

      if (!driversRoot.children.length) {
        driversRoot.textContent = 'Sem dados suficientes para estimar drivers (precisa de amostras com entradas reduzidas completas).';
      }
    }

    // Tabela melhores/piores anos (global)
    const yearsTable = document.getElementById('dash-years-table');
    let yearsPick = [];
    if (yearsTable && gYears.length) {
      const rows = gYears.map((y, idx) => ({ year: y, value: gVals[idx], n: (byYearGlobal.get(y) || []).length }));
      const sorted = [...rows].sort((a, b) => a.value - b.value);
      const bottom = sorted.slice(0, 3);
      const top = sorted.slice(-3).reverse();
      const pick = [...top, ...bottom];
      yearsPick = pick.map((r) => ({
        ...r,
        group: top.find((t) => t.year === r.year) ? 'melhor' : 'pior',
      }));

      yearsTable.innerHTML = '';

      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Ano</th><th>ISPC médio</th><th>n</th><th>Grupo</th></tr>';
      yearsTable.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const r of yearsPick) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.year}</td>
          <td>${formatNumberPtBR(r.value, 2)}</td>
          <td>${r.n}</td>
          <td>${r.group}</td>
        `;
        tbody.appendChild(tr);
      }
      yearsTable.appendChild(tbody);
    }

    const globalByYear = gYears.map((year, idx) => ({
      year,
      value: gVals[idx],
      n: (byYearGlobal.get(year) || []).length,
    }));

    const modelQuality = renderModelQualityTable();

    // Estado compartilhado (para exportações)
    const state = {
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      validRecords: withScore.length,
      lastYear,
      meanGlobal: mean,
      trendSlope: gLr?.slope,
      seriesByDepth,
      globalByYear,
      yearsPick,
      driversByDepth,
      recommendations: recs,
      modelQuality,
    };
    window.ICSDashboardState = state;

    // Botões de exportação
    if (btnCsv) {
      btnCsv.disabled = !withScore.length;
      btnCsv.addEventListener('click', () => {
        try {
          exportDashboardCsv(window.ICSDashboardState);
        } catch (err) {
          console.error(err);
          setStatus(`Falha ao exportar CSV: ${err?.message || err}`);
        }
      });
    }

    if (btnPdf) {
      btnPdf.disabled = !withScore.length;
      btnPdf.addEventListener('click', () => {
        try {
          exportDashboardPdf(window.ICSDashboardState);
        } catch (err) {
          console.error(err);
          setStatus(`Falha ao exportar PDF: ${err?.message || err}`);
        }
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
