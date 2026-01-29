/* ICS Analyzer - helpers de PDF */

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').trim();
  if (clean.length !== 6) return { r: 0, g: 0, b: 0 };
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
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
  const yAxisLabel = 'Índice de Cobertura do Solo ICS (%)';
  doc.setFontSize(7);
  // jsPDF: com rotação, o alinhamento pode ficar “estranho”; centraliza manualmente.
  // getTextWidth retorna largura em mm para o fontSize atual.
  const yAxisLabelLen = doc.getTextWidth(yAxisLabel);
  doc.text(yAxisLabel, plotX - 8, plotY + (plotH / 2) + (yAxisLabelLen / 2), { angle: 90, align: 'left' });

  // Eixo X
  doc.setFontSize(8);
  doc.text('Pontos de Leitura (L)', plotX + plotW / 2, plotY + plotH + 9, { align: 'center' });
}
