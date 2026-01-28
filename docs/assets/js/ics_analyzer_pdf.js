/* ICS Analyzer (PDF) - lógica principal sem scripts inline */

function setupLeituras() {
  const numLeiturasEl = document.getElementById('numLeituras');
  const container = document.getElementById('readings-container');
  if (!numLeiturasEl || !container) return;

  const num = parseInt(numLeiturasEl.value, 10);
  container.innerHTML = '';

  const opcoes = [
    { value: '', label: 'Selecione' },
    { value: '0.00', label: '0.0 (0%)' },
    { value: '0.20', label: '0.2 (20%)' },
    { value: '0.40', label: '0.4 (40%)' },
    { value: '0.60', label: '0.6 (60%)' },
    { value: '0.80', label: '0.8 (80%)' },
    { value: '1.00', label: '1.0 (100%)' },
  ];

  for (let i = 1; i <= num; i++) {
    const div = document.createElement('div');
    div.className = 'reading-input';
    const optionsHtml = opcoes
      .filter(o => o.value !== '') 
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join('');

    div.innerHTML = `
      <label style="font-weight:bold; margin-bottom:2px;">L${i}</label>
      <div style="display:flex; flex-direction:column; gap:4px;">
        <select id="leitura${i}H" aria-label="Leitura ${i} Horizontal" style="font-size:11px; padding:4px;" title="Horizontal">
          <option value="" disabled selected>Horiz.</option>
          ${optionsHtml}
        </select>
        <select id="leitura${i}V" aria-label="Leitura ${i} Vertical" style="font-size:11px; padding:4px;" title="Vertical">
          <option value="" disabled selected>Vert.</option>
          ${optionsHtml}
        </select>
      </div>
    `;
    container.appendChild(div);
  }
}

function mostrarMensagem(texto, tipo) {
  const msg = document.getElementById('mensagem');
  if (!msg) return;

  msg.textContent = texto;
  msg.className = `message ${tipo}`;
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 5000);
}

function safeCalcular() {
  try {
    // Garante que as leituras existam (caso algum listener de inicialização não tenha rodado)
    if (!document.getElementById('leitura1H') || !document.getElementById('leitura1V')) {
      setupLeituras();
    }
    calcular();
  } catch (err) {
    console.error('Erro no cálculo:', err);
    mostrarMensagem(`Erro interno ao calcular: ${err?.message || err}`, 'error');
  }
}

function setupCampoCalibracao() {
  const modoEl = document.getElementById('campoModo');
  const grpLargura = document.getElementById('grpCampoLargura');
  const grpAltura = document.getElementById('grpCampoAltura');

  const modo = modoEl?.value ?? '';
  const retangular = modo === 'retangular';

  // Mantém os campos visíveis para permitir que o usuário preencha W/H mesmo sem
  // selecionar a geometria (o cálculo assume retangular se W/H forem informados).
  if (grpLargura) grpLargura.classList.remove('hidden');
  if (grpAltura) grpAltura.classList.remove('hidden');
}

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

