/* ICS Analyzer - núcleo de cálculo */

function calcularAreaCampo() {
  const modoEl = document.getElementById('campoModo');
  const modoSelecionado = modoEl?.value ?? '';

  const larguraRaw = document.getElementById('campoLargura')?.value ?? '';
  const alturaRaw = document.getElementById('campoAltura')?.value ?? '';

  // Aceita decimal com vírgula (padrão pt-BR)
  const norm = (s) => String(s).trim().replace(',', '.');
  const larguraNorm = norm(larguraRaw);
  const alturaNorm = norm(alturaRaw);

  const largura = larguraNorm === '' ? NaN : parseFloat(larguraNorm);
  const altura = alturaNorm === '' ? NaN : parseFloat(alturaNorm);

  // Se W/H forem informados, assume retangular mesmo que o select esteja vazio.
  const modo = modoSelecionado || ((larguraRaw !== '' || alturaRaw !== '') ? 'retangular' : '');

  const algumDado = modo !== '' || larguraRaw !== '' || alturaRaw !== '';
  if (!algumDado) return { areaCampo: null, modo: '', largura: null, altura: null };

  if (modo === 'retangular') {
    if (!Number.isFinite(largura) || largura <= 0 || !Number.isFinite(altura) || altura <= 0) {
      throw new Error('Para geometria retangular, informe largura (W) e altura (H) do campo (m) válidas.');
    }
    return { areaCampo: largura * altura, modo, largura, altura };
  }

  throw new Error('Selecione a geometria do campo (retangular) ou deixe como “Não informar”.');
}

function calcularIndicadoresAvancados(d) {
  const icsMedia = Number.isFinite(d.media) ? d.media : null;
  const cv = Number.isFinite(d.cv) ? d.cv : null;
  const amplitude = Number.isFinite(d.amplitude) ? d.amplitude : null;

  const exposicao = icsMedia === null ? null : (1 - clamp01(icsMedia));

  const declividadePct = parseNumberPtBr(d.declividade);
  const sNorm = declividadePct === null ? null : clamp01(declividadePct / 20);

  const kNorm = textureToKNorm(d.textura);

  const chuva30 = Number.isFinite(d.climaChuva30dMm) ? d.climaChuva30dMm : null;
  const chuvaMaxDia = Number.isFinite(d.climaChuvaMaxDiaMm) ? d.climaChuvaMaxDiaMm : null;

  let rNorm = null;
  if (chuva30 !== null) {
    rNorm = clamp01(chuva30 / 300);
  } else {
    const chuvaRecente = String(d.chuva ?? '');
    if (chuvaRecente.includes('<24h')) rNorm = 0.7;
    else if (chuvaRecente.includes('1-3')) rNorm = 0.5;
    else if (chuvaRecente.includes('>3')) rNorm = 0.3;
    else if (chuvaRecente === 'Não') rNorm = 0.15;
  }

  let rBoost = 0;
  if (chuvaMaxDia !== null) {
    rBoost = clamp01(chuvaMaxDia / 80) * 0.15;
  }

  const wR = 0.35;
  const wC = 0.35;
  const wS = 0.20;
  const wK = 0.10;

  const parts = [];
  if (rNorm !== null) parts.push(wR);
  if (exposicao !== null) parts.push(wC);
  if (sNorm !== null) parts.push(wS);
  if (kNorm !== null) parts.push(wK);
  const wSum = parts.reduce((a, b) => a + b, 0);

  let riscoScore = null;
  if (wSum > 0) {
    const base = (
      (rNorm ?? 0) * wR +
      (exposicao ?? 0) * wC +
      (sNorm ?? 0) * wS +
      (kNorm ?? 0) * wK
    ) / wSum;
    riscoScore = Math.round(100 * clamp01(base + rBoost));
  }

  const cvNorm = cv === null ? null : clamp01(cv / 100);
  const ampNorm = amplitude === null ? null : clamp01(amplitude / 1);
  let imcScore = null;
  if (icsMedia !== null) {
    const termCover = 0.7 * clamp01(icsMedia);
    const termCv = 0.15 * (cvNorm === null ? 0 : (1 - cvNorm));
    const termAmp = 0.15 * (ampNorm === null ? 0 : (1 - ampNorm));
    imcScore = Math.round(100 * clamp01(termCover + termCv + termAmp));
  }

  const areaExposta = (typeof d.areaCampo === 'number' && icsMedia !== null)
    ? (d.areaCampo * (1 - clamp01(icsMedia)))
    : null;

  const riscoClass = classificarRisco(riscoScore);
  const imcClass = classificarIMC(imcScore);

  const textoClima = (() => {
    const partsTxt = [];
    if (Number.isFinite(d.climaChuva7dMm)) partsTxt.push(`Chuva 7d: ${d.climaChuva7dMm.toFixed(1)} mm`);
    if (Number.isFinite(d.climaChuva30dMm)) partsTxt.push(`Chuva 30d: ${d.climaChuva30dMm.toFixed(1)} mm`);
    if (Number.isFinite(d.climaChuvaTotalMm)) partsTxt.push(`Chuva período: ${d.climaChuvaTotalMm.toFixed(1)} mm`);
    if (Number.isFinite(d.climaChuvaMaxDiaMm)) partsTxt.push(`Máx dia: ${d.climaChuvaMaxDiaMm.toFixed(1)} mm`);
    return partsTxt.join(' | ');
  })();

  // USLE/RUSLE (estimativa): A = R * K * LS * C * P
  const usleComprimentoM = Number.isFinite(d.usleComprimentoM) ? d.usleComprimentoM : parseNumberPtBr(d.usleComprimentoM);
  const usleP = Number.isFinite(d.usleP) ? d.usleP : parseNumberPtBr(d.usleP);
  const rProxy = Number.isFinite(d.climaRProxy) ? d.climaRProxy : null;
  const kUsle = textureToKUsle(d.textura);
  const ls = estimateLSRUSLE(declividadePct, usleComprimentoM);
  const c = icsMedia === null ? null : (1 - clamp01(icsMedia));

  let uslePerdaTpha = null;
  if (
    Number.isFinite(rProxy) &&
    Number.isFinite(kUsle) &&
    Number.isFinite(ls) &&
    Number.isFinite(c) &&
    Number.isFinite(usleP)
  ) {
    const a = rProxy * kUsle * ls * c * usleP;
    uslePerdaTpha = (Number.isFinite(a) && a >= 0) ? a : null;
  }

  return {
    exposicao,
    riscoScore,
    riscoClasse: riscoClass.classe,
    riscoDesc: riscoClass.desc,
    imcScore,
    imcClasse: imcClass.classe,
    imcDesc: imcClass.desc,
    areaExposta,
    textoClima,
    uslePerdaTpha,
    usleFatores: {
      R: rProxy,
      K: kUsle,
      LS: ls,
      C: c,
      P: Number.isFinite(usleP) ? usleP : null,
    },
  };
}

