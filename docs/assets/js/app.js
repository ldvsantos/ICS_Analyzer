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

// ================ ANÁLISE DE LONGO PRAZO (SQ) ================ //

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
    const fuzzyCardEl = document.getElementById('fuzzy-card');
    const fuzzyResultEl = document.getElementById('fuzzy-result');
    const fuzzyExplainEl = document.getElementById('fuzzy-explain');
    const fuzzyRecListEl = document.getElementById('fuzzy-recommendations');

    if (enableFuzzyEl && fuzzyFieldsEl) {
      const sync = () => {
        fuzzyFieldsEl.style.display = enableFuzzyEl.checked ? 'block' : 'none';
      };
      enableFuzzyEl.addEventListener('change', sync);
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

        let fuzzyPayload = null;
        if (typeof window !== 'undefined' && window.ICS_Fuzzy && typeof window.ICS_Fuzzy.evaluate === 'function') {
          const cov = parseNumberPtBR(document.getElementById('user-coverage')?.value);
          const slope = parseNumberPtBR(document.getElementById('user-slope')?.value);
          const infil = parseNumberPtBR(document.getElementById('user-infiltration')?.value);
          const om = parseNumberPtBR(document.getElementById('user-om')?.value);
          const bd = parseNumberPtBR(document.getElementById('user-bd')?.value);
          const agg = parseNumberPtBR(document.getElementById('user-agg')?.value);

          const anyField = [cov, slope, infil, om, bd, agg].some((v) => v !== null);
          const enabled = Boolean(enableFuzzyEl && enableFuzzyEl.checked);

          if (enabled || anyField) {
            fuzzyPayload = window.ICS_Fuzzy.evaluate({
              coveragePct: cov,
              slopePct: slope,
              infiltrationMmH: infil,
              organicMatterPct: om,
              bulkDensity: bd,
              aggregateStabilityPct: agg
            });

            if (fuzzyCardEl) {
              fuzzyCardEl.style.display = 'block';
            }

            if (fuzzyResultEl) {
              const scoreTxt = Number.isFinite(fuzzyPayload.priorityScore) ? ` (${formatNumberPtBR(fuzzyPayload.priorityScore)}/100)` : '';
              fuzzyResultEl.textContent = `Prioridade ${fuzzyPayload.priorityLabel}${scoreTxt}`;
            }

            if (fuzzyExplainEl) {
              if (fuzzyPayload.drivers && fuzzyPayload.drivers.length) {
                const top = fuzzyPayload.drivers
                  .map((d) => `${d.tag}`)
                  .join('; ');
                fuzzyExplainEl.textContent = `Gatilhos dominantes: ${top}.`;
              } else {
                fuzzyExplainEl.textContent = 'Sem gatilhos dominantes com os dados informados.';
              }
            }

            if (fuzzyRecListEl) {
              fuzzyRecListEl.innerHTML = '';
              (fuzzyPayload.recommendations || []).forEach((rec) => {
                const li = document.createElement('li');
                li.textContent = rec;
                fuzzyRecListEl.appendChild(li);
              });
            }
          } else if (fuzzyCardEl) {
            fuzzyCardEl.style.display = 'none';
          }
        } else if (fuzzyCardEl) {
          fuzzyCardEl.style.display = 'none';
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
          fuzzy: fuzzyPayload
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
