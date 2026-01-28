const fs = require('fs');
const path = require('path');

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

function linreg(rows, xKey, yKey) {
  const xs = [];
  const ys = [];

  for (const r of rows) {
    const x = r[xKey];
    const y = r[yKey];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }

  const n = xs.length;
  if (n === 0) {
    return { x: xKey, y: yKey, n: 0, intercept: 0, slope: 0, r2: 0 };
  }

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(xs);
  const my = mean(ys);

  let sxx = 0;
  let sxy = 0;
  let syy = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const slope = sxx === 0 ? 0 : (sxy / sxx);
  const intercept = my - slope * mx;
  const r2 = (sxx === 0 || syy === 0) ? 1 : ((sxy * sxy) / (sxx * syy));

  return { x: xKey, y: yKey, n, intercept, slope, r2 };
}

function fitModels(tag) {
  const recordsPath = path.join('data', 'ispc', `ispc_records_${tag}.csv`);
  const rows = parseCSV(recordsPath);

  const models = {
    tag,
    regressions: {
      dmp_from_dmg: linreg(rows, 'dmg', 'dmp'),
      rmp_from_dmg: linreg(rows, 'dmg', 'rmp'),
      densidade_from_estoque_c: linreg(rows, 'estoque_c', 'densidade'),
      n_espigas_com_from_produtividade: linreg(rows, 'produtividade', 'n_espigas_com'),
      peso_espigas_from_produtividade: linreg(rows, 'produtividade', 'peso_espigas')
    }
  };

  return models;
}

function main() {
  const tags = process.argv.slice(2);
  const use = tags.length ? tags : ['dados_010', 'dados_1020'];
  const out = {};
  for (const tag of use) {
    out[tag] = fitModels(tag);
  }
  process.stdout.write(JSON.stringify(out, null, 2));
}

main();