function atualizarBlocosAvancados(dados) {
  const climaGrid = document.getElementById('clima-results');
  const riscoGrid = document.getElementById('risco-results');
  const sustGrid = document.getElementById('sust-results');

  const hasClima = Number.isFinite(dados.climaChuvaTotalMm) || Number.isFinite(dados.climaChuva30dMm) || Number.isFinite(dados.climaChuva7dMm) || Number.isFinite(dados.climaChuvaMaxDiaMm);

  if (climaGrid) {
    if (hasClima) climaGrid.classList.remove('hidden');
    else climaGrid.classList.add('hidden');
  }

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  if (hasClima) {
    setText('clima-chuva-total', Number.isFinite(dados.climaChuvaTotalMm) ? dados.climaChuvaTotalMm.toFixed(1) : '0.0');
    setText('clima-chuva-7d', Number.isFinite(dados.climaChuva7dMm) ? dados.climaChuva7dMm.toFixed(1) : '0.0');
    setText('clima-chuva-30d', Number.isFinite(dados.climaChuva30dMm) ? dados.climaChuva30dMm.toFixed(1) : '0.0');
    setText('clima-chuva-maxdia', Number.isFinite(dados.climaChuvaMaxDiaMm) ? dados.climaChuvaMaxDiaMm.toFixed(1) : '0.0');
  }

  const avan = calcularIndicadoresAvancados(dados);

  if (riscoGrid) {
    riscoGrid.classList.remove('hidden');
    setText('risco-score', Number.isFinite(avan.riscoScore) ? String(avan.riscoScore) : '-');
    setText('risco-classe', Number.isFinite(avan.riscoScore) ? `${avan.riscoClasse} | ${avan.riscoDesc}` : 'Aguardando cálculo');
    setText('exposicao', avan.exposicao === null ? '-' : `${(avan.exposicao * 100).toFixed(1)}%`);
    setText('risco-declividade', parseNumberPtBr(dados.declividade) === null ? '-' : String(parseNumberPtBr(dados.declividade).toFixed(1)));
    const texturaTxt = String(dados.textura ?? '').trim();
    setText('risco-textura', texturaTxt === '' ? '-' : texturaTxt);

    // USLE (estimativa)
    setText('usle-perda', Number.isFinite(avan.uslePerdaTpha) ? avan.uslePerdaTpha.toFixed(2) : '-');
    const fatores = avan.usleFatores || {};
    const okUsle = Number.isFinite(fatores.R) && Number.isFinite(fatores.K) && Number.isFinite(fatores.LS) && Number.isFinite(fatores.C) && Number.isFinite(fatores.P);
    setText('usle-desc', okUsle ? 't/ha (período climático)' : 'Preencha clima + rampa + P');
  }

  if (sustGrid) {
    sustGrid.classList.remove('hidden');
    setText('imc', Number.isFinite(avan.imcScore) ? String(avan.imcScore) : '-');
    setText('imc-desc', Number.isFinite(avan.imcScore) ? `${avan.imcClasse} | ${avan.imcDesc}` : 'Aguardando cálculo');
    setText('area-exposta', typeof avan.areaExposta === 'number' ? avan.areaExposta.toFixed(2) : '-');
    setText('imc-cv', Number.isFinite(dados.cv) ? `${dados.cv.toFixed(1)}%` : '0.0%');
    setText('imc-range', Number.isFinite(dados.amplitude) ? dados.amplitude.toFixed(3) : '0.000');
  }

  return avan;
}

