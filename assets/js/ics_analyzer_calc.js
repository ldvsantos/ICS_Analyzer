// Módulo principal de cálculos do ICS Analyzer
function getResearchCoeffs() {
  if (typeof ICSResearchCoefficients !== 'undefined') {
    return ICSResearchCoefficients;
  }
  if (typeof require === 'function') {
    try {
      return require('./ics_analyzer_research_coefficients');
    } catch (error) {
      return null;
    }
  }
  return null;
}

class ICS_Calculator {
  constructor() {
    this.results = {
      sqIndex: null,
      recommendations: []
    };
    this.results.tillageSystem = null;
    this.researchCoeffs = getResearchCoeffs();
  }

  /**
   * Calcula o Índice de Qualidade Estrutural (SQ) com base em:
   * @param {string} tillageSystem - Sistema de preparo (CT, MT, NT)
   * @param {string} previousCrop - Cultura anterior
   * @param {number} years - Anos de manejo
   */
  calculateSQ(tillageSystem, previousCrop, years) {
    if (!this.researchCoeffs) {
      throw new Error('Coeficientes de pesquisa indisponíveis');
    }
    this.results.tillageSystem = tillageSystem.toUpperCase();
    this.results.sqIndex = this.researchCoeffs.getSQ(
      tillageSystem.toUpperCase(), 
      previousCrop, 
      years
    );
    return this.results.sqIndex;
  }

  /**
   * Gera recomendações com base no SQ calculado
   */
  generateRecommendations() {
    this.results.recommendations = [];
    
    if (this.results.sqIndex < 1.5) {
      this.results.recommendations.push("Excelente qualidade estrutural - manter práticas atuais");
    } else if (this.results.sqIndex < 2.0) {
      this.results.recommendations.push("Boa qualidade - considerar rotação com leguminosas");
    } else {
      this.results.recommendations.push(
        "Qualidade comprometida - implementar práticas conservacionistas urgentes"
      );
      this.results.recommendations.push(
        `Cultura recomendada: ${this.getOptimalCrop()}`
      );
    }
    
    return this.results.recommendations;
  }

  /**
   * Retorna a cultura ideal com base no sistema de preparo
   */
  getOptimalCrop() {
    const crops = {
      'CT': 'Sunn Hemp',
      'MT': 'Cowpea',
      'NT': 'Pearl Millet'
    };
    return crops[this.results.tillageSystem] || 'Adubação verde';
  }
}

if (typeof module === 'object' && module.exports) {
  module.exports = ICS_Calculator;
} else if (typeof window !== 'undefined') {
  window.ICS_Calculator = ICS_Calculator;
}