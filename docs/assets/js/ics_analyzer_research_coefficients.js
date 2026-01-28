// Coeficientes baseados no artigo de Jussimara (2026)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ICSResearchCoefficients = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const researchCoefficients = {
    tillageSystems: {
      CT: { base: 2.5, decay: 0.01 },
      MT: { base: 1.8, decay: -0.005 },
      NT: { base: 1.2, decay: -0.002 }
    },

    cropFactors: {
      'Cowpea': 0.1,
      'Pigeon Pea': -0.05,
      'Sunn Hemp': 0.07,
      'Pearl Millet': -0.1,
      'Control': 0
    },

    getSQ: function (tillageSystem, previousCrop, years) {
      const system = this.tillageSystems[tillageSystem];
      const cropFactor = this.cropFactors[previousCrop] || 0;
      return system.base + (system.decay * years) + cropFactor;
    }
  };

  return researchCoefficients;
});
