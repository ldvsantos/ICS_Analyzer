/* ICS Analyzer - integração climática */

function setClimaStatus(texto, opts = {}) {
  const box = document.getElementById('climaStatus');
  const textEl = document.getElementById('climaStatusText');
  const spinner = document.getElementById('climaSpinner');

  if (!box || !textEl || !spinner) return;

  const { type = 'info', loading = false, show = true } = opts;

  textEl.textContent = String(texto ?? '');
  spinner.classList.toggle('hidden', !loading);
  box.classList.remove('status-info', 'status-success', 'status-error');
  box.classList.add(`status-${type}`);
  box.classList.toggle('hidden', !show);
}

function clearClimaStatus() {
  setClimaStatus('', { show: false, loading: false });
}

async function buscarDadosClimaticos() {
  const btnBuscarClima = document.getElementById('btnBuscarClima');
  const lat = parseNumberPtBr(document.getElementById('latitude')?.value);
  const lon = parseNumberPtBr(document.getElementById('longitude')?.value);
  const inicio = document.getElementById('climaInicio')?.value ?? '';
  const fim = document.getElementById('climaFim')?.value ?? '';

  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    setClimaStatus('Erro: informe latitude e longitude válidas para buscar dados climáticos.', { type: 'error', loading: false, show: true });
    return;
  }
  if (inicio === '' || fim === '') {
    setClimaStatus('Erro: informe início e fim do período climático.', { type: 'error', loading: false, show: true });
    return;
  }

  try {
    setClimaStatus('Buscando dados climáticos (API pública)...', { type: 'info', loading: true, show: true });
    if (btnBuscarClima) {
      btnBuscarClima.disabled = true;
      btnBuscarClima.setAttribute('aria-busy', 'true');
    }

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: inicio,
      end_date: fim,
      daily: 'precipitation_sum,temperature_2m_mean',
      timezone: 'America/Sao_Paulo',
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao consultar clima (HTTP ${res.status})`);
    const json = await res.json();

    const precip = (json?.daily?.precipitation_sum || []).map((v) => (Number.isFinite(v) ? v : Number(v)));
    const tmean = (json?.daily?.temperature_2m_mean || []).map((v) => (Number.isFinite(v) ? v : Number(v)));

    const chuvaTotal = sumArray(precip);
    const chuva7d = sumLast(precip, 7);
    const chuva30d = sumLast(precip, 30);
    const maxDia = precip.length ? Math.max(...precip.filter((v) => Number.isFinite(v))) : null;
    const tempMedia = avgArray(tmean);
    const rProxy = estimateRProxyFromPrecipDaily(precip);

    window.ultimaClima = {
      latitude: lat,
      longitude: lon,
      inicio,
      fim,
      chuvaTotal,
      chuva7d,
      chuva30d,
      maxDia,
      tempMedia,
      rProxy,
      fonte: 'open-meteo',
      fetchedAt: new Date().toISOString(),
    };

    if (window.ultimaDados) {
      window.ultimaDados.latitude = lat;
      window.ultimaDados.longitude = lon;
      window.ultimaDados.climaInicio = inicio;
      window.ultimaDados.climaFim = fim;
      window.ultimaDados.climaFonte = 'open-meteo';
      window.ultimaDados.climaChuvaTotalMm = Number.isFinite(chuvaTotal) ? chuvaTotal : null;
      window.ultimaDados.climaChuva7dMm = Number.isFinite(chuva7d) ? chuva7d : null;
      window.ultimaDados.climaChuva30dMm = Number.isFinite(chuva30d) ? chuva30d : null;
      window.ultimaDados.climaChuvaMaxDiaMm = Number.isFinite(maxDia) ? maxDia : null;
      window.ultimaDados.climaTempMediaC = Number.isFinite(tempMedia) ? tempMedia : null;
      window.ultimaDados.climaRProxy = Number.isFinite(rProxy) ? rProxy : null;
    }

    atualizarBlocosAvancados({
      ...(window.ultimaDados || {}),
      climaChuvaTotalMm: Number.isFinite(chuvaTotal) ? chuvaTotal : null,
      climaChuva7dMm: Number.isFinite(chuva7d) ? chuva7d : null,
      climaChuva30dMm: Number.isFinite(chuva30d) ? chuva30d : null,
      climaChuvaMaxDiaMm: Number.isFinite(maxDia) ? maxDia : null,
      climaRProxy: Number.isFinite(rProxy) ? rProxy : null,
    });

    setClimaStatus('✓ Dados climáticos carregados e integrados à análise.', { type: 'success', loading: false, show: true });
  } catch (err) {
    console.error('Erro ao buscar clima:', err);
    setClimaStatus(`Erro ao buscar clima: ${err?.message || err}`, { type: 'error', loading: false, show: true });
  } finally {
    if (btnBuscarClima) {
      btnBuscarClima.disabled = false;
      btnBuscarClima.removeAttribute('aria-busy');
    }
  }
}
