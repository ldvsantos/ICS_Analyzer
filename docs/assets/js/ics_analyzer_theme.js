/* ICS Analyzer - tema (light/dark) compartilhado */

(function () {
  const STORAGE_KEY = 'ics.theme';

  function getSystemPreference() {
    try {
      if (typeof window === 'undefined' || !window.matchMedia) return 'light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function getStoredTheme() {
    try {
      const v = String(window.localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
      if (v === 'dark' || v === 'light') return v;
      return null;
    } catch {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }

  function applyTheme(theme) {
    const t = (theme === 'dark' || theme === 'light') ? theme : 'light';
    const body = document.body;
    if (!body) return;
    body.classList.toggle('theme-dark', t === 'dark');
    body.classList.toggle('theme-light', t === 'light');
    body.dataset.theme = t;
  }

  function currentTheme() {
    const body = document.body;
    if (body && body.classList.contains('theme-dark')) return 'dark';
    return 'light';
  }

  function ensureToggleButton() {
    const header = document.querySelector('header');
    if (!header) return;

    // Evita duplicar em páginas que já tenham botão.
    if (document.getElementById('ics-theme-toggle')) return;

    const container = header.querySelector('.header-flex') || header.querySelector('.header-top') || header.querySelector('.container') || header;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ics-theme-toggle';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Alternar tema');

    const syncLabel = () => {
      const t = currentTheme();
      btn.textContent = t === 'dark' ? 'Tema: Escuro' : 'Tema: Claro';
      btn.dataset.theme = t;
    };

    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setStoredTheme(next);
      syncLabel();
    });

    // Posiciona no fim do header (ao lado do nav).
    container.appendChild(btn);
    syncLabel();
  }

  function initTheme() {
    const stored = getStoredTheme();
    const initial = stored || getSystemPreference();
    applyTheme(initial);

    // Se o usuário nunca escolheu e o SO mudar, respeita.
    if (!stored) {
      try {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', () => {
          const stillNone = !getStoredTheme();
          if (!stillNone) return;
          applyTheme(getSystemPreference());
        });
      } catch {
        // ignore
      }
    }

    ensureToggleButton();
  }

  // Expor para debug/uso futuro.
  window.ICSTheme = {
    applyTheme,
    getStoredTheme,
    setStoredTheme,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
})();
