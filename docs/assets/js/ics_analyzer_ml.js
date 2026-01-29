/* ICS Analyzer - ML online (cliente, offline) */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ICSML = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 'v1';
  const STORAGE_PREFIX = `icsml.${VERSION}.`;

  const safeStringify = (obj) => {
    try { return JSON.stringify(obj); } catch { return null; }
  };

  const safeParse = (text) => {
    try { return JSON.parse(text); } catch { return null; }
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const hasLocalStorage = () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const k = `${STORAGE_PREFIX}__probe__`;
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  };

  const storageGet = (key) => {
    if (!hasLocalStorage()) return null;
    return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  };

  const storageSet = (key, value) => {
    if (!hasLocalStorage()) return false;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
      return true;
    } catch {
      return false;
    }
  };

  const storageRemove = (key) => {
    if (!hasLocalStorage()) return false;
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return true;
    } catch {
      return false;
    }
  };

  class OnlineStandardizer {
    constructor(dim) {
      this.dim = dim;
      this.n = 0;
      this.mean = new Array(dim).fill(0);
      this.m2 = new Array(dim).fill(0);
    }

    update(x) {
      this.n += 1;
      for (let i = 0; i < this.dim; i += 1) {
        const xi = x[i];
        const delta = xi - this.mean[i];
        this.mean[i] += delta / this.n;
        const delta2 = xi - this.mean[i];
        this.m2[i] += delta * delta2;
      }
    }

    std(i) {
      if (this.n < 2) return 1;
      const varI = this.m2[i] / (this.n - 1);
      const s = Math.sqrt(Math.max(0, varI));
      return s > 1e-9 ? s : 1;
    }

    transform(x) {
      const z = new Array(this.dim);
      for (let i = 0; i < this.dim; i += 1) {
        z[i] = (x[i] - this.mean[i]) / this.std(i);
      }
      return z;
    }

    toJSON() {
      return {
        dim: this.dim,
        n: this.n,
        mean: this.mean,
        m2: this.m2,
      };
    }

    static fromJSON(obj) {
      if (!obj || !Number.isFinite(obj.dim)) return null;
      const inst = new OnlineStandardizer(obj.dim);
      inst.n = Number.isFinite(obj.n) ? obj.n : 0;
      inst.mean = Array.isArray(obj.mean) ? obj.mean.slice(0, obj.dim) : inst.mean;
      inst.m2 = Array.isArray(obj.m2) ? obj.m2.slice(0, obj.dim) : inst.m2;
      return inst;
    }
  }

  class SGDRegressor {
    constructor(dim, opts) {
      const options = opts || {};
      this.dim = dim;
      this.lr = Number.isFinite(options.learningRate) ? options.learningRate : 0.05;
      this.l2 = Number.isFinite(options.l2) ? options.l2 : 0.001;
      this.w = new Array(dim).fill(0);
      this.b = 0;
      this.nUpdates = 0;
    }

    predict(x) {
      let s = this.b;
      for (let i = 0; i < this.dim; i += 1) s += this.w[i] * x[i];
      return s;
    }

    fitOne(x, y) {
      const yHat = this.predict(x);
      const err = yHat - y;

      for (let i = 0; i < this.dim; i += 1) {
        const grad = err * x[i] + this.l2 * this.w[i];
        this.w[i] -= this.lr * grad;
      }
      this.b -= this.lr * err;
      this.nUpdates += 1;

      return { yHat, err };
    }

    toJSON() {
      return {
        dim: this.dim,
        lr: this.lr,
        l2: this.l2,
        w: this.w,
        b: this.b,
        nUpdates: this.nUpdates,
      };
    }

    static fromJSON(obj) {
      if (!obj || !Number.isFinite(obj.dim)) return null;
      const inst = new SGDRegressor(obj.dim, { learningRate: obj.lr, l2: obj.l2 });
      inst.w = Array.isArray(obj.w) ? obj.w.slice(0, obj.dim) : inst.w;
      inst.b = Number.isFinite(obj.b) ? obj.b : 0;
      inst.nUpdates = Number.isFinite(obj.nUpdates) ? obj.nUpdates : 0;
      return inst;
    }
  }

  class OnlineRegModel {
    constructor(key, dim, opts) {
      this.key = key;
      this.dim = dim;
      this.scaler = new OnlineStandardizer(dim);
      this.regressor = new SGDRegressor(dim, opts);
    }

    nSeen() {
      return this.scaler.n;
    }

    predict(x) {
      const z = this.scaler.transform(x);
      return this.regressor.predict(z);
    }

    partialFit(x, y) {
      this.scaler.update(x);
      const z = this.scaler.transform(x);
      return this.regressor.fitOne(z, y);
    }

    save() {
      const payload = safeStringify({
        kind: 'online_regressor',
        version: VERSION,
        key: this.key,
        dim: this.dim,
        scaler: this.scaler.toJSON(),
        regressor: this.regressor.toJSON(),
        savedAt: new Date().toISOString(),
      });
      if (!payload) return false;
      return storageSet(this.key, payload);
    }

    static load(key) {
      const raw = storageGet(key);
      if (!raw) return null;
      const obj = safeParse(raw);
      if (!obj || obj.kind !== 'online_regressor' || obj.version !== VERSION) return null;
      if (!Number.isFinite(obj.dim)) return null;

      const inst = new OnlineRegModel(key, obj.dim, obj.regressor || {});
      const scaler = OnlineStandardizer.fromJSON(obj.scaler);
      const reg = SGDRegressor.fromJSON(obj.regressor);
      if (scaler) inst.scaler = scaler;
      if (reg) inst.regressor = reg;
      return inst;
    }
  }

  const regCache = {};

  function getOrCreateRegressorModel(key, dim, opts) {
    const k = String(key || '').trim();
    if (!k) return null;
    if (regCache[k]) return regCache[k];

    const loaded = OnlineRegModel.load(k);
    if (loaded && loaded.dim === dim) {
      regCache[k] = loaded;
      return loaded;
    }

    const created = new OnlineRegModel(k, dim, opts);
    regCache[k] = created;
    created.save();
    return created;
  }

  function resetModel(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    delete regCache[k];
    return storageRemove(k);
  }

  return {
    VERSION,
    getOrCreateRegressorModel,
    resetModel,
  };
}));
