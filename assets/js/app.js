// Integração da interface para módulos do ICS Analyzer
(function () {
  function getCalculator() {
    if (typeof window !== 'undefined' && window.ICS_Calculator) {
      return window.ICS_Calculator;
    }
    if (typeof require === 'function') {
      try {
        return require('./ics_analyzer_calc');
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function buildChartData(tillage, crop, years) {
    if (!window.ICSResearchCoefficients) {
      return null;
    }

    const yearsList = [];
    const sqValues = [];
    for (let y = 1; y <= years; y += 1) {
      yearsList.push(y);
      sqValues.push(window.ICSResearchCoefficients.getSQ(tillage, crop, y));
    }

    const tillageKeys = ['CT', 'MT', 'NT'];
    const tillageSystems = {};
    tillageKeys.forEach((system) => {
      const values = yearsList.map(year => window.ICSResearchCoefficients.getSQ(system, crop, year));
      const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
      tillageSystems[system] = Number.isFinite(avg) ? Number(avg.toFixed(3)) : 0;
    });

    return {
      years: yearsList,
      sqValues,
      tillageSystems
    };
  }

  function initLongTermUI() {
    const calculateBtn = document.getElementById('calculate-btn');
    if (!calculateBtn) {
      return;
    }

    const resultsSection = document.getElementById('results-section');
    const sqResult = document.getElementById('sq-result');
    const recList = document.getElementById('recommendations');
    const pdfBtn = document.getElementById('generate-pdf');

    let lastReportData = null;

    calculateBtn.addEventListener('click', () => {
      const tillage = document.getElementById('tillage-system').value;
      const crop = document.getElementById('previous-crop').value;
      const years = Math.max(parseInt(document.getElementById('years').value, 10) || 0, 1);

      const Calculator = getCalculator();
      if (!Calculator) {
        return;
      }

      const calculator = new Calculator();
      const sq = calculator.calculateSQ(tillage, crop, years);
      const recommendations = calculator.generateRecommendations();

      if (sqResult) {
        sqResult.textContent = sq.toFixed(2);
      }

      if (recList) {
        recList.innerHTML = '';
        recommendations.forEach(rec => {
          const li = document.createElement('li');
          li.textContent = rec;
          recList.appendChild(li);
        });
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
        results: chartData.years.map((year, idx) => ({
          year,
          tillageSystem: tillage,
          crop,
          sq: chartData.sqValues[idx]
        })),
        conclusions: recommendations.join('\n')
      };
    });

    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        if (lastReportData && typeof window.generateLongTermPDF === 'function') {
          window.generateLongTermPDF(lastReportData);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLongTermUI();
  });
})();// Arquivo principal de integração
const ICS_Calculator = require('./ics_analyzer_calc');

// Inicialização do sistema
function initICSApp() {
  const calculator = new ICS_Calculator();
  
  // Exemplo de uso
  const tillageSystem = 'NT';
  const previousCrop = 'Pearl Millet';
  const years = 22;
  
  // Cálculos
  const sq = calculator.calculateSQ(tillageSystem, previousCrop, years);
  const recommendations = calculator.generateRecommendations();
  
  // Exibição de resultados
  console.log(`Índice SQ: ${sq.toFixed(2)}`);
  console.log('Recomendações:');
  recommendations.forEach(rec => console.log(`- ${rec}`));
  
  return {
    sq,
    recommendations
  };
}

// Inicia o aplicativo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  console.log('ICS Analyzer inicializado');
  
  // Configurar botão de cálculo
  const calculateBtn = document.getElementById('calculate-btn');
  if (calculateBtn) {
    calculateBtn.addEventListener('click', () => {
      const tillage = document.getElementById('tillage-system').value;
      const crop = document.getElementById('previous-crop').value;
      const years = parseInt(document.getElementById('years').value) || 0;
      
      const calculator = new ICS_Calculator();
      const sq = calculator.calculateSQ(tillage, crop, years);
      
      document.getElementById('sq-result').textContent = sq.toFixed(2);
      
      const recList = document.getElementById('recommendations');
      recList.innerHTML = '';
      calculator.generateRecommendations().forEach(rec => {
        const li = document.createElement('li');
        li.textContent = rec;
        recList.appendChild(li);
      });
    });
  }
});

// Inicialização para testes
module.exports = { initICSApp };