function calcular() {
  const numEl = document.getElementById('numLeituras');
  if (!numEl) return;

  const num = parseInt(numEl.value, 10);
  const leituras = [];
  const leiturasH = []; // Array para guardar valores horizontais
  const leiturasV = []; // Array para guardar valores verticais

  for (let i = 1; i <= num; i++) {
    const inputH = document.getElementById(`leitura${i}H`);
    const inputV = document.getElementById(`leitura${i}V`);

    const rawH = inputH?.value ?? '';
    const rawV = inputV?.value ?? '';

    if (rawH === '' || rawV === '') {
      mostrarMensagem(`Erro: Preencha as leituras Horizontal e Vertical no ponto L${i}.`, 'error');
      return;
    }

    const valH = parseFloat(rawH);
    const valV = parseFloat(rawV);

    if (Number.isNaN(valH) || valH < 0 || valH > 1 || Number.isNaN(valV) || valV < 0 || valV > 1) {
      mostrarMensagem(`Erro: Valores inválidos em L${i}.`, 'error');
      return;
    }
    // Metrological combination H*V: approximates covered area fraction in the field of view
    // from orthogonal fractions observed in the reticle.
    const val = valH * valV;
    leituras.push(val);
    leiturasH.push(valH);
    leiturasV.push(valV);
  }

  // Equação da patente / norma: ICS̄ = (Σ ICSᵢ) / n
  const soma = leituras.reduce((a, b) => a + b, 0);
  const media = soma / num;
  const percentual = media * 100;

  const textura = document.getElementById('textura')?.value ?? '';
  const declividade = document.getElementById('declividade')?.value ?? '';
  const usleComprimentoM = parseNumberPtBr(document.getElementById('usleComprimento')?.value);
  const usleP = parseNumberPtBr(document.getElementById('uslePratica')?.value);

  // Calibração opcional: A_campo e áreas (m²)
  let areaCampo = null;
  let areaCobertaMedia = null;
  let areaCobertaTotal = null;
  let campoModo = '';
  let campoLargura = null;
  let campoAltura = null;

  try {
    const areaInfo = calcularAreaCampo();
    areaCampo = areaInfo.areaCampo;
    campoModo = areaInfo.modo;
    campoLargura = areaInfo.largura;
    campoAltura = areaInfo.altura;
    if (typeof areaCampo === 'number') {
      areaCobertaMedia = media * areaCampo;
      areaCobertaTotal = soma * areaCampo;
    }
  } catch (err) {
    mostrarMensagem(String(err?.message ?? err), 'error');
    return;
  }
  const variancia = leituras.reduce((a, b) => a + Math.pow(b - media, 2), 0) / leituras.length;
  const desvio = Math.sqrt(variancia);
  const cv = media > 0 ? (desvio / media) * 100 : 0;
  const amplitude = Math.max(...leituras) - Math.min(...leituras);
  const minimo = Math.min(...leituras);
  const maximo = Math.max(...leituras);

  let classe;
  let classeDesc;
  if (media < 0.1) {
    classe = '0.00';
    classeDesc = 'Solo Exposto / Negligenciável';
  } else if (media < 0.3) {
    classe = '0.20';
    classeDesc = 'Cobertura Baixa (10-30%)';
  } else if (media < 0.5) {
    classe = '0.40';
    classeDesc = 'Cobertura Baixa-Média (30-50%)';
  } else if (media < 0.7) {
    classe = '0.60';
    classeDesc = 'Cobertura Média-Alta (50-70%)';
  } else if (media < 0.9) {
    classe = '0.80';
    classeDesc = 'Cobertura Alta (70-90%)';
  } else {
    classe = '1.00';
    classeDesc = 'Cobertura Total (>90%)';
  }

  const setTextById = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTextById('media', media.toFixed(3));
  setTextById('percentual', `${percentual.toFixed(1)}%`);

  // Bloco "Como foi calculado" (mantém compatibilidade com versões antigas)
  const calcTextEl = document.getElementById('calc-text');
  const calcText2El = document.getElementById('calc-text2');
  if (calcTextEl) calcTextEl.textContent = `ICS_i = H_i*V_i; sum(ICS_i)/n = ${soma.toFixed(3)}/${num} = ${media.toFixed(3)}`;
  if (calcText2El) calcText2El.textContent = `100 × ICS̄ = 100 × ${media.toFixed(3)} = ${percentual.toFixed(1)}%`;

  const calcSomaEl = document.getElementById('calc-soma');
  const calcNEl = document.getElementById('calc-n');
  const calcIcsEl = document.getElementById('calc-ics');
  const calcIcs2El = document.getElementById('calc-ics2');
  const calcPctEl = document.getElementById('calc-pct');
  if (calcSomaEl) calcSomaEl.textContent = soma.toFixed(3);
  if (calcNEl) calcNEl.textContent = String(num);
  if (calcIcsEl) calcIcsEl.textContent = media.toFixed(3);
  if (calcIcs2El) calcIcs2El.textContent = media.toFixed(3);
  if (calcPctEl) calcPctEl.textContent = `${percentual.toFixed(1)}%`;

  // Alguns campos podem estar ocultos/removidos no HTML (ex.: desvio/cv).
  setTextById('desvio', desvio.toFixed(3));
  setTextById('cv', `${cv.toFixed(1)}%`);
  setTextById('classe', classe);
  setTextById('classe-desc', classeDesc);
  setTextById('amplitude', amplitude.toFixed(3));
  setTextById('minimo', minimo.toFixed(3));
  setTextById('maximo', maximo.toFixed(3));

  const tbody = document.getElementById('readings-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  leituras.forEach((val, idx) => {
    let classeLeitura;
    if (val < 0.1) classeLeitura = '0.00';
    else if (val < 0.3) classeLeitura = '0.20';
    else if (val < 0.5) classeLeitura = '0.40';
    else if (val < 0.7) classeLeitura = '0.60';
    else if (val < 0.9) classeLeitura = '0.80';
    else classeLeitura = '1.00';

    const valH = leiturasH[idx];
    const valV = leiturasV[idx];

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>L${idx + 1}</td>
      <td>
        <span style="font-size:0.85em; color:#666;">H: ${valH.toFixed(2)} | V: ${valV.toFixed(2)}</span><br>
        <strong>Média: ${val.toFixed(2)}</strong>
      </td>
      <td>${(val * 100).toFixed(1)}%</td>
      <td>${classeLeitura}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('results').classList.remove('results-hidden');

  const areaResults = document.getElementById('area-results');
  if (areaResults && typeof areaCampo === 'number') {
    const areaCampoEl = document.getElementById('area-campo');
    const areaCobertaMediaEl = document.getElementById('area-coberta-media');
    const areaCobertaTotalEl = document.getElementById('area-coberta-total');
    if (areaCampoEl) areaCampoEl.textContent = areaCampo.toFixed(2);
    if (areaCobertaMediaEl) areaCobertaMediaEl.textContent = areaCobertaMedia.toFixed(2);
    if (areaCobertaTotalEl) areaCobertaTotalEl.textContent = areaCobertaTotal.toFixed(2);
    areaResults.classList.remove('hidden');
  } else if (areaResults) {
    areaResults.classList.add('hidden');
  }

  mostrarMensagem('✓ Análise concluída com sucesso!', 'success');

  const climaAtivo = window.ultimaClima || null;
  const climaChuvaTotalMm = climaAtivo && Number.isFinite(climaAtivo.chuvaTotal) ? climaAtivo.chuvaTotal : null;
  const climaChuva7dMm = climaAtivo && Number.isFinite(climaAtivo.chuva7d) ? climaAtivo.chuva7d : null;
  const climaChuva30dMm = climaAtivo && Number.isFinite(climaAtivo.chuva30d) ? climaAtivo.chuva30d : null;
  const climaChuvaMaxDiaMm = climaAtivo && Number.isFinite(climaAtivo.maxDia) ? climaAtivo.maxDia : null;
  const climaTempMediaC = climaAtivo && Number.isFinite(climaAtivo.tempMedia) ? climaAtivo.tempMedia : null;
  const climaRProxy = climaAtivo && Number.isFinite(climaAtivo.rProxy) ? climaAtivo.rProxy : null;

  const avanPreview = atualizarBlocosAvancados({
    media,
    cv,
    amplitude,
    areaCampo,
    chuva: document.getElementById('chuva')?.value,
    textura,
    declividade,
    usleComprimentoM,
    usleP,
    climaChuvaTotalMm,
    climaChuva7dMm,
    climaChuva30dMm,
    climaChuvaMaxDiaMm,
    climaRProxy,
  });

  window.ultimaDados = {
    numLeituras: num,
    somaIcs: soma,
    projeto: document.getElementById('projeto').value,
    local: document.getElementById('local').value,
    data: document.getElementById('data').value,
    hora: document.getElementById('hora').value,
    operador: document.getElementById('operador').value,
    area: document.getElementById('area').value,
    luz: document.getElementById('luz').value,
    sombra: document.getElementById('sombra').value,
    vento: document.getElementById('vento').value,
    precip: document.getElementById('precip').value,
    chuva: document.getElementById('chuva').value,
    umidade: document.getElementById('umidade').value,
    notas: document.getElementById('notas').value,
    textura,
    declividade,
    latitude: climaAtivo?.latitude ?? parseNumberPtBr(document.getElementById('latitude')?.value),
    longitude: climaAtivo?.longitude ?? parseNumberPtBr(document.getElementById('longitude')?.value),
    climaInicio: document.getElementById('climaInicio')?.value ?? climaAtivo?.inicio ?? '',
    climaFim: document.getElementById('climaFim')?.value ?? climaAtivo?.fim ?? '',
    climaFonte: climaAtivo?.fonte ?? '',
    climaChuvaTotalMm,
    climaChuva7dMm,
    climaChuva30dMm,
    climaChuvaMaxDiaMm,
    climaTempMediaC,
    climaRProxy,
    usleComprimentoM,
    usleP,
    exposicao: avanPreview.exposicao,
    riscoErosaoScore: avanPreview.riscoScore,
    riscoErosaoClasse: avanPreview.riscoClasse,
    riscoErosaoDesc: avanPreview.riscoDesc,
    imcScore: avanPreview.imcScore,
    imcClasse: avanPreview.imcClasse,
    imcDesc: avanPreview.imcDesc,
    areaExposta: avanPreview.areaExposta,
    textoClima: avanPreview.textoClima,
    uslePerdaTpha: avanPreview.uslePerdaTpha,
    usleFatores: avanPreview.usleFatores,
    distVisada: document.getElementById('distVisada')?.value ?? '',
    campoModo,
    campoLargura,
    campoAltura,
    areaCampo,
    areaCobertaMedia,
    areaCobertaTotal,
    leituras,
    leiturasH,
    leiturasV,
    media,
    percentual,
    desvio,
    cv,
    classe,
    classeDesc,
    amplitude,
    minimo,
    maximo,
  };
}
