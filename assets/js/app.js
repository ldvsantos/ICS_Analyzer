// Arquivo principal de integração
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