/* ICS Analyzer - utilitários compartilhados */

function parseNumberPtBr(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function sumArray(values) {
  return (values || []).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function sumLast(values, n) {
  const arr = (values || []).filter((v) => Number.isFinite(v));
  const slice = arr.slice(Math.max(0, arr.length - n));
  return sumArray(slice);
}

function avgArray(values) {
  const arr = (values || []).filter((v) => Number.isFinite(v));
  if (arr.length === 0) return null;
  return sumArray(arr) / arr.length;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function textureToKNorm(textura) {
  const t = String(textura ?? '').toLowerCase();
  if (t === 'arenosa') return 0.8;
  if (t === 'media') return 0.5;
  if (t === 'argilosa') return 0.3;
  return null;
}

function textureToKUsle(textura) {
  const t = String(textura ?? '').toLowerCase();
  // Aproximações operacionais (ordem de grandeza). Não usar como laudo.
  if (t === 'arenosa') return 0.05;
  if (t === 'media') return 0.03;
  if (t === 'argilosa') return 0.02;
  return null;
}

function estimateLSRUSLE(declividadePct, comprimentoM) {
  const slopePct = Number(declividadePct);
  const lengthM = Number(comprimentoM);
  if (!Number.isFinite(slopePct) || !Number.isFinite(lengthM) || lengthM <= 0) return null;

  const s = slopePct / 100;
  const theta = Math.atan(s);
  const sinTheta = Math.sin(theta);

  const beta = (sinTheta / 0.0896) / (3 * Math.pow(sinTheta, 0.8) + 0.56);
  const m = beta / (1 + beta);
  const L = Math.pow(lengthM / 22.13, m);
  const S = slopePct < 9 ? (10.8 * sinTheta + 0.03) : (16.8 * sinTheta - 0.50);
  return L * S;
}

function estimateRProxyFromPrecipDaily(precipDailyMm) {
  const arr = (precipDailyMm || []).filter((v) => Number.isFinite(v) && v > 0);
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const mm of arr) sum += Math.pow(mm, 1.5);
  // Escala escolhida para gerar números em ordem de grandeza útil no app.
  // É um proxy (sem EI30) — interpretação no modal.
  return sum * 100;
}

function classificarRisco(score) {
  if (!Number.isFinite(score)) return { classe: 'Indisponível', desc: 'Sem dados suficientes' };
  if (score < 33) return { classe: 'Baixo', desc: 'Condição estrutural mais resiliente para a energia do evento' };
  if (score < 66) return { classe: 'Médio', desc: 'Risco intermediário, priorizar reforço de cobertura e microconservação' };
  return { classe: 'Alto', desc: 'Alta sensibilidade, priorizar intervenção conservacionista imediata' };
}

function classificarIMC(score) {
  if (!Number.isFinite(score)) return { classe: 'Indisponível', desc: 'Sem dados suficientes' };
  if (score >= 80) return { classe: 'Ótimo', desc: 'Proteção alta e distribuição mais estável' };
  if (score >= 60) return { classe: 'Bom', desc: 'Proteção adequada com variabilidade controlável' };
  if (score >= 40) return { classe: 'Atenção', desc: 'Proteção limitada, risco de hotspots de escoamento' };
  return { classe: 'Crítico', desc: 'Cobertura insuficiente, alta probabilidade de perda por splash e enxurrada' };
}
