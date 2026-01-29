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
    // Triangular MF com suporte a "ombro" quando a==b (ombro esquerdo)
    // ou b==c (ombro direito). Isso é necessário para parâmetros como
    // (0,0,5) e (5,10,10) usados no seu modelo em R.
    if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;

    // Degenerado
    if (a === b && b === c) return x === a ? 1 : 0;

    // Ombro esquerdo
    if (a === b) {
      if (x <= a) return 1;
      if (x >= c) return 0;
      return (c - x) / (c - b);
    }

    // Ombro direito
    if (b === c) {
      if (x >= c) return 1;
      if (x <= a) return 0;
      return (x - a) / (b - a);
    }

    // Triângulo padrão
    if (x <= a) return 0;
    if (x >= c) return 0;
    if (x === b) return 1;
    if (x > a && x < b) return (x - a) / (b - a);
    return (c - x) / (c - b);
  }

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  function normalizeInput(v, min, max) {
    if (!Number.isFinite(v)) return null;
    return Math.max(min, Math.min(max, v));
  }

  // ---------------------------------------------------------------------------
  // ISPC (modelo do seu script R "Fuzzy triangular.R")
  // - 15 entradas normalizadas para 0..10 por min-max global
  // - normalização invertida para RMP, Densidade e Na
  // - funções de pertinência triangulares iguais para todas as variáveis
  // - base de regras com pesos ajustados a partir de Produtividade, Estoque de C,
  //   Densidade e ICV
  // - defuzzificação por centróide
  // ---------------------------------------------------------------------------

  const ISPC_MINMAX = {
    dmg: { min: -0.6469518616592149, max: 6.298769999112172, invert: false },
    dmp: { min: -1.0085651234574193, max: 3.1530982246592427, invert: false },
    rmp: { min: -0.8191146707798682, max: 3.774827417705909, invert: true },
    densidade: { min: -1.2798731637867655, max: 4.786040977084525, invert: true },
    estoque_c: { min: -1.0541501752988582, max: 5.684333651659117, invert: false },
    na: { min: 0.7, max: 45.3, invert: true },
    icv: { min: -2.9500916541857793, max: 1.6590084585897358, invert: false },
    altura: { min: 1.5, max: 2.4, invert: false },
    diam_espiga: { min: 39.4, max: 57.6, invert: false },
    comp_espiga: { min: 15.6, max: 25.6, invert: false },
    n_plantas: { min: 10833.333333333334, max: 20166.666666666668, invert: false },
    n_espigas: { min: 9333.333333333334, max: 20666.666666666668, invert: false },
    n_espigas_com: { min: 1833.3333333333333, max: 13833.333333333334, invert: false },
    peso_espigas: { min: 366.6666666666667, max: 3500.0, invert: false },
    produtividade: { min: 1833.3333333333333, max: 13833.333333333334, invert: false }
  };

  const ISPC_INPUT_ORDER = [
    'dmg',
    'dmp',
    'rmp',
    'densidade',
    'estoque_c',
    'na',
    'icv',
    'altura',
    'diam_espiga',
    'comp_espiga',
    'n_plantas',
    'n_espigas',
    'n_espigas_com',
    'peso_espigas',
    'produtividade'
  ];

  function normalizeISPCValue(rawValue, spec) {
    // No script R, NA dispara retorno conservador em 5 na escala 0..10.
    if (!Number.isFinite(rawValue)) return 5;
    const minVal = spec.min;
    const maxVal = spec.max;
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return 5;
    const denom = maxVal - minVal;
    if (Math.abs(denom) < 1e-12) return 5;
    const x = spec.invert ? (10 * (maxVal - rawValue) / denom) : (10 * (rawValue - minVal) / denom);
    return clamp(x, 0, 10);
  }

  function ispcMFs(x) {
    // baixa: (0,0,5) | media: (0,5,10) | alta: (5,10,10)
    return {
      baixa: trimf(x, 0, 0, 5),
      media: trimf(x, 0, 5, 10),
      alta: trimf(x, 5, 10, 10)
    };
  }

  function ispcOutBaixa(y) {
    return trimf(y, 0, 0, 5);
  }

  function ispcOutMedia(y) {
    return trimf(y, 0, 5, 10);
  }

  function ispcOutAlta(y) {
    return trimf(y, 5, 10, 10);
  }

  function ispcClass(score0to10) {
    if (!Number.isFinite(score0to10)) return { label: 'Indeterminado', className: 'na' };
    if (score0to10 <= 3.3) return { label: 'Baixa', className: 'low' };
    if (score0to10 <= 6.6) return { label: 'Média', className: 'medium' };
    return { label: 'Alta', className: 'high' };
  }

  function centroidRange(agg, minY, maxY, step) {
    const dx = step || 0.1;
    let num = 0;
    let den = 0;
    for (let y = minY; y <= maxY; y += dx) {
      const mu = agg(y);
      num += y * mu;
      den += mu;
    }
    if (den === 0) return null;
    return num / den;
  }

  function buildISPCRules() {
    // Estrutura por linha: 15 antecedentes (1 baixa, 2 media, 3 alta),
    // saída (1 baixa, 2 media, 3 alta), peso, conector (1 AND)
    const base = [
      [1, 2, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 1],
      [2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1.0, 1],
      [3, 2, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1.2, 1],
      [3, 2, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1.1, 1],
      [3, 2, 2, 3, 1, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 2, 0.8, 1],
      [2, 2, 2, 3, 1, 3, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0.9, 1],
      [2, 2, 2, 2, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1.2, 1],
      [1, 2, 2, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1.2, 1],
      [3, 2, 2, 3, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 2, 0.8, 1],
      [2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1.2, 1],
      [2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0.8, 1],
      [2, 2, 2, 1, 3, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 3, 1.2, 1],
      [1, 2, 2, 3, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1.2, 1],
      [2, 2, 3, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1.2, 1],
      [2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1.2, 1],
      [1, 2, 3, 3, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 0.7, 1],
      [2, 2, 1, 1, 3, 2, 3, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0.9, 1],
      [3, 2, 3, 3, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 1],
      [1, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1.0, 1],
      [2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0.8, 1],
      [3, 2, 1, 1, 2, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 0.9, 1]
    ];

    // Ajuste do peso conforme o script R (coluna 15 produtividade, 5 estoque_c, 4 densidade, 7 icv)
    const out = base.map((r) => r.slice());
    for (const r of out) {
      const dens = r[3];
      const estc = r[4];
      const icv = r[6];
      const prod = r[14];

      let peso = 1.0;

      if (prod === 3) peso += 0.5;
      if (estc === 3) peso += 1.0;
      if (icv === 3) peso += 0.5;

      if (prod === 1) peso -= 0.5;
      if (dens === 1) peso -= 1.0;
      if (estc === 1) peso -= 0.5;
      if (icv === 1) peso -= 0.5;

      if (dens === 3) peso += 0.5;

      r[16] = clamp(peso, 0.6, 1.5);
    }
    return out;
  }

  const ISPC_RULES = buildISPCRules();

  function evaluateISPC(rawInputs) {
    const raw = rawInputs || {};
    const normalized = {};
    const mfs = {};
    const missingRawInputs = [];

    for (const key of ISPC_INPUT_ORDER) {
      const spec = ISPC_MINMAX[key];
      if (!Number.isFinite(raw[key])) missingRawInputs.push(key);
      const v = normalizeISPCValue(raw[key], spec);
      normalized[key] = v;
      mfs[key] = ispcMFs(v);
    }

    // No pipeline original em R, linhas com NA normalmente eram removidas antes da inferência.
    // Aqui, para manter robustez e transparência, exigimos as 15 entradas para produzir score.
    if (missingRawInputs.length) {
      return {
        score: null,
        classLabel: 'Indeterminado',
        className: 'na',
        normalizedInputs: normalized,
        topRules: [],
        missingRawInputs
      };
    }

    const mfByIndex = (obj, idx) => {
      if (idx === 1) return obj.baixa;
      if (idx === 2) return obj.media;
      return obj.alta;
    };

    const fired = [];

    for (let i = 0; i < ISPC_RULES.length; i += 1) {
      const rule = ISPC_RULES[i];
      const outIdx = rule[15];
      const weight = rule[16];

      let strength = 1;
      for (let j = 0; j < ISPC_INPUT_ORDER.length; j += 1) {
        const key = ISPC_INPUT_ORDER[j];
        const termIdx = rule[j];
        const mu = mfByIndex(mfs[key], termIdx);
        strength = Math.min(strength, mu);
        if (strength <= 1e-9) break;
      }

      strength = strength * weight;
      if (strength > 1e-6) fired.push({ idx: i + 1, strength, outIdx, weight });
    }

    const aggOut = (y) => {
      let mu = 0;
      for (const r of fired) {
        const outMu = (r.outIdx === 1) ? ispcOutBaixa(y) : (r.outIdx === 2) ? ispcOutMedia(y) : ispcOutAlta(y);
        mu = Math.max(mu, Math.min(r.strength, outMu));
      }
      return clamp01(mu);
    };

    const score = fired.length ? centroidRange(aggOut, 0, 10, 0.05) : null;
    const cls = ispcClass(score);

    const topRules = fired
      .slice()
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5);

    return {
      score,
      classLabel: cls.label,
      className: cls.className,
      normalizedInputs: normalized,
      topRules,
      missingRawInputs
    };
  }

  // ---------------------------------------------------------------------------
  // ISPC
  // - Usuário informa 10 variáveis
  // - 5 variáveis são estimadas por regressões lineares ajustadas no banco (0–10 cm)
  // - Em seguida, chamamos o mesmo evaluateISPC() com as 15 entradas completas
  // ---------------------------------------------------------------------------

  const ISPC_REDUCED_REQUIRED_INPUTS = [
    'dmg',
    'estoque_c',
    'na',
    'icv',
    'altura',
    'diam_espiga',
    'comp_espiga',
    'n_plantas',
    'n_espigas',
    'produtividade'
  ];

  const ISPC_REDUCED_MODELS_DADOS_010 = {
    dmp: { x: 'dmg', intercept: -0.021937873745388907, slope: 0.688446341712679, r2: 0.4874182990823875 },
    rmp: { x: 'dmg', intercept: -0.010968936872694486, slope: 0.8442231708563392, r2: 0.8511837787415898 },
    densidade: { x: 'estoque_c', intercept: -0.014961358359012156, slope: 0.9729424750943534, r2: 0.9452489917808462 },
    n_espigas_com: { x: 'produtividade', intercept: 0, slope: 1, r2: 1 },
    peso_espigas: { x: 'produtividade', intercept: -102.5840496920282, slope: 0.26059384298886884, r2: 0.9472933079831639 }
  };

  function getReducedMLModels() {
    if (typeof ISPC_ReducedMLModels !== 'undefined' && ISPC_ReducedMLModels) {
      return ISPC_ReducedMLModels;
    }
    if (typeof window !== 'undefined' && window.ISPC_ReducedMLModels) {
      return window.ISPC_ReducedMLModels;
    }
    if (typeof require === 'function') {
      try {
        // Node: mesmo diretório do fuzzy.js
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require('./ics_analyzer_ispc_reduced_ml_models.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function ridgePredict(reducedInputs, modelSpec) {
    if (!modelSpec || !modelSpec.ok) return null;
    const st = modelSpec.standardization;
    const mean = st && st.mean ? st.mean : {};
    const std = st && st.std ? st.std : {};

    let y = modelSpec.intercept;
    const weights = modelSpec.weights || {};
    for (const k of Object.keys(weights)) {
      const x = reducedInputs[k];
      if (!Number.isFinite(x)) return null;
      const m = Number.isFinite(mean[k]) ? mean[k] : 0;
      const s = Number.isFinite(std[k]) && std[k] !== 0 ? std[k] : 1;
      y += weights[k] * ((x - m) / s);
    }
    return Number.isFinite(y) ? y : null;
  }

  function evaluateISPCReduced(reducedInputs, options) {
    const rawReduced = reducedInputs || {};

    const missingReducedInputs = ISPC_REDUCED_REQUIRED_INPUTS.filter((k) => !Number.isFinite(rawReduced[k]));
    if (missingReducedInputs.length) {
      return {
        score: null,
        classLabel: 'Indeterminado',
        className: 'na',
        normalizedInputs: {},
        topRules: [],
        missingRawInputs: ISPC_INPUT_ORDER.slice(),
        missingReducedInputs,
        estimatedRawInputs: Object.keys(ISPC_REDUCED_MODELS_DADOS_010)
      };
    }

    const depthTag = options && options.depthTag ? String(options.depthTag) : 'dados_010';

    const ml = getReducedMLModels();
    const mlTag = ml && ml.by_tag ? ml.by_tag[depthTag] : null;
    const mlModels = mlTag && mlTag.models ? mlTag.models : null;

    // Fallback: regressões lineares simples (legado)
    const legacyModels = (depthTag === 'dados_010') ? ISPC_REDUCED_MODELS_DADOS_010 : ISPC_REDUCED_MODELS_DADOS_010;

    const fullInputs = { ...rawReduced };
    const estimatedRawInputs = [];
    const estimatedValues = {};
    const estimatedModels = {};

    if (mlModels) {
      for (const targetKey of Object.keys(mlModels)) {
        const spec = mlModels[targetKey];
        const yVal = ridgePredict(rawReduced, spec);
        if (Number.isFinite(yVal)) {
          // Guard-rails físicos básicos
          const yClean = (targetKey === 'n_espigas_com' || targetKey === 'peso_espigas') ? Math.max(0, yVal) : yVal;
          fullInputs[targetKey] = yClean;
          estimatedRawInputs.push(targetKey);
          estimatedValues[targetKey] = yClean;
          estimatedModels[targetKey] = {
            kind: 'ridge',
            alpha: spec.alpha,
            cv: spec.cv,
            train: spec.train
          };
        }
      }
    } else {
      for (const targetKey of Object.keys(legacyModels)) {
        const model = legacyModels[targetKey];
        const xKey = model.x;
        const xVal = rawReduced[xKey];
        if (!Number.isFinite(xVal)) {
          continue;
        }
        const yVal = model.intercept + model.slope * xVal;
        if (Number.isFinite(yVal)) {
          fullInputs[targetKey] = yVal;
          estimatedRawInputs.push(targetKey);
          estimatedValues[targetKey] = yVal;
          estimatedModels[targetKey] = model;
        }
      }
    }

    // Se por algum motivo faltou alguma estimativa, o evaluateISPC vai marcar como Indeterminado.
    const base = evaluateISPC(fullInputs);
    return {
      ...base,
      mode: 'ispc_reduced',
      depthTag,
      estimationKind: mlModels ? 'ml_ridge' : 'legacy_linear',
      reducedRawInputs: rawReduced,
      rawInputs: fullInputs,
      estimatedRawInputs,
      estimatedValues,
      estimatedModels,
      missingReducedInputs
    };
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
    evaluate,
    evaluateISPC,
    evaluateISPCReduced
  };
});
