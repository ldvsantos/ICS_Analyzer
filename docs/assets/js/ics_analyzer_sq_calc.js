// Módulo de cálculo de SQ para Análise Conservacionista
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
    this.results.previousCrop = null;
    this.results.years = null;
    this.researchCoeffs = getResearchCoeffs();
  }

  calculateSQ(tillageSystem, previousCrop, years) {
    if (!this.researchCoeffs) {
      throw new Error('Coeficientes de pesquisa indisponíveis');
    }
    this.results.tillageSystem = String(tillageSystem || '').toUpperCase();
    this.results.previousCrop = previousCrop;
    this.results.years = years;
    this.results.sqIndex = this.researchCoeffs.getSQ(
      String(tillageSystem || '').toUpperCase(),
      previousCrop,
      years
    );
    return this.results.sqIndex;
  }

  format2(value) {
    if (!Number.isFinite(value)) return '';
    return value.toFixed(2);
  }

  getBestCropForCurrentSystem() {
    if (!this.researchCoeffs) return null;
    const sys = this.results.tillageSystem;
    const years = this.results.years;
    if (!sys || !Number.isFinite(years)) return null;

    const crops = Object.keys(this.researchCoeffs.cropFactors || {});
    const candidates = crops.filter((c) => c !== 'Control');
    if (!candidates.length) return null;

    let best = null;
    for (const crop of candidates) {
      const sq = this.researchCoeffs.getSQ(sys, crop, years);
      if (!Number.isFinite(sq)) continue;
      if (!best || sq < best.sq) best = { crop, sq };
    }
    return best;
  }

  getBestTillageForCurrentCrop() {
    if (!this.researchCoeffs) return null;
    const crop = this.results.previousCrop;
    const years = this.results.years;
    if (!crop || !Number.isFinite(years)) return null;

    const systems = Object.keys(this.researchCoeffs.tillageSystems || {});
    if (!systems.length) return null;

    let best = null;
    for (const sys of systems) {
      const sq = this.researchCoeffs.getSQ(sys, crop, years);
      if (!Number.isFinite(sq)) continue;
      if (!best || sq < best.sq) best = { system: sys, sq };
    }
    return best;
  }

  generateRecommendations() {
    this.results.recommendations = [];

    const sq = this.results.sqIndex;
    const sys = this.results.tillageSystem;
    const crop = this.results.previousCrop;
    const years = this.results.years;

    if (sq < 1.5) {
      this.results.recommendations.push('Excelente qualidade estrutural no cenário informado, manter práticas atuais e monitorar por reamostragem periódica');
    } else if (sq < 2.0) {
      this.results.recommendations.push('Boa qualidade no cenário informado, manter cobertura e reforçar rotação com plantas de cobertura para sustentar a tendência');
    } else {
      this.results.recommendations.push('Qualidade comprometida no cenário informado, priorizar práticas conservacionistas e redução de perturbação para recuperar estrutura');
    }

    const bestCrop = this.getBestCropForCurrentSystem();
    if (bestCrop && crop && Number.isFinite(sq) && bestCrop.crop !== crop && bestCrop.sq < sq) {
      this.results.recommendations.push(`Pelo modelo, a cultura com melhor desempenho no sistema ${sys} para ${years} anos é ${bestCrop.crop}, com SQ estimado ${this.format2(bestCrop.sq)} frente a ${this.format2(sq)} no cenário atual`);
    }

    const bestTillage = this.getBestTillageForCurrentCrop();
    if (bestTillage && sys && Number.isFinite(sq) && bestTillage.system !== sys && bestTillage.sq < sq) {
      this.results.recommendations.push(`Pelo modelo, o sistema de preparo com melhor desempenho para a cultura ${crop} em ${years} anos é ${bestTillage.system}, com SQ estimado ${this.format2(bestTillage.sq)} frente a ${this.format2(sq)} no sistema atual`);
    }

    return this.results.recommendations;
  }
}

if (typeof module === 'object' && module.exports) {
  module.exports = ICS_Calculator;
} else if (typeof window !== 'undefined') {
  window.ICS_Calculator = ICS_Calculator;
}
