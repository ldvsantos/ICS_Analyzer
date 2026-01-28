const fs = require('fs');
const path = require('path');

// Reaproveita o mesmo motor fuzzy usado no navegador.
// (Ele já é UMD e exporta module.exports quando rodando em Node.)
const ICS_Fuzzy = require(path.join('..', 'docs', 'assets', 'js', 'ics_analyzer_fuzzy.js'));

function parseCSV(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8').trim();
  const lines = txt.split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    const row = {};
    for (let j = 0; j < header.length; j += 1) {
      const key = header[j];
      const raw = parts[j] ?? '';
      if (['ano', 'profundidade_cm', 'parcela', 'cultura'].includes(key)) {
        row[key] = raw;
      } else {
        const v = Number(raw);
        row[key] = Number.isFinite(v) ? v : null;
      }
    }
    rows.push(row);
  }

  return rows;
}

function rmse(values) {
  if (!values.length) return null;
  const mse = values.reduce((acc, v) => acc + (v * v), 0) / values.length;
  return Math.sqrt(mse);
}

function mae(values) {
  if (!values.length) return null;
  return values.reduce((acc, v) => acc + Math.abs(v), 0) / values.length;
}

function classIndex(label) {
  if (!label) return null;
  const s = String(label).toLowerCase();
  if (s.startsWith('baix')) return 0;
  if (s.startsWith('méd') || s.startsWith('med')) return 1;
  if (s.startsWith('alt')) return 2;
  return null;
}

function analyzeTag(tag) {
  const recordsPath = path.join('data', 'ispc', `ispc_records_${tag}.csv`);
  const rows = parseCSV(recordsPath);

  const deltas = [];
  const absDeltas = [];
  const sqErrs = [];
  const confusion = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  let nTotal = 0;
  let nUsed = 0;
  let nAgree = 0;
  let maxAbsDelta = 0;

  for (const row of rows) {
    nTotal += 1;

    const full = ICS_Fuzzy.evaluateISPC(row);

    const reducedInputs = {
      dmg: row.dmg,
      estoque_c: row.estoque_c,
      na: row.na,
      icv: row.icv,
      altura: row.altura,
      diam_espiga: row.diam_espiga,
      comp_espiga: row.comp_espiga,
      n_plantas: row.n_plantas,
      n_espigas: row.n_espigas,
      produtividade: row.produtividade
    };

    const reduced = ICS_Fuzzy.evaluateISPCReduced(reducedInputs, { depthTag: tag });

    if (!Number.isFinite(full.score) || !Number.isFinite(reduced.score)) {
      continue;
    }

    nUsed += 1;

    const delta = reduced.score - full.score;
    deltas.push(delta);
    absDeltas.push(Math.abs(delta));
    sqErrs.push(delta);
    if (Math.abs(delta) > maxAbsDelta) maxAbsDelta = Math.abs(delta);

    const ciFull = classIndex(full.classLabel);
    const ciRed = classIndex(reduced.classLabel);

    if (ciFull !== null && ciRed !== null) {
      confusion[ciFull][ciRed] += 1;
      if (ciFull === ciRed) nAgree += 1;
    }
  }

  const meanDelta = deltas.length ? (deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  const rmseDelta = rmse(sqErrs);
  const maeDelta = mae(deltas);

  return {
    tag,
    nTotal,
    nUsed,
    meanDelta,
    mae: maeDelta,
    rmse: rmseDelta,
    maxAbsDelta,
    classAgreementPct: nUsed ? (100 * nAgree / nUsed) : null,
    confusion,
    notes: {
      reducedInputsCount: 10,
      estimatedInputs: ['dmp', 'rmp', 'densidade', 'n_espigas_com', 'peso_espigas'],
      calibration: 'modelos lineares ajustados no banco (calibracao primaria: 0-10 cm)'
    }
  };
}

function renderMarkdown(summary) {
  const fmt = (v, digits) => (Number.isFinite(v) ? v.toFixed(digits) : 'NA');

  const lines = [];
  lines.push(`# Analise de sensibilidade - ISPC (${summary.tag})`);
  lines.push('');
  lines.push(`- Total de registros: **${summary.nTotal}**`);
  lines.push(`- Registros validos (comparaveis): **${summary.nUsed}**`);
  lines.push(`- Entradas no modo reduzido: **10** (estima 5)`);
  lines.push('');
  lines.push('## Erro no score (0-10)');
  lines.push('');
  lines.push(`- Delta medio (reduzido - completo): ${fmt(summary.meanDelta, 3)}`);
  lines.push(`- MAE: ${fmt(summary.mae, 3)}`);
  lines.push(`- RMSE: ${fmt(summary.rmse, 3)}`);
  lines.push(`- Max |delta|: ${fmt(summary.maxAbsDelta, 3)}`);
  lines.push('');
  lines.push('## Concordancia de classe');
  lines.push('');
  lines.push(`- Concordancia (%): ${fmt(summary.classAgreementPct, 1)}`);
  lines.push('');
  lines.push('## Matriz de confusao (linhas = completo; colunas = reduzido)');
  lines.push('');
  lines.push('| | Baixa | Media | Alta |');
  lines.push('|---:|---:|---:|---:|');
  lines.push(`| Baixa | ${summary.confusion[0][0]} | ${summary.confusion[0][1]} | ${summary.confusion[0][2]} |`);
  lines.push(`| Media | ${summary.confusion[1][0]} | ${summary.confusion[1][1]} | ${summary.confusion[1][2]} |`);
  lines.push(`| Alta | ${summary.confusion[2][0]} | ${summary.confusion[2][1]} | ${summary.confusion[2][2]} |`);
  lines.push('');
  lines.push('## Observacoes');
  lines.push('');
  lines.push(`- ${summary.notes.calibration}`);
  lines.push(`- Variaveis estimadas: ${summary.notes.estimatedInputs.join(', ')}`);
  lines.push('');

  return lines.join('\n');
}

function main() {
  const tag = process.argv[2] || 'dados_010';
  const summary = analyzeTag(tag);

  const outJson = path.join('data', 'ispc', `ispc_sensitivity_${tag}.json`);
  const outMd = path.join('data', 'ispc', `ispc_sensitivity_${tag}.md`);

  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(outMd, renderMarkdown(summary), 'utf8');

  process.stdout.write(JSON.stringify({ ok: true, outJson, outMd, summary }, null, 2));
}

main();
