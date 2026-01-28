// Módulo principal de cálculos do ICS Analyzer
const researchCoeffs = require('./ics_analyzer_research_coefficients');

class ICS_Calculator {
  constructor() {
    this.results = {
      sqIndex: null,
      recommendations: []
    };
  }

  /**
   * Calcula o Índice de Qualidade Estrutural (SQ) com base em:
   * @param {string} tillageSystem - Sistema de preparo (CT, MT, NT)
   * @param {string} previousCrop - Cultura anterior
   * @param {number} years - Anos de manejo
   */
  calculateSQ(tillageSystem, previousCrop, years) {
    this.results.sqIndex = researchCoeffs.getSQ(
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

module.exports = ICS_Calculator;