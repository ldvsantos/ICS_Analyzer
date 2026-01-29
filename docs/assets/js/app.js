const currentYear = new Date().getFullYear();
const yearEl = document.getElementById("current-year");
if (yearEl) {
  yearEl.textContent = currentYear.toString();
}

// Auto-hide Header on Scroll
let lastScrollY = window.scrollY;
const header = document.querySelector('header');

if (header) {
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      // Scrolling down & past top
      header.classList.add('header-hidden');
    } else {
      // Scrolling up
      header.classList.remove('header-hidden');
    }
    
    lastScrollY = currentScrollY;
  });
}

// ================ NOVOS MÓDULOS ================ //

// Módulo de integração com INMET
async function fetchDadosClimaticos(latitude, longitude) {
  try {
    const response = await fetch(`https://apitempo.inmet.gov.br/estacao/dados/${latitude}/${longitude}`);
    const dados = await response.json();
    return {
      precipitacao: dados.PREC,
      temperatura: dados.TEMP
    };
  } catch (error) {
    console.error('Erro ao buscar dados climáticos:', error);
    return null;
  }
}

// Modelo preditivo de risco de erosão
function calcularRiscoErosao(dadosSolo, dadosClimaticos) {
  // Fatores: textura (0-1), cobertura (0-1), declividade (%), precipitação (mm)
  const peso = {
    textura: 0.4,
    cobertura: 0.3,
    declividade: 0.2,
    precipitacao: 0.1
  };
  
  const score = 
    (dadosSolo.textura * peso.textura) +
    (dadosSolo.cobertura * peso.cobertura) +
    (dadosSolo.declividade / 100 * peso.declividade) +
    (dadosClimaticos.precipitacao / 100 * peso.precipitacao);
  
  // Classificação do risco
  if (score < 0.3) return 'Baixo';
  if (score < 0.6) return 'Médio';
  return 'Alto';
}

// Cálculo do Índice de Qualidade do Solo (IQS)
function calcularIQS(dados) {
  const parametros = {
    carbono: dados.carbono_organico || 0,
    agregados: dados.estabilidade_agregados || 0,
    infiltracao: dados.taxa_infiltracao || 0,
    ph: dados.ph || 0,
    ctc: dados.ctc || 0
  };
  
  // Pesos dos parâmetros
  const pesos = {
    carbono: 0.3,
    agregados: 0.25,
    infiltracao: 0.2,
    ph: 0.15,
    ctc: 0.1
  };
  
  // Cálculo do índice
  return (
    (parametros.carbono * pesos.carbono) +
    (parametros.agregados * pesos.agregados) +
    (parametros.infiltracao * pesos.infiltracao) +
    (parametros.ph * pesos.ph) +
    (parametros.ctc * pesos.ctc)
  ).toFixed(2);
}

// ================ Análise Conservacionista (SQ) ================ //

