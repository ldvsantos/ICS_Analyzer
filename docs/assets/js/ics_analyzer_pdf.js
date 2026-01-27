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
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
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

function desenharAreaChartICS(doc, x, y, w, h, valores, theme) {
  const { panelHex = '#FFFFFF', lineHex = '#1a5f7a', fillHex = '#b7e4c7' } = theme || {};
  const panel = hexToRgb(panelHex);
  const line = hexToRgb(lineHex);
  const fill = hexToRgb(fillHex);

  // Fundo
  doc.setFillColor(panel.r, panel.g, panel.b);
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'FD');

  const padLeft = 10;
  const padRight = 5;
  const padTop = 5;
  const padBottom = 10;

  const plotX = x + padLeft;
  const plotY = y + padTop;
  const plotW = w - (padLeft + padRight);
  const plotH = h - (padTop + padBottom);

  // Escalas Eixos
  // X: 1 até n (valores.length)
  const n = valores.length;
  // Y: 0.0 a 1.0 (fixo)

  const getX = (i) => plotX + (i / (n - 1)) * plotW;
  const getY = (v) => plotY + (1 - clamp01(v)) * plotH;

  // Desenhar Eixos e Grid Y
  doc.setDrawColor(220);
  doc.setLineWidth(0.1);
  const ticksY = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  doc.setFontSize(7);
  doc.setTextColor(100);

  ticksY.forEach(t => {
    const yy = getY(t);
    doc.line(plotX, yy, plotX + plotW, yy);
    doc.text(`${Math.round(t * 100)}%`, plotX - 2, yy + 1, { align: 'right' });
  });

  // Grid X (opcional, só ticks)
  for (let i = 0; i < n; i++) {
    const xx = getX(i);
    // apenas ticks nas bordas ou em todos? Todos
    doc.line(xx, plotY + plotH, xx, plotY + plotH + 1);
    // Labels X (ex: 1, 5, 10...)
    if (n <= 16 || i % 2 === 0) { // Se muitos pontos, pula labels
      doc.text(String(i + 1), xx, plotY + plotH + 4, { align: 'center' });
    }
  }

  // Desenhar Área (Polígono)
  // Começa em (0,0) -> (0, v0) -> ... -> (n, vn) -> (n, 0)
  
  if (n > 1) {
    const lines = [];
    // Ponto inicial base (bottom-left)
    lines.push({ op: 'm', c: [getX(0), plotY + plotH] });
    
    // Pontos dos dados
    valores.forEach((v, i) => {
      lines.push({ op: 'l', c: [getX(i), getY(v)] });
    });
    
    // Ponto final base (bottom-right)
    lines.push({ op: 'l', c: [getX(n - 1), plotY + plotH] });
    
    // Fechar
    lines.push({ op: 'h' });

    doc.setFillColor(fill.r, fill.g, fill.b);
    // doc.path(lines) é suportado no jsPDF moderno? Sim, ou usamos lines.
    // Alternativa segura: construir array de coords e usar .lines() ou triangle strip
    // Vamos usar linhas manuais ou triangle strip? path é melhor.
    // Mas jsPDF `path` api pode ser complexa. Vamos desenhar contorno preenchido.
    
    doc.saveGraphicsState();
    doc.setDrawColor(line.r, line.g, line.b); // Cor da linha, mas aqui é area
    // Hack: desenhar shape fechado
    doc.moveTo(getX(0), plotY + plotH);
    valores.forEach((v, i) => doc.lineTo(getX(i), getY(v)));
    doc.lineTo(getX(n - 1), plotY + plotH);
    // jsPDF provides close() to close the current path, not closePath().
    if (typeof doc.close === 'function') doc.close();
    doc.fill(); 
    doc.restoreGraphicsState();
    
    // Desenhar Linha Grossa por cima
    doc.setDrawColor(line.r, line.g, line.b);
    doc.setLineWidth(0.4);
    valores.forEach((v, i) => {
      if (i === 0) doc.moveTo(getX(i), getY(v));
      else doc.lineTo(getX(i), getY(v));
    });
    doc.stroke();
  }

  // Títulos Eixos
  doc.setTextColor(50);

  // Eixo Y: um pouco menor e mais próximo do eixo
  const yAxisLabel = 'Cálculo de índices de conservação do solo ICS (%)';
  doc.setFontSize(7);
  // jsPDF: com rotação, o alinhamento pode ficar “estranho”; centraliza manualmente.
  // getTextWidth retorna largura em mm para o fontSize atual.
  const yAxisLabelLen = doc.getTextWidth(yAxisLabel);
  doc.text(yAxisLabel, plotX - 8, plotY + (plotH / 2) + (yAxisLabelLen / 2), { angle: 90, align: 'left' });

  // Eixo X
  doc.setFontSize(8);
  doc.text('Pontos de Leitura (L)', plotX + plotW / 2, plotY + plotH + 9, { align: 'center' });
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

  document.getElementById('media').textContent = media.toFixed(3);
  document.getElementById('percentual').textContent = `${percentual.toFixed(1)}%`;

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
    
    doc.setFont(undefined, 'normal');
    doc.text(String(value || '-'), x + 2 + labelW + 2, y + 4.5);
    
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
  const rowH = box1Height / 5; // 5 linhas de 8mm

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
  drawField('Obs/Clima', `${d.textoClima || (d.luz + ' ' + d.notas).trim()}`, fieldsX, yBox1 + rowH * 4, fieldsW, rowH);

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
  drawGenBox('Classificação', classeTxt, 1, { labelRatio: 0.68, labelFontSize: 7, valueFontSize: 7 });
  drawGenBox('Amplitude', ampTxt, 2);
  drawGenBox('Min..Max', `${minTxt}..${maxTxt}`, 3, { labelRatio: 0.62, labelFontSize: 7, valueFontSize: 7 });

  y += rowGenH + 5;

  // Linha extra (opcional): Áreas em m² quando houver calibração W/H
  if (typeof d.areaCampo === 'number') {
    const areaMediaTxt = typeof d.areaCobertaMedia === 'number' ? d.areaCobertaMedia.toFixed(2) : '-';
    const areaTotalTxt = typeof d.areaCobertaTotal === 'number' ? d.areaCobertaTotal.toFixed(2) : '-';
    const areaCampoTxt = d.areaCampo.toFixed(2);

    // Labels longos: usar fonte menor e dar mais largura para o label.
    const areaBoxOpts = { labelRatio: 0.72, labelFontSize: 7, valueFontSize: 7 };
    drawGenBox('A campo (m²)', areaCampoTxt, 0, areaBoxOpts);
    drawGenBox('Área cob. média (m²)', areaMediaTxt, 1, areaBoxOpts);
    drawGenBox('Área cob. total (m²)', areaTotalTxt, 2, areaBoxOpts);
    drawGenBox('Dist. visada (m)', d.distVisada || '-', 3, areaBoxOpts);
    y += rowGenH + 5;
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

  // Preview da imagem do croqui
  const inputCroqui = document.getElementById('inputCroqui');
  const previewCroqui = document.getElementById('previewCroqui');
  
  if (inputCroqui) {
    inputCroqui.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (previewCroqui) {
            previewCroqui.src = evt.target.result;
            previewCroqui.style.display = 'block';
          }
          // Guarda base64 globalmente para usar no PDF
          window.imagemCroquiBase64 = evt.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        if (previewCroqui) {
          previewCroqui.src = '';
          previewCroqui.style.display = 'none';
        }
        window.imagemCroquiBase64 = null;
      }
    });
  }

  setupLeituras();
  setupCampoCalibracao();

  const dataEl = document.getElementById('data');
  if (dataEl) dataEl.valueAsDate = new Date();
});
