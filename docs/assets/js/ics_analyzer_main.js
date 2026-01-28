/* ICS Analyzer - bootstrap de interface */

window.addEventListener('load', () => {
  // Exposição explícita para handlers inline e para depuração.
  window.calcular = calcular;
  window.safeCalcular = safeCalcular;

  const numLeiturasEl = document.getElementById('numLeituras');
  const btnCalcular = document.getElementById('btnCalcular');
  const btnExportar = document.getElementById('btnExportarPDF');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnBuscarClima = document.getElementById('btnBuscarClima');

  const campoModoEl = document.getElementById('campoModo');

  // Modais (ajuda + interpretação)
  const registerModal = ({ openBtnId, modalId, closeBtnId }) => {
    const openBtn = document.getElementById(openBtnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);

    if (!modal) return { isOpen: () => false, setOpen: () => {} };

    const setOpen = (open) => {
      modal.classList.toggle('open', open);
      modal.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) closeBtn?.focus?.();
      else openBtn?.focus?.();
    };

    if (openBtn) openBtn.addEventListener('click', () => setOpen(true));
    if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) setOpen(false);
    });

    return {
      isOpen: () => modal.classList.contains('open'),
      setOpen,
    };
  };

  const modalAjuda = registerModal({ openBtnId: 'btnAjudaLeituras', modalId: 'ajudaModal', closeBtnId: 'btnFecharAjuda' });
  const modalRisco = registerModal({ openBtnId: 'btnAjudaRisco', modalId: 'riscoModal', closeBtnId: 'btnFecharRisco' });
  const modalIMC = registerModal({ openBtnId: 'btnAjudaIMC', modalId: 'imcModal', closeBtnId: 'btnFecharIMC' });
  const modalCV = registerModal({ openBtnId: 'btnAjudaCV', modalId: 'cvModal', closeBtnId: 'btnFecharCV' });
  const modalRange = registerModal({ openBtnId: 'btnAjudaRange', modalId: 'rangeModal', closeBtnId: 'btnFecharRange' });
  const modalUSLE = registerModal({ openBtnId: 'btnAjudaUSLE', modalId: 'usleModal', closeBtnId: 'btnFecharUSLE' });

  if (numLeiturasEl) {
    numLeiturasEl.addEventListener('change', setupLeituras);
  }

  if (campoModoEl) {
    campoModoEl.addEventListener('change', setupCampoCalibracao);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalAjuda.isOpen()) modalAjuda.setOpen(false);
    if (modalRisco.isOpen()) modalRisco.setOpen(false);
    if (modalIMC.isOpen()) modalIMC.setOpen(false);
    if (modalCV.isOpen()) modalCV.setOpen(false);
    if (modalRange.isOpen()) modalRange.setOpen(false);
    if (modalUSLE.isOpen()) modalUSLE.setOpen(false);
  });

  if (btnCalcular) btnCalcular.addEventListener('click', safeCalcular);
  if (btnExportar) btnExportar.addEventListener('click', exportarPDF);
  if (btnLimpar) btnLimpar.addEventListener('click', limpar);
  if (btnBuscarClima) btnBuscarClima.addEventListener('click', buscarDadosClimaticos);

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

  const setDateInput = (el, dateObj) => {
    if (!el || !(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return;
    // Alguns navegadores não suportam valueAsDate; use fallback com YYYY-MM-DD.
    try {
      if ('valueAsDate' in el) {
        el.valueAsDate = dateObj;
        if (el.value) return;
      }
    } catch {
      // ignore
    }
    const yyyyMmDd = dateObj.toISOString().slice(0, 10);
    el.value = yyyyMmDd;
  };

  const dataEl = document.getElementById('data');
  setDateInput(dataEl, new Date());

  const climaFimEl = document.getElementById('climaFim');
  setDateInput(climaFimEl, new Date());
  const climaInicioEl = document.getElementById('climaInicio');
  if (climaInicioEl) {
    const d0 = new Date();
    d0.setDate(d0.getDate() - 30);
    setDateInput(climaInicioEl, d0);
  }
});