(function () {
  let lastReportData = null;

  function parseNumberPtBR(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const normalized = s.replace(/\s+/g, '').replace(',', '.');
    const v = Number.parseFloat(normalized);
    return Number.isFinite(v) ? v : null;
  }

  function formatNumberPtBR(value) {
    if (!Number.isFinite(value)) return '';
    try {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch (error) {
      return value.toFixed(2).replace('.', ',');
    }
  }

  function getCalculator() {
    if (typeof window === 'undefined') return null;
    if (window.ICS_Calculator) return window.ICS_Calculator;
    return null;
  }

  function getBank() {
    if (typeof window === 'undefined') return null;
    if (window.ICSBank) return window.ICSBank;
    return null;
  }

  function downloadTextFile(filename, text, mime) {
    const name = String(filename || 'download.txt');
    const content = String(text ?? '');
    const type = mime || 'text/plain;charset=utf-8';

    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch (err) {
      console.error('Falha ao baixar arquivo:', err);
    }
  }

  function safeText(el, text) {
    if (!el) return;
    el.textContent = String(text);
  }

  function parseCSVText(txt) {
    const raw = String(txt ?? '').trim();
    if (!raw) return { header: [], rows: [] };

    const lines = raw.split(/\r?\n/).filter((l) => String(l).trim().length);
    if (!lines.length) return { header: [], rows: [] };

    const header = lines[0].split(',').map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(',');
      const row = {};
      for (let j = 0; j < header.length; j += 1) {
        const key = header[j];
        const cell = (parts[j] ?? '').trim();
        row[key] = cell;
      }
      rows.push(row);
    }

    return { header, rows };
  }

  function normalizeCropForISPCRecords(crop) {
    const c = String(crop || '').trim();
    if (!c) return '';
    if (c === 'Pearl Millet') return 'Millet';
    if (c === 'Sunn Hemp') return 'Sunn hemp';
    return c;
  }

  function fitLinearRegression(xs, ys) {
    const n = xs.length;
    if (!n) return null;
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const mx = mean(xs);
    const my = mean(ys);
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = xs[i] - mx;
      sxx += dx * dx;
      sxy += dx * (ys[i] - my);
    }
    if (sxx === 0) return { intercept: my, slope: 0 };
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    return { intercept, slope };
  }

  function computeISPCScoreFromRow(row, depthTag, fuzzy) {
    if (!fuzzy || typeof fuzzy.evaluateISPCReduced !== 'function') return null;
    const toNum = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };

    const pickObserved = () => {
      const keys = ['ispc_real', 'ispc', 'ispc_score', 'ispcScore'];
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(row, k)) {
          const vv = parseNumberPtBR(row[k]);
          if (Number.isFinite(vv)) return vv;
        }
      }
      return null;
    };

    const reducedInputs = {
      dmg: toNum(row.dmg),
      estoque_c: toNum(row.estoque_c),
      na: toNum(row.na),
      icv: toNum(row.icv),
      altura: toNum(row.altura),
      diam_espiga: toNum(row.diam_espiga),
      comp_espiga: toNum(row.comp_espiga),
      n_plantas: toNum(row.n_plantas),
      n_espigas: toNum(row.n_espigas),
      produtividade: toNum(row.produtividade)
    };

    const x = [
      reducedInputs.dmg,
      reducedInputs.estoque_c,
      reducedInputs.na,
      reducedInputs.icv,
      reducedInputs.altura,
      reducedInputs.diam_espiga,
      reducedInputs.comp_espiga,
      reducedInputs.n_plantas,
      reducedInputs.n_espigas,
      reducedInputs.produtividade,
    ];

    const out = fuzzy.evaluateISPCReduced(reducedInputs, { depthTag });
    const scoreTeacher = Number.isFinite(out.score) ? out.score : null;
    const scoreObserved = pickObserved();

    const ml = (typeof window !== 'undefined') ? window.ICSML : null;
    const canML = ml && typeof ml.getOrCreateRegressorModel === 'function';
    const canX = x.every(Number.isFinite);

    let scoreFinal = scoreTeacher;
    if (canML && canX) {
      const modelKey = `ispc_reduced_index_${String(depthTag || 'dados_010')}`;
      const model = ml.getOrCreateRegressorModel(modelKey, 10, { learningRate: 0.03, l2: 0.0005 });

      if (model && model.nSeen() >= 50) {
        const pred = model.predict(x);
        if (Number.isFinite(pred)) {
          scoreFinal = Math.max(0, Math.min(10, pred));
        }
      }

      const yTrain = Number.isFinite(scoreObserved)
        ? Math.max(0, Math.min(10, scoreObserved))
        : scoreTeacher;
      if (model && Number.isFinite(yTrain) && Number.isFinite(scoreTeacher)) {
        model.partialFit(x, yTrain);
        model.save();
      }
    }

    return Number.isFinite(scoreFinal) ? scoreFinal : null;
  }

  function buildChartData(tillage, crop, years) {
    if (typeof window === 'undefined' || !window.ICSResearchCoefficients) {
      return null;
    }

    const yearsArr = [];
    const sqValues = [];
    for (let i = 1; i <= years; i += 1) {
      yearsArr.push(i);
      const sq = window.ICSResearchCoefficients.getSQ(tillage, crop, i);
      sqValues.push(sq);
    }

    const tillageSystems = {
      CT: window.ICSResearchCoefficients.getSQ('CT', crop, years),
      MT: window.ICSResearchCoefficients.getSQ('MT', crop, years),
      NT: window.ICSResearchCoefficients.getSQ('NT', crop, years)
    };

    return {
      years: yearsArr,
      sqValues,
      tillageSystems
    };
  }

  function initLongTermUI() {
    const calculateBtn = document.getElementById('calculate-btn');
    if (!calculateBtn) return;

    const sqResultEl = document.getElementById('sq-result');
    const recList = document.getElementById('recommendations');
    const resultsSection = document.getElementById('results-section');
    const pdfBtn = document.getElementById('generate-pdf');

    const enableFuzzyEl = document.getElementById('enable-fuzzy');
    const fuzzyFieldsEl = document.getElementById('fuzzy-fields');
    const fuzzyModelEl = document.getElementById('fuzzy-model');
    const fuzzyOperationalWrapEl = document.getElementById('fuzzy-fields-operational');
    const fuzzyISPCReducedWrapEl = document.getElementById('fuzzy-fields-ispc-reduced');
    const fuzzyCardEl = document.getElementById('fuzzy-card');
    const fuzzyTitleEl = document.getElementById('fuzzy-card-title');
    const fuzzyHintEl = document.getElementById('fuzzy-card-hint');
    const fuzzyResultEl = document.getElementById('fuzzy-result');
    const fuzzyExplainEl = document.getElementById('fuzzy-explain');
    const fuzzyRecListEl = document.getElementById('fuzzy-recommendations');

    const ispcDepthEl = document.getElementById('ispcR-depth');
    const ispcHistoryFileEl = document.getElementById('ispc-history-file');
    const ispcForecastCardEl = document.getElementById('ispc-forecast-card');
    const ispcForecastResultEl = document.getElementById('ispc-forecast-result');
    const ispcForecastExplainEl = document.getElementById('ispc-forecast-explain');

    const ispcBankImportEl = document.getElementById('ispc-bank-import');
    const ispcBankExportBtn = document.getElementById('ispc-bank-export');
    const ispcBankResetBtn = document.getElementById('ispc-bank-reset');
    const ispcBankStatusEl = document.getElementById('ispc-bank-status');

    let ispcHistory = null;
    let ispcHistoryFromBank = null;

    const bank = getBank();

    const setBankStatus = (txt) => {
      if (!ispcBankStatusEl) return;
      ispcBankStatusEl.textContent = String(txt || '');
    };

    const refreshBankStatus = async () => {
      if (!bank || !ispcBankStatusEl) return;
      try {
        const n = await bank.countISPCRecords();
        setBankStatus(`Banco ISPC local: ${n} registros.`);
      } catch (err) {
        setBankStatus('Banco ISPC: indisponível neste navegador.');
      }
    };

    const refreshIspcHistoryFromBank = async () => {
      if (!bank) {
        ispcHistoryFromBank = null;
        return;
      }
      try {
        const rows = await bank.getAllISPCRecords();
        ispcHistoryFromBank = { header: [], rows: rows || [] };
      } catch {
        ispcHistoryFromBank = null;
      }
    };

    const depthTagToCM = (depthTag) => (String(depthTag) === 'dados_1020' ? '10-20' : '0-10');

    const trainOnlineISPCFromBank = async (depthTag, fuzzy) => {
      if (!bank || !window.ICSML || typeof window.ICSML.getOrCreateRegressorModel !== 'function') return;
      if (!fuzzy || typeof fuzzy.evaluateISPC !== 'function' || typeof fuzzy.evaluateISPCReduced !== 'function') return;

      const depthCM = depthTagToCM(depthTag);
      let records = [];
      try {
        records = await bank.getAllISPCRecords();
      } catch {
        return;
      }
      const rows = (records || []).filter((r) => String(r.profundidade_cm || '').trim() === depthCM);
      if (!rows.length) return;

      const modelKey = `ispc_reduced_index_${String(depthTag || 'dados_010')}`;
      const model = window.ICSML.getOrCreateRegressorModel(modelKey, 10, { learningRate: 0.03, l2: 0.0005 });
      if (!model) return;

      let i = 0;
      const batch = 250;
      setBankStatus(`Banco ISPC: treinando em background (${rows.length} registros)...`);

      await new Promise((resolve) => {
        const step = () => {
          const end = Math.min(rows.length, i + batch);
          for (; i < end; i += 1) {
            const r = rows[i];
            const x = [
              r.dmg,
              r.estoque_c,
              r.na,
              r.icv,
              r.altura,
              r.diam_espiga,
              r.comp_espiga,
              r.n_plantas,
              r.n_espigas,
              r.produtividade,
            ];
            if (!x.every(Number.isFinite)) continue;

            let y = null;
            const full = {
              dmg: r.dmg,
              dmp: r.dmp,
              rmp: r.rmp,
              densidade: r.densidade,
              estoque_c: r.estoque_c,
              na: r.na,
              icv: r.icv,
              altura: r.altura,
              diam_espiga: r.diam_espiga,
              comp_espiga: r.comp_espiga,
              n_plantas: r.n_plantas,
              n_espigas: r.n_espigas,
              n_espigas_com: r.n_espigas_com,
              peso_espigas: r.peso_espigas,
              produtividade: r.produtividade,
            };

            if (Object.values(full).every(Number.isFinite)) {
              const out = fuzzy.evaluateISPC(full);
              if (out && Number.isFinite(out.score)) y = out.score;
            }

            if (!Number.isFinite(y)) {
              const reduced = {
                dmg: r.dmg,
                estoque_c: r.estoque_c,
                na: r.na,
                icv: r.icv,
                altura: r.altura,
                diam_espiga: r.diam_espiga,
                comp_espiga: r.comp_espiga,
                n_plantas: r.n_plantas,
                n_espigas: r.n_espigas,
                produtividade: r.produtividade,
              };
              const out2 = fuzzy.evaluateISPCReduced(reduced, { depthTag });
              if (out2 && Number.isFinite(out2.score)) y = out2.score;
            }

            if (!Number.isFinite(y)) continue;
            model.partialFit(x, Math.max(0, Math.min(10, y)));
          }

          model.save();

          if (i < rows.length) {
            setBankStatus(`Banco ISPC: treinando em background (${i}/${rows.length})...`);
            setTimeout(step, 0);
          } else {
            resolve();
          }
        };
        step();
      });

      await refreshBankStatus();
    };

    refreshBankStatus();
    refreshIspcHistoryFromBank();

    if (bank) {
      setTimeout(async () => {
        try {
          const n = await bank.countISPCRecords();
          if (!n) return;
          const depthTag = ispcDepthEl ? String(ispcDepthEl.value || 'dados_010') : 'dados_010';
          const fuzzy = (typeof window !== 'undefined') ? window.ICS_Fuzzy : null;
          await trainOnlineISPCFromBank(depthTag, fuzzy);
        } catch {
          /* ignore */
        }
      }, 300);
    }

    if (ispcBankImportEl && bank) {
      ispcBankImportEl.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const txt = await file.text();
          const res = await bank.importISPCRecordsCSVText(txt);
          if (!res || !res.ok) {
            setBankStatus(res && res.error ? res.error : 'Falha ao importar banco ISPC.');
            return;
          }
          await refreshBankStatus();
          await refreshIspcHistoryFromBank();
          const depthTag = ispcDepthEl ? String(ispcDepthEl.value || 'dados_010') : 'dados_010';
          const fuzzy = (typeof window !== 'undefined') ? window.ICS_Fuzzy : null;
          await trainOnlineISPCFromBank(depthTag, fuzzy);
        } catch (err) {
          console.error('Falha ao importar banco ISPC:', err);
          setBankStatus('Falha ao importar banco ISPC.');
        } finally {
          try { e.target.value = ''; } catch { /* ignore */ }
        }
      });
    }

    if (ispcBankExportBtn && bank) {
      ispcBankExportBtn.addEventListener('click', async () => {
        try {
          const csv = await bank.exportISPCRecordsCSV();
          const dt = new Date();
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          downloadTextFile(`ispc_bank_${y}${m}${d}.csv`, csv, 'text/csv;charset=utf-8');
        } catch (err) {
          console.error('Falha ao exportar banco ISPC:', err);
          setBankStatus('Falha ao exportar banco ISPC.');
        }
      });
    }

    if (ispcBankResetBtn && bank) {
      ispcBankResetBtn.addEventListener('click', async () => {
        if (!confirm('Deseja limpar o banco ISPC local deste navegador?')) return;
        try {
          await bank.clearISPCRecords();
          await refreshBankStatus();
          await refreshIspcHistoryFromBank();
        } catch (err) {
          console.error('Falha ao limpar banco ISPC:', err);
          setBankStatus('Falha ao limpar banco ISPC.');
        }
      });
    }

    if (ispcHistoryFileEl) {
      ispcHistoryFileEl.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
          ispcHistory = null;
          if (ispcForecastCardEl) ispcForecastCardEl.classList.add('lt-hidden');
          return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
          const txt = String(evt.target.result || '');
          ispcHistory = parseCSVText(txt);
          if (ispcForecastCardEl) ispcForecastCardEl.classList.add('lt-hidden');
        };
        reader.readAsText(file);
      });
    }

    if (enableFuzzyEl && fuzzyFieldsEl) {
      const sync = () => {
        fuzzyFieldsEl.classList.toggle('lt-hidden', !enableFuzzyEl.checked);

        const mode = fuzzyModelEl ? String(fuzzyModelEl.value) : 'operational';
        if (fuzzyOperationalWrapEl) {
          fuzzyOperationalWrapEl.classList.toggle('lt-hidden', mode !== 'operational');
        }
        if (fuzzyISPCReducedWrapEl) {
          fuzzyISPCReducedWrapEl.classList.toggle('lt-hidden', mode !== 'ispc_reduced');
        }
      };
      enableFuzzyEl.addEventListener('change', sync);
      enableFuzzyEl.addEventListener('input', sync);
      if (fuzzyModelEl) {
        fuzzyModelEl.addEventListener('change', sync);
        fuzzyModelEl.addEventListener('input', sync);
      }
      sync();
    }

    calculateBtn.addEventListener('click', () => {
      try {
        const tillage = document.getElementById('tillage-system').value;
        const crop = document.getElementById('previous-crop').value;
        const years = Math.max(parseInt(document.getElementById('years').value, 10) || 0, 1);

        const Calculator = getCalculator();
        if (!Calculator) {
          throw new Error('Calculadora SQ indisponível');
        }

        const calculator = new Calculator();
        const sq = calculator.calculateSQ(tillage, crop, years);
        const recommendations = calculator.generateRecommendations();

        safeText(sqResultEl, formatNumberPtBR(sq));

        if (recList) {
          recList.innerHTML = '';
          recommendations.forEach((rec) => {
            const li = document.createElement('li');
            li.textContent = rec;
            recList.appendChild(li);
          });
        }

        let fuzzyOperationalPayload = null;
        let fuzzyISPCReducedPayload = null;

        const fuzzy = (typeof window !== 'undefined') ? window.ICS_Fuzzy : null;
        const mode = fuzzyModelEl ? String(fuzzyModelEl.value) : 'operational';

        if (fuzzy && (
          (mode === 'operational' && typeof fuzzy.evaluate === 'function')
          || (mode === 'ispc_reduced' && typeof fuzzy.evaluateISPCReduced === 'function')
        )) {
          const enabled = Boolean(enableFuzzyEl && enableFuzzyEl.checked);

          if (mode === 'operational') {
            const cov = parseNumberPtBR(document.getElementById('user-coverage')?.value);
            const slope = parseNumberPtBR(document.getElementById('user-slope')?.value);
            const infil = parseNumberPtBR(document.getElementById('user-infiltration')?.value);
            const om = parseNumberPtBR(document.getElementById('user-om')?.value);
            const bd = parseNumberPtBR(document.getElementById('user-bd')?.value);
            const agg = parseNumberPtBR(document.getElementById('user-agg')?.value);

            const anyField = [cov, slope, infil, om, bd, agg].some((v) => v !== null);
            if (enabled || anyField) {
              fuzzyOperationalPayload = fuzzy.evaluate({
                coveragePct: cov,
                slopePct: slope,
                infiltrationMmH: infil,
                organicMatterPct: om,
                bulkDensity: bd,
                aggregateStabilityPct: agg
              });

              if (fuzzyTitleEl) fuzzyTitleEl.textContent = 'Diagnóstico operacional (fuzzy)';
              if (fuzzyHintEl) fuzzyHintEl.textContent = 'Prioridade operacional estimada a partir dos dados do talhão e regras fuzzy.';

              if (fuzzyCardEl) fuzzyCardEl.classList.remove('lt-hidden');

              if (fuzzyResultEl) {
                const scoreTxt = Number.isFinite(fuzzyOperationalPayload.priorityScore) ? ` (${formatNumberPtBR(fuzzyOperationalPayload.priorityScore)}/100)` : '';
                fuzzyResultEl.textContent = `Prioridade ${fuzzyOperationalPayload.priorityLabel}${scoreTxt}`;
              }

              if (fuzzyExplainEl) {
                if (fuzzyOperationalPayload.drivers && fuzzyOperationalPayload.drivers.length) {
                  const top = fuzzyOperationalPayload.drivers
                    .map((d) => `${d.tag}`)
                    .join('; ');
                  fuzzyExplainEl.textContent = `Gatilhos dominantes: ${top}.`;
                } else {
                  fuzzyExplainEl.textContent = 'Sem gatilhos dominantes com os dados informados.';
                }
              }

              if (fuzzyRecListEl) {
                fuzzyRecListEl.innerHTML = '';
                (fuzzyOperationalPayload.recommendations || []).forEach((rec) => {
                  const li = document.createElement('li');
                  li.textContent = rec;
                  fuzzyRecListEl.appendChild(li);
                });
              }
            } else if (fuzzyCardEl) {
              fuzzyCardEl.classList.add('lt-hidden');
            }
          }

          if (mode === 'ispc_reduced') {
            const read = (id) => parseNumberPtBR(document.getElementById(id)?.value);
            const reducedInputs = {
              dmg: read('ispcR-dmg'),
              estoque_c: read('ispcR-estoque-c'),
              na: read('ispcR-na'),
              icv: read('ispcR-icv'),
              altura: read('ispcR-altura'),
              diam_espiga: read('ispcR-diam-espiga'),
              comp_espiga: read('ispcR-comp-espiga'),
              n_plantas: read('ispcR-n-plantas'),
              n_espigas: read('ispcR-n-espigas'),
              produtividade: read('ispcR-produtividade')
            };

            const anyField = Object.values(reducedInputs).some((v) => v !== null);
            if (enabled || anyField) {
              const depthTag = ispcDepthEl ? String(ispcDepthEl.value || 'dados_010') : 'dados_010';
              fuzzyISPCReducedPayload = fuzzy.evaluateISPCReduced(reducedInputs, { depthTag });

              if (bank && fuzzyISPCReducedPayload && fuzzyISPCReducedPayload.rawInputs) {
                const cropNorm = normalizeCropForISPCRecords(document.getElementById('previous-crop')?.value);
                const tillageSys = String(document.getElementById('tillage-system')?.value || '').toUpperCase();
                const ano = new Date().getFullYear();
                const profundidade_cm = depthTagToCM(depthTag);

                const raw15 = fuzzyISPCReducedPayload.rawInputs;
                bank.addISPCRecord({
                  ano,
                  profundidade_cm,
                  parcela: tillageSys,
                  cultura: cropNorm,
                  dmg: raw15.dmg,
                  dmp: raw15.dmp,
                  rmp: raw15.rmp,
                  densidade: raw15.densidade,
                  estoque_c: raw15.estoque_c,
                  na: raw15.na,
                  icv: raw15.icv,
                  altura: raw15.altura,
                  diam_espiga: raw15.diam_espiga,
                  comp_espiga: raw15.comp_espiga,
                  n_plantas: raw15.n_plantas,
                  n_espigas: raw15.n_espigas,
                  n_espigas_com: raw15.n_espigas_com,
                  peso_espigas: raw15.peso_espigas,
                  produtividade: raw15.produtividade,
                }).then(() => {
                  refreshBankStatus();
                  refreshIspcHistoryFromBank();
                }).catch(() => { /* ignore */ });
              }

              // Aprendizado automático em background usando apenas os 10 campos já existentes.
              // O score fuzzy atua como professor, permitindo aquecimento do modelo online sem histórico.
              if (typeof window !== 'undefined' && window.ICSML && typeof window.ICSML.getOrCreateRegressorModel === 'function') {
                const x = [
                  reducedInputs.dmg,
                  reducedInputs.estoque_c,
                  reducedInputs.na,
                  reducedInputs.icv,
                  reducedInputs.altura,
                  reducedInputs.diam_espiga,
                  reducedInputs.comp_espiga,
                  reducedInputs.n_plantas,
                  reducedInputs.n_espigas,
                  reducedInputs.produtividade,
                ];
                if (x.every(Number.isFinite) && fuzzyISPCReducedPayload && Number.isFinite(fuzzyISPCReducedPayload.score)) {
                  const modelKey = `ispc_reduced_index_${String(depthTag || 'dados_010')}`;
                  const model = window.ICSML.getOrCreateRegressorModel(modelKey, 10, { learningRate: 0.03, l2: 0.0005 });
                  if (model) {
                    model.partialFit(x, Math.max(0, Math.min(10, fuzzyISPCReducedPayload.score)));
                    model.save();
                  }
                }
              }

              if (fuzzyTitleEl) fuzzyTitleEl.textContent = 'ISPC (fuzzy)';
              if (fuzzyHintEl) {
                const kind = fuzzyISPCReducedPayload.estimationKind === 'ml_ridge' ? 'modelo ML' : 'modelo linear';
                const depthTxt = (depthTag === 'dados_1020') ? '10–20 cm' : '0–10 cm';
                fuzzyHintEl.textContent = `Índice ISPC (0–10) com 10 variáveis informadas e 5 estimadas por ${kind} (profundidade ${depthTxt}).`;
              }

              if (fuzzyCardEl) fuzzyCardEl.classList.remove('lt-hidden');

              if (fuzzyResultEl) {
                if (Number.isFinite(fuzzyISPCReducedPayload.score)) {
                  fuzzyResultEl.textContent = `ISPC ${fuzzyISPCReducedPayload.classLabel} (${formatNumberPtBR(fuzzyISPCReducedPayload.score)}/10)`;
                } else {
                  fuzzyResultEl.textContent = 'Indeterminado';
                }
              }

              if (fuzzyExplainEl) {
                if (fuzzyISPCReducedPayload.missingReducedInputs && fuzzyISPCReducedPayload.missingReducedInputs.length) {
                  fuzzyExplainEl.textContent = `Faltam entradas para calcular (modo reduzido): ${fuzzyISPCReducedPayload.missingReducedInputs.join(', ')}.`;
                } else if (fuzzyISPCReducedPayload.topRules && fuzzyISPCReducedPayload.topRules.length) {
                  const rs = fuzzyISPCReducedPayload.topRules
                    .map((r) => `R${r.idx} (força ${formatNumberPtBR(r.strength)})`)
                    .join(' | ');
                  fuzzyExplainEl.textContent = `Regras mais ativadas: ${rs}.`;
                } else {
                  fuzzyExplainEl.textContent = 'Sem regras ativadas com os dados informados.';
                }
              }

              if (fuzzyRecListEl) {
                fuzzyRecListEl.innerHTML = '';
                if (fuzzyISPCReducedPayload.missingReducedInputs && fuzzyISPCReducedPayload.missingReducedInputs.length) {
                  const li = document.createElement('li');
                  li.textContent = 'Preencha todas as 10 variáveis do modo reduzido para obter o ISPC.';
                  fuzzyRecListEl.appendChild(li);
                } else {
                  const li = document.createElement('li');
                  const est = (fuzzyISPCReducedPayload.estimatedRawInputs && fuzzyISPCReducedPayload.estimatedRawInputs.length)
                    ? `Variáveis estimadas: ${fuzzyISPCReducedPayload.estimatedRawInputs.join(', ')}.`
                    : 'Algumas variáveis podem ser estimadas no modo reduzido.';
                  li.textContent = `Modelo ISPC: use o PDF para registrar entradas, estimativas e score. ${est}`;
                  fuzzyRecListEl.appendChild(li);
                }
              }

              // Projeção de 10 anos a partir do histórico carregado (quando houver coluna ano)
              const historySource = (ispcHistory && ispcHistory.rows && ispcHistory.rows.length)
                ? ispcHistory
                : (ispcHistoryFromBank && ispcHistoryFromBank.rows && ispcHistoryFromBank.rows.length ? ispcHistoryFromBank : null);

              if (ispcForecastCardEl && historySource && historySource.rows && historySource.rows.length && typeof Chart !== 'undefined') {
                const cropNorm = normalizeCropForISPCRecords(document.getElementById('previous-crop')?.value);
                const tillageSys = String(document.getElementById('tillage-system')?.value || '').toUpperCase();
                const depthTag = ispcDepthEl ? String(ispcDepthEl.value || 'dados_010') : 'dados_010';
                const depthFilter = (depthTag === 'dados_1020') ? '10-20' : '0-10';

                const rows = historySource.rows
                  .map((r) => ({
                    ...r,
                    ano: Number.parseInt(r.ano, 10),
                    profundidade_cm: String(r.profundidade_cm || '').trim(),
                    parcela: String(r.parcela || '').trim().toUpperCase(),
                    cultura: String(r.cultura || '').trim()
                  }))
                  .filter((r) => Number.isFinite(r.ano) && r.parcela === tillageSys && (!cropNorm || r.cultura === cropNorm) && r.profundidade_cm === depthFilter);

                // Agregar por ano com score via ML
                const byYear = {};
                for (const r of rows) {
                  const score = computeISPCScoreFromRow(r, depthTag, fuzzy);
                  if (!Number.isFinite(score)) continue;
                  byYear[r.ano] = byYear[r.ano] || [];
                  byYear[r.ano].push(score);
                }

                const years = Object.keys(byYear).map((k) => Number.parseInt(k, 10)).filter(Number.isFinite).sort((a, b) => a - b);
                const hist = years.map((y) => byYear[y].reduce((a, b) => a + b, 0) / byYear[y].length);

                if (years.length >= 3) {
                  const lr = fitLinearRegression(years, hist);
                  const lastYear = years[years.length - 1];

                  const fYears = [];
                  const fVals = [];
                  for (let i = 1; i <= 10; i += 1) {
                    const yy = lastYear + i;
                    fYears.push(yy);
                    const pred = lr.intercept + lr.slope * yy;
                    fVals.push(Math.max(0, Math.min(10, pred)));
                  }

                  const chartStore = window.ICSCharts || (window.ICSCharts = {});
                  if (chartStore.ispcForecastChart) chartStore.ispcForecastChart.destroy();

                  const ctxEl = document.getElementById('ispc-forecast-chart');
                  if (ctxEl) {
                    chartStore.ispcForecastChart = new Chart(ctxEl, {
                      type: 'line',
                      data: {
                        labels: years.concat(fYears),
                        datasets: [
                          {
                            label: 'ISPC observado (histórico)',
                            data: hist.concat(Array(fYears.length).fill(null)),
                            borderColor: '#1565c0',
                            backgroundColor: 'rgba(21, 101, 192, 0.1)',
                            tension: 0.25
                          },
                          {
                            label: 'ISPC projetado (10 anos)',
                            data: Array(hist.length).fill(null).concat(fVals),
                            borderColor: '#2e7d32',
                            backgroundColor: 'rgba(46, 125, 50, 0.1)',
                            borderDash: [6, 4],
                            tension: 0.25
                          }
                        ]
                      },
                      options: {
                        responsive: true,
                        plugins: {
                          title: {
                            display: true,
                            text: 'Projeção do ISPC sob manutenção do manejo'
                          }
                        },
                        scales: {
                          y: { min: 0, max: 10 }
                        }
                      }
                    });
                  }

                  const lastPred = fVals[fVals.length - 1];
                  if (ispcForecastResultEl) ispcForecastResultEl.textContent = `ISPC projetado em ${fYears[fYears.length - 1]}: ${formatNumberPtBR(lastPred)}/10`;
                  if (ispcForecastExplainEl) {
                    const slopeTxt = Number.isFinite(lr.slope) ? formatNumberPtBR(lr.slope) : '';
                    const src = (historySource === ispcHistoryFromBank) ? 'banco local' : 'CSV';
                    ispcForecastExplainEl.textContent = `Tendência linear estimada no histórico filtrado, com variação anual aproximada de ${slopeTxt} pontos por ano (limitada a 0–10), usando ${src} como fonte.`;
                  }
                  ispcForecastCardEl.classList.remove('lt-hidden');
                } else {
                  if (ispcForecastResultEl) ispcForecastResultEl.textContent = 'Indeterminado';
                  if (ispcForecastExplainEl) ispcForecastExplainEl.textContent = 'Histórico insuficiente após o filtro. Envie um CSV ou alimente o banco local com pelo menos 3 anos válidos para parcela, cultura e profundidade selecionadas.';
                  ispcForecastCardEl.classList.remove('lt-hidden');
                }
              }
            } else if (fuzzyCardEl) {
              fuzzyCardEl.classList.add('lt-hidden');
            }
          }
        } else if (fuzzyCardEl) {
          fuzzyCardEl.classList.add('lt-hidden');
        }

        const chartData = buildChartData(tillage, crop, years);
        if (chartData && typeof window.renderHistoricalCharts === 'function') {
          window.renderHistoricalCharts(chartData);
        }

        if (resultsSection) {
          resultsSection.style.display = 'block';
        }

        lastReportData = {
          startYear: 1,
          endYear: years,
          results: (chartData ? chartData.years : [years]).map((year, idx) => ({
            year,
            tillageSystem: tillage,
            crop,
            sq: chartData ? chartData.sqValues[idx] : sq
          })),
          conclusions: recommendations.join('\n'),
          // Compatibilidade: mantemos data.fuzzy com o operacional
          fuzzy: fuzzyOperationalPayload,
          fuzzyOperational: fuzzyOperationalPayload,
          fuzzyISPCReduced: fuzzyISPCReducedPayload
        };
      } catch (error) {
        console.error(error);
        alert(`Falha ao calcular SQ. ${error && error.message ? error.message : ''}`);
      }
    });

    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        if (!lastReportData) {
          alert('Calcule o índice SQ antes de gerar o PDF.');
          return;
        }
        if (typeof window.generateLongTermPDF !== 'function') {
          alert('Gerador de PDF indisponível.');
          return;
        }
        try {
          window.generateLongTermPDF(lastReportData);
        } catch (error) {
          console.error(error);
          alert(`Falha ao gerar PDF. ${error && error.message ? error.message : ''}`);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLongTermUI();
  });
})();
