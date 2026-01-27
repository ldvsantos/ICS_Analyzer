/* ICS Analyzer (PDF) - lógica principal sem scripts inline */

function setupLeituras() {
  const numLeiturasEl = document.getElementById('numLeituras');
  const container = document.getElementById('readings-container');
  if (!numLeiturasEl || !container) return;

  const num = parseInt(numLeiturasEl.value, 10);
  container.innerHTML = '';

  const opcoes = [
    { value: '', label: 'Selecione' },
    { value: '0.00', label: '0.00 (0%)' },
    { value: '0.25', label: '0.25 (25%)' },
    { value: '0.50', label: '0.50 (50%)' },
    { value: '0.75', label: '0.75 (75%)' },
    { value: '1.00', label: '1.00 (100%)' },
  ];

  for (let i = 1; i <= num; i++) {
    const div = document.createElement('div');
    div.className = 'reading-input';
    const optionsHtml = opcoes
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join('');
    div.innerHTML = `
      <label for="leitura${i}">L${i}</label>
      <select id="leitura${i}" aria-label="Leitura ${i}">
        ${optionsHtml}
      </select>
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

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').trim();
  if (clean.length !== 6) return { r: 0, g: 0, b: 0 };
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function quantileFromSorted(sorted, q) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base];
  const b = sorted[Math.min(base + 1, n - 1)];
  return a + (b - a) * rest;
}

function calcularBoxplotStats(valores) {
  const arr = (valores || []).filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const n = arr.length;
  if (n === 0) return null;
  const soma = arr.reduce((acc, v) => acc + v, 0);
  return {
    n,
    min: arr[0],
    q1: quantileFromSorted(arr, 0.25),
    mediana: quantileFromSorted(arr, 0.5),
    q3: quantileFromSorted(arr, 0.75),
    max: arr[n - 1],
    media: soma / n,
  };
}

function desenharRetanguloRachurado(doc, x, y, w, h, opts) {
  const { fillRgb, hatchRgb, spacing = 2.5, angle = 45, lineWidth = 0.2 } = opts || {};

  if (fillRgb) {
    doc.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    doc.rect(x, y, w, h, 'F');
  }

  if (!hatchRgb) return;

  doc.setDrawColor(hatchRgb.r, hatchRgb.g, hatchRgb.b);
  doc.setLineWidth(lineWidth);

  // Recorte (clip) para as linhas não “vazarem” para fora do retângulo.
  const canClip = typeof doc.saveGraphicsState === 'function' && typeof doc.restoreGraphicsState === 'function' && typeof doc.clip === 'function';
  if (canClip) {
    doc.saveGraphicsState();
    doc.rect(x, y, w, h);
    doc.clip();
    if (typeof doc.discardPath === 'function') doc.discardPath();
  }

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const diag = Math.sqrt(w * w + h * h);
  const steps = Math.ceil((w + h) / spacing) + 2;
  for (let i = -steps; i <= steps; i++) {
    const ox = x + i * spacing;
    const oy = y;
    const x1 = ox;
    const y1 = oy;
    const x2 = ox + diag * cos;
    const y2 = oy + diag * sin;
    doc.line(x1, y1, x2, y2);
  }

  if (canClip) {
    doc.restoreGraphicsState();
  }
}

function desenharBoxplotICS(doc, x, y, w, h, valores, theme) {
  const stats = calcularBoxplotStats(valores);
  if (!stats) return;

  const { boxFillHex = '#CCEBC5', boxHatchHex = '#383838', panelHex = '#EAEAEA' } = theme || {};
  const panel = hexToRgb(panelHex);
  const boxFill = hexToRgb(boxFillHex);
  const hatch = hexToRgb(boxHatchHex);

  doc.setFillColor(panel.r, panel.g, panel.b);
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');

  const pad = 6;
  const plotX = x + pad;
  const plotY = y + 6;
  const plotW = w - pad * 2;
  const plotH = h - 12;

  const yFromVal = (v) => plotY + (1 - clamp01(v)) * plotH;

  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.line(plotX, plotY, plotX, plotY + plotH);

  doc.setFontSize(7);
  doc.setTextColor(90);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  ticks.forEach((t) => {
    const ty = yFromVal(t);
    doc.setDrawColor(180);
    doc.line(plotX, ty, plotX + plotW, ty);
    doc.setDrawColor(120);
    doc.line(plotX - 1.2, ty, plotX, ty);
    doc.text(t.toFixed(2), plotX - 4.5, ty + 2, { align: 'right' });
  });
  doc.setTextColor(0);

  const cx = plotX + plotW * 0.62;
  const boxW = Math.min(22, plotW * 0.35);
  const boxX = cx - boxW / 2;
  const yQ1 = yFromVal(stats.q1);
  const yQ3 = yFromVal(stats.q3);
  const yMed = yFromVal(stats.mediana);
  const yMin = yFromVal(stats.min);
  const yMax = yFromVal(stats.max);

  desenharRetanguloRachurado(doc, boxX, yQ3, boxW, Math.max(0.01, yQ1 - yQ3), {
    fillRgb: boxFill,
    hatchRgb: hatch,
    spacing: 2.3,
    angle: 45,
    lineWidth: 0.15,
  });
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.rect(boxX, yQ3, boxW, Math.max(0.01, yQ1 - yQ3));

  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.line(boxX, yMed, boxX + boxW, yMed);

  doc.setLineWidth(0.3);
  doc.line(cx, yQ3, cx, yMax);
  doc.line(cx, yQ1, cx, yMin);
  doc.line(cx - boxW * 0.35, yMax, cx + boxW * 0.35, yMax);
  doc.line(cx - boxW * 0.35, yMin, cx + boxW * 0.35, yMin);

  const jitter = Math.min(6, boxW * 0.35);
  doc.setDrawColor(30);
  doc.setFillColor(30);
  doc.setLineWidth(0.2);
  (valores || []).forEach((v, i) => {
    const px = cx + ((i % 7) - 3) * (jitter / 6);
    const py = yFromVal(v);
    doc.circle(px, py, 0.55, 'F');
  });

  doc.setFontSize(8);
  doc.setTextColor(40);
  doc.text('Boxplot (ICS)', x + 6, y + h - 4);
  doc.setTextColor(0);
}

function desenharBarrasFrequenciaICS(doc, x, y, w, h, valores, theme) {
  const { panelHex = '#EAEAEA', barAHex = '#DECBE4', barBHex = '#CCEBC5', hatchHex = '#383838' } = theme || {};
  const panel = hexToRgb(panelHex);
  const barA = hexToRgb(barAHex);
  const barB = hexToRgb(barBHex);
  const hatch = hexToRgb(hatchHex);

  const bins = [0, 0.25, 0.5, 0.75, 1.0];
  const labels = ['0.00', '0.25', '0.50', '0.75', '1.00'];
  const counts = new Array(bins.length).fill(0);
  (valores || []).forEach((v) => {
    const idx = bins.findIndex((b) => Math.abs(v - b) < 1e-9);
    if (idx >= 0) counts[idx] += 1;
  });
  const maxCount = Math.max(1, ...counts);

  doc.setFillColor(panel.r, panel.g, panel.b);
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');

  const pad = 7;
  const plotX = x + pad;
  const plotY = y + 6;
  const plotW = w - pad * 2;
  const plotH = h - 14;

  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  const barGap = 2.2;
  const barW = (plotW - barGap * (labels.length - 1)) / labels.length;

  doc.setFontSize(7);
  doc.setTextColor(60);
  labels.forEach((lab, i) => {
    const bx = plotX + i * (barW + barGap);
    const bh = (counts[i] / maxCount) * (plotH - 2);
    const by = plotY + plotH - bh;
    const fill = i % 2 === 0 ? barA : barB;
    
    // Desenha barra sólida (sem hachura "zebra")
    doc.setFillColor(fill.r, fill.g, fill.b);
    doc.rect(bx, by, barW, bh, 'F');
    
    doc.setDrawColor(60);
    doc.setLineWidth(0.2);
    doc.rect(bx, by, barW, bh);
    doc.text(lab, bx + barW / 2, plotY + plotH + 4.5, { align: 'center' });
  });

  doc.setFontSize(8);
  doc.setTextColor(40);
  doc.text('Frequencia (classes)', x + 6, y + h - 4);
  doc.setTextColor(0);
}

function setupCampoCalibracao() {
  const modoEl = document.getElementById('campoModo');
  const grpLargura = document.getElementById('grpCampoLargura');
  const grpAltura = document.getElementById('grpCampoAltura');

  const modo = modoEl?.value ?? '';
  const retangular = modo === 'retangular';

  if (grpLargura) grpLargura.classList.toggle('hidden', !retangular);
  if (grpAltura) grpAltura.classList.toggle('hidden', !retangular);
}

function calcularAreaCampo() {
  const modoEl = document.getElementById('campoModo');
  const modo = modoEl?.value ?? '';

  const larguraRaw = document.getElementById('campoLargura')?.value ?? '';
  const alturaRaw = document.getElementById('campoAltura')?.value ?? '';

  const largura = larguraRaw === '' ? NaN : parseFloat(larguraRaw);
  const altura = alturaRaw === '' ? NaN : parseFloat(alturaRaw);

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

function calcular() {
  const numEl = document.getElementById('numLeituras');
  if (!numEl) return;

  const num = parseInt(numEl.value, 10);
  const leituras = [];

  for (let i = 1; i <= num; i++) {
    const input = document.getElementById(`leitura${i}`);
    const raw = input?.value ?? '';
    const val = raw === '' ? NaN : parseFloat(raw);
    if (Number.isNaN(val) || val < 0 || val > 1) {
      mostrarMensagem(`Erro: Selecione uma classe válida em todas as ${num} leituras (0.00, 0.25, 0.50, 0.75, 1.00). Falha em L${i}.`, 'error');
      return;
    }
    leituras.push(val);
  }

  // Equação da patente / norma: ICS̄ = (Σ ICSᵢ) / n
  const soma = leituras.reduce((a, b) => a + b, 0);
  const media = soma / num;
  const percentual = media * 100;

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
  if (media < 0.125) {
    classe = '0.00';
    classeDesc = 'Solo Exposto / Negligenciável';
  } else if (media < 0.375) {
    classe = '0.25';
    classeDesc = 'Cobertura Baixa (12.5-37.5%)';
  } else if (media < 0.625) {
    classe = '0.50';
    classeDesc = 'Cobertura Intermediária (37.5-62.5%)';
  } else if (media < 0.875) {
    classe = '0.75';
    classeDesc = 'Cobertura Alta (62.5-87.5%)';
  } else {
    classe = '1.00';
    classeDesc = 'Cobertura Total (≥87.5%)';
  }

  document.getElementById('media').textContent = media.toFixed(3);
  document.getElementById('percentual').textContent = `${percentual.toFixed(1)}%`;

  // Bloco "Como foi calculado" (mantém compatibilidade com versões antigas)
  const calcTextEl = document.getElementById('calc-text');
  const calcText2El = document.getElementById('calc-text2');
  if (calcTextEl) calcTextEl.textContent = `Σ(ICSᵢ)/n = ${soma.toFixed(3)}/${num} = ${media.toFixed(3)}`;
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

  document.getElementById('desvio').textContent = desvio.toFixed(3);
  document.getElementById('cv').textContent = `${cv.toFixed(1)}%`;
  document.getElementById('classe').textContent = classe;
  document.getElementById('classe-desc').textContent = classeDesc;
  document.getElementById('amplitude').textContent = amplitude.toFixed(3);
  document.getElementById('minimo').textContent = minimo.toFixed(3);
  document.getElementById('maximo').textContent = maximo.toFixed(3);

  const tbody = document.getElementById('readings-table-body');
  tbody.innerHTML = '';
  leituras.forEach((val, idx) => {
    let classeLeitura;
    if (val < 0.125) classeLeitura = '0.00';
    else if (val < 0.375) classeLeitura = '0.25';
    else if (val < 0.625) classeLeitura = '0.50';
    else if (val < 0.875) classeLeitura = '0.75';
    else classeLeitura = '1.00';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>L${idx + 1}</td>
      <td>${val.toFixed(2)}</td>
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
    distVisada: document.getElementById('distVisada')?.value ?? '',
    campoModo,
    campoLargura,
    campoAltura,
    areaCampo,
    areaCobertaMedia,
    areaCobertaTotal,
    leituras,
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
  if (!window.ultimaDados) {
    mostrarMensagem('Erro: Execute o cálculo primeiro', 'error');
    return;
  }

  const numEl = document.getElementById('numLeituras');
  if (numEl) {
    const numAtual = parseInt(numEl.value, 10);
    if (Number.isFinite(numAtual) && window.ultimaDados.numLeituras && numAtual !== window.ultimaDados.numLeituras) {
      mostrarMensagem('Atenção: o número de leituras foi alterado após o cálculo. Recalcule antes de exportar.', 'error');
      return;
    }
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    mostrarMensagem('Erro: biblioteca de PDF não carregou (jsPDF). Verifique internet/CSP.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4'); // A4: 210 x 297 mm

  const dados = {
    ...window.ultimaDados,
    projeto: document.getElementById('projeto')?.value ?? window.ultimaDados.projeto,
    local: document.getElementById('local')?.value ?? window.ultimaDados.local,
    data: document.getElementById('data')?.value ?? window.ultimaDados.data,
    hora: document.getElementById('hora')?.value ?? window.ultimaDados.hora,
    operador: document.getElementById('operador')?.value ?? window.ultimaDados.operador,
    area: document.getElementById('area')?.value ?? window.ultimaDados.area,
    luz: document.getElementById('luz')?.value ?? window.ultimaDados.luz,
    sombra: document.getElementById('sombra')?.value ?? window.ultimaDados.sombra,
    vento: document.getElementById('vento')?.value ?? window.ultimaDados.vento,
    precip: document.getElementById('precip')?.value ?? window.ultimaDados.precip,
    chuva: document.getElementById('chuva')?.value ?? window.ultimaDados.chuva,
    umidade: document.getElementById('umidade')?.value ?? window.ultimaDados.umidade,
    notas: document.getElementById('notas')?.value ?? window.ultimaDados.notas,
    distVisada: document.getElementById('distVisada')?.value ?? window.ultimaDados.distVisada,
    campoModo: document.getElementById('campoModo')?.value ?? window.ultimaDados.campoModo,
    campoLargura: document.getElementById('campoLargura')?.value ?? window.ultimaDados.campoLargura,
    campoAltura: document.getElementById('campoAltura')?.value ?? window.ultimaDados.campoAltura,
  };

  // Configurações de estilo
  const primaryColor = [26, 95, 122]; // Azul principal
  const headerHeight = 25;
  let y = 0;

  // --- HEADER ---
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, headerHeight, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('ICS ANALYZER - Relatório Técnico', 15, 16);
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 195, 16, { align: 'right' });
  
  y = 35;
  
  // --- SEÇÃO DE DADOS (2 COLUNAS) ---
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('DADOS DO PROJETO', 15, y);
  doc.text('CONDIÇÕES AMBIENTAIS', 110, y);
  
  y += 5;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  
  const startYValues = y;
  const leftX = 15;
  const rightX = 110;
  const lineHeight = 5;
  
  // Coluna Esquerda
  doc.text(`Projeto: ${dados.projeto || '-'}`, leftX, y); y += lineHeight;
  doc.text(`Local: ${dados.local || '-'}`, leftX, y); y += lineHeight;
  doc.text(`Unidade Amostral: ${dados.area || '-'}`, leftX, y); y += lineHeight;
  doc.text(`Data: ${dados.data || '-'} | Hora: ${dados.hora || '-'}`, leftX, y); y += lineHeight;
  doc.text(`Operador: ${dados.operador || '-'}`, leftX, y); y += lineHeight;

  // Coluna Direita (reset Y)
  const yEnv = startYValues;
  let yRight = yEnv;
  doc.text(`Céu/Iluminação: ${dados.luz || '-'}`, rightX, yRight); yRight += lineHeight;
  doc.text(`Sombra: ${dados.sombra || '-'}`, rightX, yRight); yRight += lineHeight;
  doc.text(`Vento: ${dados.vento || '-'}`, rightX, yRight); yRight += lineHeight;
  doc.text(`Chuva Recente: ${dados.chuva || '-'}`, rightX, yRight); yRight += lineHeight;
  doc.text(`Obs: ${dados.notas || '-'}`, rightX, yRight); yRight += lineHeight;
  
  y = Math.max(y, yRight) + 5;

  // --- CALIBRAÇÃO (SE HOUVER) ---
  if (dados.campoModo === 'retangular' || dados.distVisada) {
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    doc.line(15, y, 195, y);
    y += 5;
    
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text('CALIBRAÇÃO / GEOMETRIA', 15, y);
    y += 5;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    let calibText = `Distância: ${dados.distVisada || '-'} m`;
    if (dados.campoModo === 'retangular') {
      calibText += ` | Geometria: Retangular (${dados.campoLargura}m x ${dados.campoAltura}m)`;
      if (typeof dados.areaCampo === 'number') calibText += ` | Área: ${dados.areaCampo.toFixed(2)} m²`;
    }
    doc.text(calibText, 15, y);
    y += 8;
  } else {
    y += 3;
  }

  // --- RESULTADOS (BOX EM DESTAQUE) ---
  const boxHeight = 35;
  doc.setFillColor(248, 249, 250); // Fundo cinza claro
  doc.setDrawColor(220);
  doc.rect(15, y, 180, boxHeight, 'FD');
  
  const resInnerY = y + 8;
  
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryColor);
  doc.text('RESULTADOS DA ANÁLISE', 20, resInnerY);
  
  doc.setFontSize(14); // Destaque
  doc.text(`ICS: ${dados.media.toFixed(3)}`, 20, resInnerY + 10);
  doc.text(`Cobertura: ${dados.percentual.toFixed(1)}%`, 85, resInnerY + 10);
  
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont(undefined, 'bold');
  doc.text(`Classe: ${dados.classe}`, 20, resInnerY + 20);
  doc.setFont(undefined, 'normal');
  doc.text(`(${dados.classeDesc})`, 50, resInnerY + 20);
  
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Desvio: ${dados.desvio.toFixed(3)} | CV: ${dados.cv.toFixed(1)}% | Amplitude: ${dados.amplitude.toFixed(3)}`, 20, resInnerY + 26);
  
  y += boxHeight + 8; // Avança após o box
  
  // --- GRÁFICOS (APENAS BARRAS) ---
  if (y + 60 > 280) { doc.addPage(); y = 20; }
  
  doc.setTextColor(0);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('ANÁLISE GRÁFICA', 15, y);
  y += 5;
  
  // Configuração visual dos gráficos
  const theme = {
    panelHex: '#FFFFFF',
    barAHex: '#1a5f7a',
    barBHex: '#6ab0de',
    hatchHex: null, // Sem hachuras
  };
  
  // Gráfico centralizado e sem boxplot
  const chartW = 90;
  const chartH = 50; 
  const chartX = (210 - chartW) / 2; // Centralizado (60mm)

  desenharBarrasFrequenciaICS(doc, chartX, y, chartW, chartH, dados.leituras, theme);
  
  y += chartH + 10;
  
  // --- TABELA DE LEITURAS ---
  if (y + 15 > 280) { doc.addPage(); y = 20; }
  
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('DETALHAMENTO DAS LEITURAS', 15, y);
  y += 6;
  
  // Tabela mais estreita e centralizada
  const tableWidth = 160;
  const tableX = (210 - tableWidth) / 2; // 25mm margem
  
  // Cabeçalho da Tabela
  function drawTableHeader(posY) {
    doc.setFillColor(...primaryColor);
    doc.rect(tableX, posY, tableWidth, 7, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    
    // Colunas: #, ICS, Cobertura, Classe, Situação
    doc.text('#', tableX + 5, posY + 5);
    doc.text('Valor ICS', tableX + 25, posY + 5);
    doc.text('Cobertura (%)', tableX + 55, posY + 5);
    doc.text('Classe', tableX + 90, posY + 5);
    doc.text('Situação', tableX + 120, posY + 5);
    
    doc.setTextColor(0);
    return posY + 7;
  }
  
  y = drawTableHeader(y);
  
  doc.setFont(undefined, 'normal');
  
  dados.leituras.forEach((val, i) => {
    // Nova página se necessário
    if (y > 280) {
      doc.addPage();
      y = 20;
      y = drawTableHeader(y);
    }
    
    // Zebra striping SUTIL ou removida (user disse zebra das BARRAS, mas tabelas clean são boas)
    // Mantendo zebra de tabela pois o pedido foi "zebra das barras"
    if (i % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(tableX, y, tableWidth, 6, 'F');
    }
    
    let classeLeitura;
    let classeDescCurta;
    
    if (val < 0.125) { classeLeitura = '0.00'; classeDescCurta = 'Solo Exposto'; }
    else if (val < 0.375) { classeLeitura = '0.25'; classeDescCurta = 'Baixa'; }
    else if (val < 0.625) { classeLeitura = '0.50'; classeDescCurta = 'Intermediária'; }
    else if (val < 0.875) { classeLeitura = '0.75'; classeDescCurta = 'Alta'; }
    else { classeLeitura = '1.00'; classeDescCurta = 'Total'; }
    
    doc.setFontSize(9);
    doc.text(`L${i + 1}`, tableX + 5, y + 4);
    doc.text(val.toFixed(2), tableX + 25, y + 4);
    doc.text(`${(val * 100).toFixed(1)}%`, tableX + 55, y + 4);
    doc.text(classeLeitura, tableX + 90, y + 4);
    doc.text(classeDescCurta, tableX + 120, y + 4);
    
    // Linha sutil separadora apenas na área da tabela
    doc.setDrawColor(230);
    doc.line(tableX, y + 6, tableX + tableWidth, y + 6);
    
    y += 6;
  });
  
  // --- RODAPÉ ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount} - ICS Analyzer`, 105, 290, { align: 'center' });
  }

  const nomeArquivo = `ICS_${dados.projeto || 'Analise'}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(nomeArquivo);
  mostrarMensagem(`✓ PDF exportado: ${nomeArquivo}`, 'success');
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
  document.getElementById('area-results')?.classList?.add('hidden');
  setupLeituras();
  setupCampoCalibracao();
}

window.addEventListener('load', () => {
  const numLeiturasEl = document.getElementById('numLeituras');
  const btnCalcular = document.getElementById('btnCalcular');
  const btnExportar = document.getElementById('btnExportarPDF');
  const btnLimpar = document.getElementById('btnLimpar');

  const campoModoEl = document.getElementById('campoModo');

  // Ajuda (modal)
  const btnAjudaLeituras = document.getElementById('btnAjudaLeituras');
  const ajudaModal = document.getElementById('ajudaModal');
  const btnFecharAjuda = document.getElementById('btnFecharAjuda');

  const setAjudaOpen = (open) => {
    if (!ajudaModal) return;
    ajudaModal.classList.toggle('open', open);
    ajudaModal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      btnFecharAjuda?.focus?.();
    } else {
      btnAjudaLeituras?.focus?.();
    }
  };

  if (numLeiturasEl) {
    numLeiturasEl.addEventListener('change', setupLeituras);
  }

  if (campoModoEl) {
    campoModoEl.addEventListener('change', setupCampoCalibracao);
  }

  if (btnAjudaLeituras) {
    btnAjudaLeituras.addEventListener('click', () => setAjudaOpen(true));
  }

  if (btnFecharAjuda) {
    btnFecharAjuda.addEventListener('click', () => setAjudaOpen(false));
  }

  if (ajudaModal) {
    ajudaModal.addEventListener('click', (e) => {
      if (e.target === ajudaModal) setAjudaOpen(false);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ajudaModal?.classList.contains('open')) {
      setAjudaOpen(false);
    }
  });

  if (btnCalcular) btnCalcular.addEventListener('click', calcular);
  if (btnExportar) btnExportar.addEventListener('click', exportarPDF);
  if (btnLimpar) btnLimpar.addEventListener('click', limpar);

  setupLeituras();
  setupCampoCalibracao();

  const dataEl = document.getElementById('data');
  if (dataEl) dataEl.valueAsDate = new Date();
});