function exportarPDF() {
  try {
    if (!window.ultimaDados) {
      mostrarMensagem('Erro: Execute o cálculo primeiro', 'error');
      return;
    }

    // --- Validação básica ---
    const numEl = document.getElementById('numLeituras');
    if (numEl) {
      const numAtual = parseInt(numEl.value, 10);
      if (Number.isFinite(numAtual) && window.ultimaDados.numLeituras && numAtual !== window.ultimaDados.numLeituras) {
        mostrarMensagem('Atenção: o número de leituras foi alterado após o cálculo. Recalcule antes de exportar.', 'error');
        return;
      }
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      mostrarMensagem('Erro: biblioteca de PDF não carregou (jsPDF). Verifique sua conexão com a internet ou tente abrir o sistema no navegador (não no preview do VS Code).', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    // Orientação Paisagem ('l') pode ser melhor para esse layout "ficha", mas o user pediu A4.
    // O layout da imagem parece Retrato ('p').
    const doc = new jsPDF('p', 'mm', 'a4');

  // Dados capturados
  const d = {
    ...window.ultimaDados,
    projeto: document.getElementById('projeto')?.value ?? window.ultimaDados.projeto,
    local: document.getElementById('local')?.value ?? window.ultimaDados.local,
    data: document.getElementById('data')?.value ?? window.ultimaDados.data,
    hora: document.getElementById('hora')?.value ?? window.ultimaDados.hora,
    operador: document.getElementById('operador')?.value ?? window.ultimaDados.operador,
    area: document.getElementById('area')?.value ?? window.ultimaDados.area, // Unidade Amostral
    textura: document.getElementById('textura')?.value ?? window.ultimaDados.textura,
    declividade: document.getElementById('declividade')?.value ?? window.ultimaDados.declividade,
    latitude: parseNumberPtBr(document.getElementById('latitude')?.value) ?? window.ultimaDados.latitude,
    longitude: parseNumberPtBr(document.getElementById('longitude')?.value) ?? window.ultimaDados.longitude,
    climaInicio: document.getElementById('climaInicio')?.value ?? window.ultimaDados.climaInicio,
    climaFim: document.getElementById('climaFim')?.value ?? window.ultimaDados.climaFim,
    // Clima
    luz: document.getElementById('luz')?.value ?? window.ultimaDados.luz,
    sombra: document.getElementById('sombra')?.value ?? window.ultimaDados.sombra,
    vento: document.getElementById('vento')?.value ?? window.ultimaDados.vento,
    chuva: document.getElementById('chuva')?.value ?? window.ultimaDados.chuva,
    notas: document.getElementById('notas')?.value ?? window.ultimaDados.notas,
  };

  // --- Função Auxiliar: Texto Vertical ---
  function verticalText(text, x, y, align = 'center') {
    doc.saveGraphicsState();
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    // rotaciona 90 graus anti-horario
    doc.text(text, x, y, { angle: 90, align: align });
    doc.restoreGraphicsState();
  }

  // --- Função Auxiliar: Bloco Key-Value ---
  function drawField(label, value, x, y, w, h) {
    // Label em negrito
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(label + ':', x + 2, y + 4.5);
    
    // Calcula largura do label para posicionar o valor
    const labelW = doc.getTextWidth(label + ':');
    
    const valueX = x + 2 + labelW + 2;
    const valueMaxW = Math.max(10, (x + w) - 2 - valueX);

    doc.setFont(undefined, 'normal');
    const rawValue = String(value || '-');

    // Para textos longos (ex.: Obs/Clima), tenta quebrar em múltiplas linhas dentro do box.
    // Fallback seguro: corta com reticências se ainda não couber.
    const wrap = label === 'Obs/Clima';
    if (wrap && typeof doc.splitTextToSize === 'function') {
      const valueFontSize = 7;
      doc.setFontSize(valueFontSize);

      const lineHeight = 3.0; // mm (aprox. mais justo para evitar overflow)
      const maxLines = Math.max(1, Math.floor((h - 2) / lineHeight));
      let lines = doc.splitTextToSize(rawValue, valueMaxW);

      if (Array.isArray(lines) && lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const last = String(lines[lines.length - 1] ?? '');
        // tenta adicionar reticências no final
        const ellipsis = '…';
        let trimmed = last;
        while (trimmed.length > 0 && doc.getTextWidth(trimmed + ellipsis) > valueMaxW) {
          trimmed = trimmed.slice(0, -1);
        }
        lines[lines.length - 1] = trimmed.length > 0 ? (trimmed + ellipsis) : ellipsis;
      }

      const startY = y + 4.2; // baseline da 1ª linha
      lines.forEach((ln, idx) => {
        const yy = startY + idx * lineHeight;
        if (yy <= y + h - 1) doc.text(String(ln), valueX, yy);
      });
    } else {
      doc.setFontSize(9);
      // Se exceder a largura, aplica corte com reticências
      const ellipsis = '…';
      let txt = rawValue;
      while (txt.length > 0 && doc.getTextWidth(txt) > valueMaxW) {
        txt = txt.slice(0, -1);
      }
      while (txt.length > 0 && doc.getTextWidth(txt + ellipsis) > valueMaxW) {
        txt = txt.slice(0, -1);
      }
      const out = (doc.getTextWidth(rawValue) <= valueMaxW) ? rawValue : ((txt.length > 0 ? txt : '') + ellipsis);
      doc.text(out, valueX, y + 4.5);
    }
    
    // Borda inferior (linha)
    doc.setDrawColor(150);
    doc.setLineWidth(0.1);
    doc.line(x, y + h, x + w, y + h);
    
    // Borda direita vertical (opcional, para grade)
    // doc.line(x + w, y, x + w, y + h);
  }

  // Margens e Coordenadas
  const mLeft = 10;
  const mRight = 10;
  const pageW = 210;
  const contentW = pageW - mLeft - mRight; // 190
  let y = 10;

  // ==========================================
  // 1. CABEÇALHO (Logo + Títulos)
  // ==========================================
  
  // Tenta pegar a imagem do DOM (adicionada no HTML)
  const logoImg = document.getElementById('logo-for-pdf');
  let logoAdicionado = false;

  if (logoImg) {
    try {
      if (logoImg.complete && logoImg.naturalHeight > 0) {
        // Ajuste de Logo: Limitar altura e largura
        const maxW = 30;
        const maxH = 25; // Altura máxima para não invadir a linha

        let logoW = maxW;
        const ratio = logoImg.naturalHeight / logoImg.naturalWidth;
        let logoH = logoW * ratio;

        // Se altura estourar, redimensiona pela altura
        if (logoH > maxH) {
          logoH = maxH;
          logoW = logoH / ratio;
        }

        // Centralizar verticalmente no espaço reservado de 30mm
        // Espaço Header = 30mm. Meio = 15mm.
        // Posição Y = y + (30 - logoH)/2
        const logoY = y + (30 - logoH) / 2;

        doc.addImage(logoImg, 'PNG', mLeft, logoY, logoW, logoH);
        logoAdicionado = true;
      } else {
        console.warn('Logo existe mas não está carregado (complete=false).');
      }
    } catch (err) {
      console.warn('Não foi possível inserir a imagem do logo no PDF:', err);
    }
  }

  // Se a imagem falhar, desenha o texto substituto
  if (!logoAdicionado) {
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('ICS', mLeft, y + 15);
    doc.setFontSize(10);
    doc.text('Analyzer', mLeft, y + 20);
  }

  // Título Principal (Direita/Centro)
  const titleX = mLeft + 40;
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  // Ajustado Y para centralizar melhor no bloco aumentado
  doc.text('SISTEMA DE ANÁLISE DE COBERTURA DE SOLO', titleX, y + 12);
  
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text('RELATÓRIO TÉCNICO - ÍNDICE DE COBERTURA (ICS)', titleX, y + 20);

  y += 32; // Espaço aumentado para cabeçalho (era 22) para evitar sobreposição

  // Linha grossa separadora
  doc.setLineWidth(0.5);
  doc.setDrawColor(0);
  doc.line(mLeft, y, pageW - mRight, y);
  y += 2;

  // ==========================================
  // 2. BOX "DADOS CADASTRAIS / PROJETO"
  // ==========================================
  // Altura total desse bloco
  const box1Height = 40; 
  const yBox1 = y;

  // Borda externa geral
  doc.setLineWidth(0.3);
  doc.rect(mLeft, yBox1, contentW, box1Height);

  // -- Coluna Esquerda: Rótulo Vertical "DADOS DO PROJETO"
  const colVerW = 8;
  doc.rect(mLeft, yBox1, colVerW, box1Height); // Caixa do rótulo
  verticalText('DADOS DO PROJETO', mLeft + 5, yBox1 + box1Height / 2, 'center');

  // -- Coluna Meio: "Imagem representativa" (Placeholder)
  // Na imagem original é grande, vamos usar 50mm
  const colImgW = 50;
  const imgX = mLeft + colVerW;
  doc.setDrawColor(180);
  doc.rect(imgX, yBox1, colImgW, box1Height);
  
  // Lógica para inserir Croqui/Foto se existir
  if (window.imagemCroquiBase64) {
    try {
      const imgProps = doc.getImageProperties(window.imagemCroquiBase64);
      // Espaço disponível (com uma pequena margem de 1mm)
      const maxW = colImgW - 2; 
      const maxH = box1Height - 2;
      
      let w = imgProps.width;
      let h = imgProps.height;
      const ratio = h / w;
      
      // Tentar ajustar primeiro pela largura
      let finalW = maxW;
      let finalH = finalW * ratio;
      
      // Se a altura estourar, ajustar pela altura
      if (finalH > maxH) {
        finalH = maxH;
        finalW = finalH / ratio;
      }
      
      // Centralizar a imagem no box
      const posX = imgX + (colImgW - finalW) / 2;
      const posY = yBox1 + (box1Height - finalH) / 2;
      
      doc.addImage(window.imagemCroquiBase64, 'JPEG', posX, posY, finalW, finalH);
      
    } catch(err){
      console.warn('Erro ao inserir croqui no box:', err);
      doc.setFontSize(8);
      doc.setTextColor(200, 0, 0);
      doc.text('Erro Img', imgX + colImgW/2, yBox1 + box1Height/2, { align: 'center' });
    }
  } else {
    // Texto placeholder se não houver imagem
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Local para Croqui/Foto', imgX + colImgW/2, yBox1 + box1Height/2, { align: 'center' });
  }
  
  doc.setTextColor(0);

  // -- Coluna Direita: Campos de Texto
  const fieldsX = imgX + colImgW;
  const fieldsW = contentW - colVerW - colImgW;
  const rowH = 7; // primeiras 4 linhas
  const rowHObs = box1Height - rowH * 4; // última linha (Obs/Clima) maior para caber quebra

  doc.setDrawColor(0); // Preto para linhas internas

  // Linhas do grid
  // Linha 1
  drawField('Projeto', d.projeto, fieldsX, yBox1, fieldsW, rowH);
  // Linha 2
  drawField('Local/Endereço', d.local, fieldsX, yBox1 + rowH, fieldsW, rowH);
  // Linha 3 (Dividida em 2: Data | Hora)
  const halfW = fieldsW / 2;
  drawField('Data', d.data, fieldsX, yBox1 + rowH * 2, halfW, rowH);
  drawField('Hora', d.hora, fieldsX + halfW, yBox1 + rowH * 2, halfW, rowH);
  // Linha 4 (Dividida: Operador | Área)
  drawField('Operador', d.operador, fieldsX, yBox1 + rowH * 3, halfW, rowH);
  drawField('Unid. Amostral', d.area, fieldsX + halfW, yBox1 + rowH * 3, halfW, rowH);
  // Linha 5 (Notas/Obs)
  drawField('Obs/Clima', `${d.textoClima || (d.luz + ' ' + d.notas).trim()}`, fieldsX, yBox1 + rowH * 4, fieldsW, rowHObs);

  y += box1Height + 5;

  // ==========================================
  // 3. BARRA "DADOS GERAIS" (Resultados Resumidos)
  // ==========================================
  // Título da Seção
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('DADOS GERAIS DA ANÁLISE', mLeft + contentW/2, y, { align: 'center' });
  // Linhas grossas estilo cabeçalho
  doc.setLineWidth(0.5);
  doc.line(mLeft, y + 1, pageW - mRight, y + 1);
  y += 2;

  // Tabela Dados Gerais (1 linha)
  // Colunas: N. Leituras | ICS Médio | Cobertura % | Desvio Padrão
  const rowGenH = 8;
  const colGenW = contentW / 4;
  
  // Fundo cinza nos labels? Vamos fazer estilo "Label: Valor" em caixa
  function fitTextToWidth(text, maxW, ellipsis = '…') {
    const raw = String(text ?? '');
    if (raw === '') return '';
    if (doc.getTextWidth(raw) <= maxW) return raw;

    let t = raw;
    while (t.length > 0 && doc.getTextWidth(t + ellipsis) > maxW) {
      t = t.slice(0, -1);
    }
    return t.length > 0 ? (t + ellipsis) : '';
  }

  function drawGenBox(label, value, idx, opts = {}) {
    const bx = mLeft + idx * colGenW;
    
    // Fundo cinza claro no label
    doc.setFillColor(230);
    doc.rect(bx, y, colGenW, rowGenH, 'F'); // Fundo total ou parcial? 
    // Vamos fazer estilo imagem: Label esquerda cinza, Valor direita branco?
    // A imagem: "No. ambientes (label) | 7 (valor) | Area (label) | 208 (valor)"
    // Vamos replicar: Label (cinza) | Valor (branco)
    
    const labelRatio = typeof opts.labelRatio === 'number' ? opts.labelRatio : 0.6;
    const labelPartW = colGenW * labelRatio;
    const valPartW = colGenW - labelPartW;
    
    doc.setFillColor(220); // Cinza label
    doc.rect(bx, y, labelPartW, rowGenH, 'F');
    doc.rect(bx, y, colGenW, rowGenH); // Borda full

    doc.setFillColor(255); // Branco valor
    doc.rect(bx + labelPartW, y, valPartW, rowGenH, 'F');
    doc.rect(bx + labelPartW, y, valPartW, rowGenH); // Borda valor

    const labelFontSize = typeof opts.labelFontSize === 'number' ? opts.labelFontSize : 8;
    const valueFontSize = typeof opts.valueFontSize === 'number' ? opts.valueFontSize : 8;

    doc.setFontSize(labelFontSize);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    const labelTxt = fitTextToWidth(label, labelPartW - 4);
    doc.text(labelTxt, bx + 2, y + 5);

    doc.setFontSize(valueFontSize);
    doc.setFont(undefined, 'normal');
    const valueTxt = fitTextToWidth(String(value), valPartW - 4);
    doc.text(valueTxt, bx + labelPartW + 2, y + 5);
  }

  // Presets de layout para caixas de dados gerais
  const genBoxOptsClassificacao = { labelRatio: 0.35, labelFontSize: 7, valueFontSize: 7 };
  const genBoxOptsMinMax = { labelRatio: 0.62, labelFontSize: 7, valueFontSize: 7 };
  const genBoxOptsAreas = { labelRatio: 0.72, labelFontSize: 7, valueFontSize: 7 };
  const genBoxOptsClimaLinha1 = { labelRatio: 0.68, labelFontSize: 6.5, valueFontSize: 7 };
  const genBoxOptsClimaLinha2 = { labelRatio: 0.7, labelFontSize: 7, valueFontSize: 7 };

  drawGenBox('No. Leituras', d.numLeituras, 0);
  drawGenBox('ICS Médio', d.media.toFixed(3), 1);
  drawGenBox('Cobertura (%)', d.percentual.toFixed(1), 2);
  drawGenBox('Desvio Padrão', d.desvio.toFixed(2), 3);

  y += rowGenH + 5;

  // Mesmos dados exibidos no site (Resultados)
  const cvTxt = (typeof d.cv === 'number') ? `${d.cv.toFixed(1)}%` : '-';
  const ampTxt = (typeof d.amplitude === 'number') ? d.amplitude.toFixed(3) : '-';
  const minTxt = (typeof d.minimo === 'number') ? d.minimo.toFixed(3) : '-';
  const maxTxt = (typeof d.maximo === 'number') ? d.maximo.toFixed(3) : '-';
  const classeTxt = (d.classe ?? '-') + (d.classeDesc ? ` - ${d.classeDesc}` : '');

  // Linha 2: CV, Classe, Amplitude, (Min..Max)
  drawGenBox('CV (%)', cvTxt, 0);
  drawGenBox('Classificação', classeTxt, 1, genBoxOptsClassificacao);
  drawGenBox('Amplitude', ampTxt, 2);
  drawGenBox('Min..Max', `${minTxt}..${maxTxt}`, 3, genBoxOptsMinMax);

  y += rowGenH + 5;

  // Linha extra (opcional): Áreas em m² quando houver calibração W/H
  if (typeof d.areaCampo === 'number') {
    const areaMediaTxt = typeof d.areaCobertaMedia === 'number' ? d.areaCobertaMedia.toFixed(2) : '-';
    const areaTotalTxt = typeof d.areaCobertaTotal === 'number' ? d.areaCobertaTotal.toFixed(2) : '-';
    const areaCampoTxt = d.areaCampo.toFixed(2);

    // Labels longos: usar fonte menor e dar mais largura para o label.
    drawGenBox('A campo (m²)', areaCampoTxt, 0, genBoxOptsAreas);
    drawGenBox('Área cob. média (m²)', areaMediaTxt, 1, genBoxOptsAreas);
    drawGenBox('Área cob. total (m²)', areaTotalTxt, 2, genBoxOptsAreas);
    drawGenBox('Dist. visada (m)', d.distVisada || '-', 3, genBoxOptsAreas);
    y += rowGenH + 5;
  }

  // Linha extra (opcional): Clima e risco potencial quando disponível
  {
    const riscoTxt = Number.isFinite(d.riscoErosaoScore)
      ? `${d.riscoErosaoScore} (${d.riscoErosaoClasse || ''})`
      : '-';
    const exposicaoTxt = Number.isFinite(d.exposicao) ? `${(d.exposicao * 100).toFixed(1)}%` : '-';
    const chuva7dTxt = Number.isFinite(d.climaChuva7dMm) ? d.climaChuva7dMm.toFixed(1) : '-';
    const chuva30dTxt = Number.isFinite(d.climaChuva30dMm) ? d.climaChuva30dMm.toFixed(1) : '-';

    const hasLinha1 = (riscoTxt !== '-') || (exposicaoTxt !== '-') || (chuva7dTxt !== '-') || (chuva30dTxt !== '-');
    if (hasLinha1) {
      drawGenBox('Risco erosão', riscoTxt, 0, genBoxOptsClimaLinha1);
      drawGenBox('Exposição', exposicaoTxt, 1, genBoxOptsClimaLinha1);
      drawGenBox('Chuva 7d (mm)', chuva7dTxt, 2, genBoxOptsClimaLinha1);
      drawGenBox('Chuva 30d (mm)', chuva30dTxt, 3, genBoxOptsClimaLinha1);
      y += rowGenH + 5;
    }

    const declivTxt = parseNumberPtBr(d.declividade);
    const declivOut = declivTxt === null ? '-' : declivTxt.toFixed(1);
    const texturaOut = (String(d.textura ?? '').trim() === '') ? '-' : String(d.textura).trim();
    const maxDiaTxt = Number.isFinite(d.climaChuvaMaxDiaMm) ? d.climaChuvaMaxDiaMm.toFixed(1) : '-';
    const tempTxt = Number.isFinite(d.climaTempMediaC) ? d.climaTempMediaC.toFixed(1) : '-';
    const hasLinha2 = (declivOut !== '-') || (texturaOut !== '-') || (maxDiaTxt !== '-') || (tempTxt !== '-');
    if (hasLinha2) {
      drawGenBox('Declividade (%)', declivOut, 0, genBoxOptsClimaLinha2);
      drawGenBox('Textura', texturaOut, 1, genBoxOptsClimaLinha2);
      drawGenBox('Máx dia (mm)', maxDiaTxt, 2, genBoxOptsClimaLinha2);
      drawGenBox('T média (°C)', tempTxt, 3, genBoxOptsClimaLinha2);
      y += rowGenH + 5;
    }
  }

  // ==========================================
  // 4. "DISTRIBUIÇÃO POR CLASSES" (Estilo tabela de sistemas)
  // ==========================================
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('DISTRIBUIÇÃO DE FREQUÊNCIA (CLASSES)', mLeft + contentW/2, y, { align: 'center' });
  doc.setLineWidth(0.5);
  doc.line(mLeft, y + 1, pageW - mRight, y + 1);
  y += 2;

  // Calcular contagens (mesmo critério usado no sistema)
  const labels = ['0.0', '0.2', '0.4', '0.6', '0.8', '1.0'];
  const counts = [0, 0, 0, 0, 0, 0];
  const total = d.numLeituras;

  (d.leituras || []).forEach((val) => {
    if (val < 0.1) counts[0]++;
    else if (val < 0.3) counts[1]++;
    else if (val < 0.5) counts[2]++;
    else if (val < 0.7) counts[3]++;
    else if (val < 0.9) counts[4]++;
    else counts[5]++;
  });

  // Tabela simples: Classe | N | Pct
  const freqTableW = 120;
  const freqTableX = (pageW - freqTableW) / 2;
  const freqRowH = 7;
  const colC = 30;
  const colN = 30;
  const colP = freqTableW - (colC + colN);

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(220);
  doc.rect(freqTableX, y, freqTableW, freqRowH, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(freqTableX, y, freqTableW, freqRowH);
  doc.text('Classe', freqTableX + 2, y + 5);
  doc.text('N', freqTableX + colC + 2, y + 5);
  doc.text('Pct', freqTableX + colC + colN + 2, y + 5);
  y += freqRowH;

  doc.setFont(undefined, 'normal');
  labels.forEach((lab, i) => {
    doc.rect(freqTableX, y, freqTableW, freqRowH);
    doc.line(freqTableX + colC, y, freqTableX + colC, y + freqRowH);
    doc.line(freqTableX + colC + colN, y, freqTableX + colC + colN, y + freqRowH);

    const pct = total > 0 ? ((counts[i] / total) * 100).toFixed(1) + '%' : '0.0%';
    doc.text(lab, freqTableX + 2, y + 5);
    doc.text(String(counts[i]), freqTableX + colC + 2, y + 5);
    doc.text(pct, freqTableX + colC + colN + 2, y + 5);
    y += freqRowH;
  });

  y += 8;

  // ==========================================
  // 5. GRÁFICO (Centralizado)
  // ==========================================
  // Título Gráfico
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('REPRESENTAÇÃO GRÁFICA', mLeft + contentW/2, y, { align: 'center' });
  doc.line(mLeft, y + 1, pageW - mRight, y + 1);
  y += 5;

  const chartInfo = {
    x: (pageW - 100) / 2, // Centraliza 100mm
    y: y,
    w: 100,
    h: 50
  };

  // Reutiliza função de desenho de barras (nativa PDF)
  // Precisamos adaptar a função `desenharBarrasFrequenciaICS` para não desenhar fundo/borda se não quisermos
  // Mas o style "clean" atual já é bom.
  
  // Tema para o gráfico ficar "limpo" no papel branco
  const chartTheme = {
    panelHex: '#FFFFFF',
    lineHex: '#1a5f7a',
    fillHex: '#b7e4c7'
  };
  
  // Adiciona moldura ao redor da área do gráfico para parecer o "box" da imagem
  doc.setLineWidth(0.1);
  doc.setDrawColor(200);
  doc.rect(mLeft, y - 2, contentW, chartInfo.h + 5); // Box largo pegando a pagina toda

  desenharAreaChartICS(doc, chartInfo.x, chartInfo.y, chartInfo.w, chartInfo.h, d.leituras, chartTheme);

  y += chartInfo.h + 10;

  // ==========================================
  // 6. (REMOVIDO) DETALHAMENTO TABULAR
  // ==========================================
  // O detalhamento linha-a-linha foi removido para manter o PDF mais enxuto.

  // ==========================================
  // TEXTO LATERAL DIREITO (Marca d'água vertical)
  // ==========================================
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.saveGraphicsState();
    
    // Rodapé Padrão
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${p} de ${pageCount} - Gerado em ${new Date().toLocaleDateString()}`, 105, 292, { align: 'center', angle: 0 });
    doc.restoreGraphicsState();
  }

    const sanitizeFileName = (name) => {
      const base = String(name || 'Relatorio_ICS.pdf');
      // Remove caracteres proibidos no Windows + normaliza espaços
      const cleaned = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      return cleaned || 'Relatorio_ICS.pdf';
    };

    const baixarPdfComFallback = (pdfDoc, fileName) => {
      try {
        pdfDoc.save(fileName);
        return true;
      } catch (err) {
        try {
          const blob = pdfDoc.output('blob');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          return true;
        } catch (err2) {
          console.error('Falha ao baixar PDF (save e fallback falharam):', err, err2);
          return false;
        }
      }
    };

    // Nome arquivo
    const nomeArquivo = sanitizeFileName(`Relatorio_ICS_${d.projeto || 'vazio'}.pdf`);
    const ok = baixarPdfComFallback(doc, nomeArquivo);
    if (ok) {
      mostrarMensagem(`✓ PDF exportado: ${nomeArquivo}`, 'success');
    } else {
      mostrarMensagem('Erro: não foi possível iniciar o download do PDF. Tente abrir em um navegador (Chrome/Edge) e permitir downloads.', 'error');
    }
  } catch (err) {
    console.error('Erro inesperado ao exportar PDF:', err);
    mostrarMensagem(`Erro ao exportar PDF: ${err?.message || err}`, 'error');
  }
}

function limpar() {
  if (!confirm('Deseja limpar todos os dados?')) return;

  document.getElementById('projeto').value = '';
  document.getElementById('local').value = '';
  document.getElementById('data').value = '';
  document.getElementById('hora').value = '';
  document.getElementById('operador').value = '';
  document.getElementById('area').value = '';
  document.getElementById('luz').value = '';
  document.getElementById('sombra').value = '';
  document.getElementById('vento').value = '';
  document.getElementById('precip').value = '';
  document.getElementById('chuva').value = '';
  document.getElementById('umidade').value = '';
  document.getElementById('notas').value = '';
  const texturaEl = document.getElementById('textura');
  if (texturaEl) texturaEl.value = '';
  const declivEl = document.getElementById('declividade');
  if (declivEl) declivEl.value = '';
  const latEl = document.getElementById('latitude');
  if (latEl) latEl.value = '';
  const lonEl = document.getElementById('longitude');
  if (lonEl) lonEl.value = '';
  const climaIniEl = document.getElementById('climaInicio');
  if (climaIniEl) climaIniEl.value = '';
  const climaFimEl = document.getElementById('climaFim');
  if (climaFimEl) climaFimEl.value = '';
  const usleComprimentoEl = document.getElementById('usleComprimento');
  if (usleComprimentoEl) usleComprimentoEl.value = '';
  const uslePraticaEl = document.getElementById('uslePratica');
  if (uslePraticaEl) uslePraticaEl.value = '';
  const distEl = document.getElementById('distVisada');
  if (distEl) distEl.value = '';
  const campoModoEl = document.getElementById('campoModo');
  if (campoModoEl) campoModoEl.value = '';
  const campoLarguraEl = document.getElementById('campoLargura');
  if (campoLarguraEl) campoLarguraEl.value = '';
  const campoAlturaEl = document.getElementById('campoAltura');
  if (campoAlturaEl) campoAlturaEl.value = '';
  document.getElementById('results').classList.add('results-hidden');
  document.getElementById('mensagem').classList.add('hidden');
  clearClimaStatus();
  document.getElementById('area-results')?.classList?.add('hidden');
  document.getElementById('clima-results')?.classList?.add('hidden');
  document.getElementById('risco-results')?.classList?.add('hidden');
  document.getElementById('sust-results')?.classList?.add('hidden');
  window.ultimaClima = null;
  setupLeituras();
  setupCampoCalibracao();
}
