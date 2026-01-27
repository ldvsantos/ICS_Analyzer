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
