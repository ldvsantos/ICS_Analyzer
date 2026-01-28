// Modelo fuzzy operacional para diagnóstico e recomendação
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ICS_Fuzzy = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function trapmf(x, a, b, c, d) {
    if (x <= a) return 0;
    if (x >= d) return 0;
    if (x >= b && x <= c) return 1;
    if (x > a && x < b) return (x - a) / (b - a);
    return (d - x) / (d - c);
  }

  function trimf(x, a, b, c) {
    if (x <= a) return 0;
    if (x >= c) return 0;
    if (x === b) return 1;
    if (x > a && x < b) return (x - a) / (b - a);
    return (c - x) / (c - b);
  }

  function normalizeInput(v, min, max) {
    if (!Number.isFinite(v)) return null;
    return Math.max(min, Math.min(max, v));
  }

  function membershipCoverage(pct) {
    const x = normalizeInput(pct, 0, 100);
    if (x === null) return null;
    return {
      low: trapmf(x, 0, 0, 30, 50),
      medium: trimf(x, 30, 55, 80),
      high: trapmf(x, 60, 80, 100, 100)
    };
  }

  function membershipSlope(pct) {
    const x = normalizeInput(pct, 0, 50);
    if (x === null) return null;
    return {
      low: trapmf(x, 0, 0, 2, 5),
      medium: trimf(x, 3, 8, 15),
      high: trapmf(x, 12, 20, 50, 50)
    };
  }

  function membershipInfiltration(mmH) {
    const x = normalizeInput(mmH, 0, 200);
    if (x === null) return null;
    return {
      low: trapmf(x, 0, 0, 5, 12),
      medium: trimf(x, 8, 18, 35),
      high: trapmf(x, 25, 45, 200, 200)
    };
  }

  function membershipOM(omPct) {
    const x = normalizeInput(omPct, 0, 10);
    if (x === null) return null;
    return {
      low: trapmf(x, 0, 0, 1.0, 2.0),
      medium: trimf(x, 1.5, 2.8, 4.0),
      high: trapmf(x, 3.2, 4.5, 10, 10)
    };
  }

  function membershipBulkDensity(gCm3) {
    const x = normalizeInput(gCm3, 0.8, 2.0);
    if (x === null) return null;
    return {
      low: trapmf(x, 0.8, 0.8, 1.05, 1.20),
      medium: trimf(x, 1.10, 1.30, 1.50),
      high: trapmf(x, 1.40, 1.55, 2.0, 2.0)
    };
  }

  function membershipAggregates(pct) {
    const x = normalizeInput(pct, 0, 100);
    if (x === null) return null;
    return {
      low: trapmf(x, 0, 0, 30, 50),
      medium: trimf(x, 40, 65, 85),
      high: trapmf(x, 70, 85, 100, 100)
    };
  }

  function outLow(y) {
    return trapmf(y, 0, 0, 20, 40);
  }

  function outMedium(y) {
    return trimf(y, 30, 50, 70);
  }

  function outHigh(y) {
    return trapmf(y, 60, 80, 100, 100);
  }

  function centroid(agg, step) {
    const dx = step || 1;
    let num = 0;
    let den = 0;
    for (let y = 0; y <= 100; y += dx) {
      const mu = agg(y);
      num += y * mu;
      den += mu;
    }
    if (den === 0) return null;
    return num / den;
  }

  function classifyPriority(score) {
    if (!Number.isFinite(score)) return { label: 'Indeterminado', className: 'na' };
    if (score < 35) return { label: 'Baixa', className: 'low' };
    if (score < 65) return { label: 'Moderada', className: 'medium' };
    return { label: 'Alta', className: 'high' };
  }

  function evaluate(inputs) {
    const cov = membershipCoverage(inputs.coveragePct);
    const slope = membershipSlope(inputs.slopePct);
    const infil = membershipInfiltration(inputs.infiltrationMmH);
    const om = membershipOM(inputs.organicMatterPct);
    const bd = membershipBulkDensity(inputs.bulkDensity);
    const agg = membershipAggregates(inputs.aggregateStabilityPct);

    const available = { cov, slope, infil, om, bd, agg };

    const get = (k, term) => {
      const obj = available[k];
      if (!obj) return null;
      return obj[term];
    };

    const rules = [];

    const r1 = (() => {
      const a = get('cov', 'low');
      const b = get('infil', 'low');
      const c = get('slope', 'high');
      if (a === null || b === null) return null;
      const strength = Math.max(Math.min(a, b), c === null ? 0 : Math.min(a, c));
      return { strength, out: 'high', tag: 'cobertura baixa e infiltração baixa ou declividade elevada' };
    })();
    if (r1) rules.push(r1);

    const r2 = (() => {
      const a = get('bd', 'high');
      const b = get('agg', 'low');
      if (a === null) return null;
      const strength = b === null ? a : Math.min(a, b);
      return { strength, out: 'high', tag: 'densidade elevada com agregação fraca' };
    })();
    if (r2) rules.push(r2);

    const r3 = (() => {
      const a = get('om', 'low');
      const b = get('cov', 'medium');
      if (a === null) return null;
      const strength = b === null ? a : Math.min(a, b);
      return { strength, out: 'medium', tag: 'matéria orgânica baixa com cobertura intermediária' };
    })();
    if (r3) rules.push(r3);

    const r4 = (() => {
      const a = get('cov', 'high');
      const b = get('infil', 'high');
      const c = get('bd', 'low');
      if (a === null && b === null && c === null) return null;
      const parts = [a, b, c].filter((v) => v !== null);
      if (parts.length === 0) return null;
      const strength = parts.reduce((m, v) => Math.min(m, v), 1);
      return { strength, out: 'low', tag: 'condição conservacionista consistente' };
    })();
    if (r4) rules.push(r4);

    const r5 = (() => {
      const a = get('slope', 'medium');
      const b = get('cov', 'low');
      if (a === null || b === null) return null;
      const strength = Math.min(a, b);
      return { strength, out: 'medium', tag: 'declividade moderada com baixa cobertura' };
    })();
    if (r5) rules.push(r5);

    const r6 = (() => {
      const a = get('agg', 'high');
      const b = get('om', 'high');
      if (a === null && b === null) return null;
      const parts = [a, b].filter((v) => v !== null);
      const strength = parts.reduce((m, v) => Math.min(m, v), 1);
      return { strength, out: 'low', tag: 'estabilidade estrutural elevada' };
    })();
    if (r6) rules.push(r6);

    const active = rules.filter((r) => r.strength > 0.001);

    const aggOut = (y) => {
      let mu = 0;
      for (const r of active) {
        if (r.out === 'low') mu = Math.max(mu, Math.min(r.strength, outLow(y)));
        else if (r.out === 'medium') mu = Math.max(mu, Math.min(r.strength, outMedium(y)));
        else mu = Math.max(mu, Math.min(r.strength, outHigh(y)));
      }
      return clamp01(mu);
    };

    const score = centroid(aggOut, 1);
    const cls = classifyPriority(score);

    const drivers = active
      .slice()
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map((r) => ({ tag: r.tag, strength: r.strength }));

    const recs = [];
    const covLow = get('cov', 'low');
    const infilLow = get('infil', 'low');
    const bdHigh = get('bd', 'high');
    const aggLow = get('agg', 'low');
    const slopeHigh = get('slope', 'high');
    const omLow = get('om', 'low');

    if (covLow !== null && covLow > 0.4) {
      recs.push('Aumentar cobertura superficial e reduzir exposição do solo por palhada e plantas de cobertura');
    }
    if ((infilLow !== null && infilLow > 0.4) || (bdHigh !== null && bdHigh > 0.4)) {
      recs.push('Mitigar compactação e recuperar porosidade com tráfego controlado, raízes agressivas e manejo de umidade de operação');
    }
    if (aggLow !== null && aggLow > 0.4) {
      recs.push('Fortalecer estabilidade estrutural com aporte contínuo de resíduos e rotação com adubação verde');
    }
    if (slopeHigh !== null && slopeHigh > 0.4) {
      recs.push('Reduzir conectividade do escoamento superficial com práticas em contorno e barreiras vegetadas em microdepressões');
    }
    if (omLow !== null && omLow > 0.4) {
      recs.push('Elevar matéria orgânica por intensificação de biomassa e mínima perturbação do solo');
    }

    if (recs.length === 0) {
      recs.push('Manter práticas conservacionistas e monitorar tendência por séries temporais e reamostragem periódica');
    }

    return {
      priorityScore: score,
      priorityLabel: cls.label,
      priorityClassName: cls.className,
      drivers,
      recommendations: recs,
      inputsUsed: {
        coveragePct: normalizeInput(inputs.coveragePct, 0, 100),
        slopePct: normalizeInput(inputs.slopePct, 0, 50),
        infiltrationMmH: normalizeInput(inputs.infiltrationMmH, 0, 200),
        organicMatterPct: normalizeInput(inputs.organicMatterPct, 0, 10),
        bulkDensity: normalizeInput(inputs.bulkDensity, 0.8, 2.0),
        aggregateStabilityPct: normalizeInput(inputs.aggregateStabilityPct, 0, 100)
      }
    };
  }

  return {
    evaluate
  };
});
