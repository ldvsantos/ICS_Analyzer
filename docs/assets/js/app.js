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

  function safeText(el, text) {
    if (!el) return;
    el.textContent = String(text);
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
              fuzzyISPCReducedPayload = fuzzy.evaluateISPCReduced(reducedInputs, { depthTag: 'dados_010' });

              if (fuzzyTitleEl) fuzzyTitleEl.textContent = 'ISPC (fuzzy)';
              if (fuzzyHintEl) fuzzyHintEl.textContent = 'Índice ISPC (0–10) com 10 variáveis informadas e 5 estimadas por modelos (calibração 0–10 cm).';

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
