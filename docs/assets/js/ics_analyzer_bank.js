/* ICS Analyzer - Banco local (IndexedDB) + import/export CSV

   Objetivo: manter um "banco" persistente no navegador para alimentar modelos ao longo do tempo,
   inclusive com importações tardias de séries históricas no formato do template.
*/

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ICSBank = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'ics_analyzer_bank';
  const DB_VERSION = 1;

  const STORE_ISPC = 'ispc_records';

  const TEMPLATE_HEADER = [
    'ano',
    'profundidade_cm',
    'parcela',
    'cultura',
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

  const safeString = (v) => String(v ?? '').trim();

  const normalizeNumberCell = (raw) => {
    const s = safeString(raw);
    if (!s) return null;
    const n = Number.parseFloat(s.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponível neste ambiente.'));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_ISPC)) {
          const store = db.createObjectStore(STORE_ISPC, { keyPath: 'uid' });
          store.createIndex('ano', 'ano', { unique: false });
          store.createIndex('profundidade_cm', 'profundidade_cm', { unique: false });
          store.createIndex('parcela', 'parcela', { unique: false });
          store.createIndex('cultura', 'cultura', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir IndexedDB.'));
    });
  }

  function withStore(storeName, mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const out = fn(store);
      tx.oncomplete = () => {
        try { db.close(); } catch { /* ignore */ }
        resolve(out);
      };
      tx.onerror = () => {
        try { db.close(); } catch { /* ignore */ }
        reject(tx.error || new Error('Falha na transação IndexedDB.'));
      };
    }));
  }

  function makeUID(rec) {
    const parts = [
      safeString(rec.ano),
      safeString(rec.profundidade_cm),
      safeString(rec.parcela),
      safeString(rec.cultura),
      safeString(rec.dmg),
      safeString(rec.dmp),
      safeString(rec.rmp),
      safeString(rec.densidade),
      safeString(rec.estoque_c),
      safeString(rec.na),
      safeString(rec.icv),
      safeString(rec.altura),
      safeString(rec.diam_espiga),
      safeString(rec.comp_espiga),
      safeString(rec.n_plantas),
      safeString(rec.n_espigas),
      safeString(rec.n_espigas_com),
      safeString(rec.peso_espigas),
      safeString(rec.produtividade),
    ];
    return parts.join('|');
  }

  function sanitizeISPCRecord(input) {
    const rec = input || {};
    const out = {
      ano: safeString(rec.ano) ? Number.parseInt(safeString(rec.ano), 10) : null,
      profundidade_cm: safeString(rec.profundidade_cm),
      parcela: safeString(rec.parcela),
      cultura: safeString(rec.cultura),

      dmg: normalizeNumberCell(rec.dmg),
      dmp: normalizeNumberCell(rec.dmp),
      rmp: normalizeNumberCell(rec.rmp),
      densidade: normalizeNumberCell(rec.densidade),
      estoque_c: normalizeNumberCell(rec.estoque_c),
      na: normalizeNumberCell(rec.na),
      icv: normalizeNumberCell(rec.icv),
      altura: normalizeNumberCell(rec.altura),
      diam_espiga: normalizeNumberCell(rec.diam_espiga),
      comp_espiga: normalizeNumberCell(rec.comp_espiga),
      n_plantas: normalizeNumberCell(rec.n_plantas),
      n_espigas: normalizeNumberCell(rec.n_espigas),
      n_espigas_com: normalizeNumberCell(rec.n_espigas_com),
      peso_espigas: normalizeNumberCell(rec.peso_espigas),
      produtividade: normalizeNumberCell(rec.produtividade),

      updatedAt: new Date().toISOString(),
    };

    out.uid = makeUID(out);
    return out;
  }

  function parseCSVText(txt) {
    const raw = String(txt ?? '').trim();
    if (!raw) return { header: [], rows: [] };

    const lines = raw.split(/\r?\n/).filter((l) => String(l).trim().length);
    if (!lines.length) return { header: [], rows: [] };

    const header = lines[0].split(',').map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(',');
      const row = {};
      for (let j = 0; j < header.length; j += 1) {
        const key = header[j];
        row[key] = (parts[j] ?? '').trim();
      }
      rows.push(row);
    }

    return { header, rows };
  }

  function toCSV(header, rows) {
    const esc = (s) => {
      const str = safeString(s);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [];
    lines.push(header.join(','));
    for (const r of rows) {
      const cells = header.map((k) => {
        const v = r[k];
        if (v === null || typeof v === 'undefined') return '';
        return esc(v);
      });
      lines.push(cells.join(','));
    }
    return lines.join('\n') + '\n';
  }

  async function upsertISPCRecords(records) {
    const clean = (records || []).map(sanitizeISPCRecord).filter((r) => r && r.uid);
    if (!clean.length) return { added: 0, total: 0 };

    await withStore(STORE_ISPC, 'readwrite', (store) => {
      for (const r of clean) store.put(r);
    });

    return { added: clean.length, total: clean.length };
  }

  async function addISPCRecord(record) {
    const r = sanitizeISPCRecord(record);
    if (!r.uid) return { ok: false };
    await withStore(STORE_ISPC, 'readwrite', (store) => {
      store.put(r);
    });
    return { ok: true, uid: r.uid };
  }

  async function countISPCRecords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ISPC, 'readonly');
      const store = tx.objectStore(STORE_ISPC);
      const req = store.count();
      req.onsuccess = () => {
        try { db.close(); } catch { /* ignore */ }
        resolve(req.result || 0);
      };
      req.onerror = () => {
        try { db.close(); } catch { /* ignore */ }
        reject(req.error || new Error('Falha ao contar registros.'));
      };
    });
  }

  async function getAllISPCRecords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ISPC, 'readonly');
      const store = tx.objectStore(STORE_ISPC);
      const req = store.getAll();
      req.onsuccess = () => {
        try { db.close(); } catch { /* ignore */ }
        resolve(req.result || []);
      };
      req.onerror = () => {
        try { db.close(); } catch { /* ignore */ }
        reject(req.error || new Error('Falha ao ler registros.'));
      };
    });
  }

  async function clearISPCRecords() {
    await withStore(STORE_ISPC, 'readwrite', (store) => store.clear());
    return { ok: true };
  }

  async function exportISPCRecordsCSV() {
    const rows = await getAllISPCRecords();
    const outRows = rows.map((r) => {
      const obj = {};
      for (const k of TEMPLATE_HEADER) obj[k] = (r[k] ?? '');
      return obj;
    });
    return toCSV(TEMPLATE_HEADER, outRows);
  }

  async function importISPCRecordsCSVText(txt) {
    const parsed = parseCSVText(txt);
    const header = parsed.header || [];
    const rows = parsed.rows || [];

    const headerSet = new Set(header.map((h) => String(h).trim()));
    const missingRequired = TEMPLATE_HEADER.filter((k) => !headerSet.has(k));

    if (missingRequired.length) {
      return {
        ok: false,
        error: `CSV inválido. Faltam colunas obrigatórias: ${missingRequired.join(', ')}`
      };
    }

    const toInsert = rows.map((r) => {
      const obj = {};
      for (const k of TEMPLATE_HEADER) obj[k] = r[k];
      return obj;
    });

    const res = await upsertISPCRecords(toInsert);
    return { ok: true, added: res.added };
  }

  return {
    TEMPLATE_HEADER,
    addISPCRecord,
    countISPCRecords,
    getAllISPCRecords,
    clearISPCRecords,
    exportISPCRecordsCSV,
    importISPCRecordsCSVText,
  };
}));
