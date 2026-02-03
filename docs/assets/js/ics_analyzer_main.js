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

  // Integração Desktop (Electron): projetos, recentes, atalhos e título nativo.
  const desktopApi = (typeof window !== 'undefined') ? window.icsDesktop : null;
  const isDesktop = !!(desktopApi && desktopApi.isDesktop);

  if (isDesktop) {
    let currentProjectPath = null;
    let dirty = false;

    const getFileName = (p) => {
      const s = String(p ?? '').trim();
      if (!s) return '';
      const parts = s.split(/[/\\]/g);
      return parts[parts.length - 1] || s;
    };

    const updateTitle = () => {
      const nomeProjeto = String(document.getElementById('projeto')?.value ?? '').trim();
      const base = nomeProjeto || (currentProjectPath ? getFileName(currentProjectPath) : 'Sem título');
      const suffix = dirty ? ' *' : '';
      const title = `ICS Analyzer — ${base}${suffix}`;
      document.title = title;
      desktopApi.setTitle?.(title);
    };

    const setDirty = (v) => {
      dirty = !!v;
      updateTitle();
    };

    const captureInputs = () => {
      const getVal = (id) => document.getElementById(id)?.value ?? '';
      const numLeituras = parseInt(getVal('numLeituras') || '16', 10);

      const leituras = [];
      for (let i = 1; i <= (Number.isFinite(numLeituras) ? numLeituras : 16); i++) {
        leituras.push({
          H: getVal(`leitura${i}H`),
          V: getVal(`leitura${i}V`),
        });
      }

      return {
        projeto: getVal('projeto'),
        local: getVal('local'),
        data: getVal('data'),
        hora: getVal('hora'),
        operador: getVal('operador'),
        area: getVal('area'),

        textura: getVal('textura'),
        declividade: getVal('declividade'),

        luz: getVal('luz'),
        sombra: getVal('sombra'),
        vento: getVal('vento'),
        precip: getVal('precip'),
        chuva: getVal('chuva'),
        umidade: getVal('umidade'),
        notas: getVal('notas'),

        latitude: getVal('latitude'),
        longitude: getVal('longitude'),
        climaInicio: getVal('climaInicio'),
        climaFim: getVal('climaFim'),

        usleComprimento: getVal('usleComprimento'),
        uslePratica: getVal('uslePratica'),

        distVisada: getVal('distVisada'),
        campoModo: getVal('campoModo'),
        campoLargura: getVal('campoLargura'),
        campoAltura: getVal('campoAltura'),

        numLeituras: String(numLeituras),
        leituras,
      };
    };

    const buildProjectFilePayload = () => {
      const inputs = captureInputs();
      const computed = (window.ultimaDados && typeof window.ultimaDados === 'object') ? window.ultimaDados : null;
      const payload = {
        schemaVersion: 1,
        app: 'ICS Analyzer',
        savedAt: new Date().toISOString(),
        inputs,
        computed,
        imagemCroquiBase64: window.imagemCroquiBase64 ?? null,
        ultimaClima: window.ultimaClima ?? null,
      };
      return payload;
    };

    const applyPayload = async (payload) => {
      if (!payload || typeof payload !== 'object') throw new Error('Arquivo inválido (sem payload).');

      const src = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = v ?? '';
      };

      setVal('projeto', src.projeto);
      setVal('local', src.local);
      setVal('data', src.data);
      setVal('hora', src.hora);
      setVal('operador', src.operador);
      setVal('area', src.area);
      setVal('textura', src.textura);
      setVal('declividade', src.declividade);
      setVal('luz', src.luz);
      setVal('sombra', src.sombra);
      setVal('vento', src.vento);
      setVal('precip', src.precip);
      setVal('chuva', src.chuva);
      setVal('umidade', src.umidade);
      setVal('notas', src.notas);
      setVal('latitude', src.latitude);
      setVal('longitude', src.longitude);
      setVal('climaInicio', src.climaInicio);
      setVal('climaFim', src.climaFim);
      setVal('usleComprimento', src.usleComprimento);
      setVal('uslePratica', src.uslePratica);
      setVal('distVisada', src.distVisada);
      setVal('campoModo', src.campoModo);
      setVal('campoLargura', src.campoLargura);
      setVal('campoAltura', src.campoAltura);

      const n = parseInt(String(src.numLeituras ?? ''), 10);
      if (Number.isFinite(n) && document.getElementById('numLeituras')) {
        setVal('numLeituras', String(n));
        setupLeituras();
      }

      const leituras = Array.isArray(src.leituras) ? src.leituras : [];
      for (let i = 0; i < leituras.length; i++) {
        const idx = i + 1;
        const item = leituras[i] || {};
        setVal(`leitura${idx}H`, item.H);
        setVal(`leitura${idx}V`, item.V);
      }

      // Restaura clima e croqui (se houver)
      window.ultimaClima = payload.ultimaClima ?? null;
      window.imagemCroquiBase64 = payload.imagemCroquiBase64 ?? null;
      const previewCroqui = document.getElementById('previewCroqui');
      if (previewCroqui && window.imagemCroquiBase64) {
        previewCroqui.src = window.imagemCroquiBase64;
        previewCroqui.style.display = 'block';
      } else if (previewCroqui) {
        previewCroqui.src = '';
        previewCroqui.style.display = 'none';
      }

      // Recalcula automaticamente (se as leituras estiverem preenchidas)
      try {
        const hasAll = (() => {
          const num = parseInt(document.getElementById('numLeituras')?.value ?? '0', 10);
          if (!Number.isFinite(num) || num <= 0) return false;
          for (let i = 1; i <= num; i++) {
            const h = document.getElementById(`leitura${i}H`)?.value ?? '';
            const v = document.getElementById(`leitura${i}V`)?.value ?? '';
            if (h === '' || v === '') return false;
          }
          return true;
        })();
        if (hasAll) safeCalcular();
      } catch {
        // ignore
      }
    };

    const ensureCanDiscard = () => {
      if (!dirty) return true;
      return confirm('Existem alterações não salvas. Deseja continuar e descartar alterações?');
    };

    const doSave = async () => {
      const data = buildProjectFilePayload();
      if (!currentProjectPath) return doSaveAs();
      const res = await desktopApi.saveProject({ filePath: currentProjectPath, data });
      if (!res?.canceled) {
        setDirty(false);
        if (res?.backupPath) {
          mostrarMensagem('✓ Projeto salvo. Backup/versionamento atualizado.', 'success');
        } else {
          mostrarMensagem('✓ Projeto salvo com sucesso.', 'success');
        }
      }
    };

    const doSaveAs = async () => {
      const chosen = await desktopApi.saveProjectAs({ data: null });
      if (chosen?.canceled || !chosen?.filePath) return;
      currentProjectPath = chosen.filePath;
      await doSave();
      updateTitle();
    };

    // Marca dirty ao editar qualquer campo
    const watchEls = document.querySelectorAll('input, select, textarea');
    watchEls.forEach((el) => {
      el.addEventListener('input', () => setDirty(true));
      el.addEventListener('change', () => setDirty(true));
    });

    // Protege contra fechar com alterações não salvas
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // Ações vindas do menu nativo
    desktopApi.onMenuAction(async (action, payload) => {
      try {
        if (action === 'project:new') {
          if (!ensureCanDiscard()) return;
          // Limpa sem confirmação duplicada
          limpar(true);
          currentProjectPath = null;
          setDirty(false);
          updateTitle();
          return;
        }

        if (action === 'project:open') {
          if (!ensureCanDiscard()) return;
          const res = await desktopApi.openProject();
          if (res?.canceled) return;
          currentProjectPath = res.filePath;
          await applyPayload(res.data);
          setDirty(false);
          mostrarMensagem('✓ Projeto carregado.', 'success');
          updateTitle();
          return;
        }

        if (action === 'project:openRecent') {
          if (!ensureCanDiscard()) return;
          const filePath = payload?.filePath;
          const res = await desktopApi.openProjectPath(filePath);
          if (res?.canceled) return;
          currentProjectPath = res.filePath;
          await applyPayload(res.data);
          setDirty(false);
          mostrarMensagem('✓ Projeto carregado.', 'success');
          updateTitle();
          return;
        }

        if (action === 'project:save') {
          await doSave();
          return;
        }

        if (action === 'project:saveAs') {
          await doSaveAs();
          return;
        }

        if (action === 'project:exportPdf') {
          document.getElementById('btnExportarPDF')?.click?.();
          return;
        }

        if (action === 'app:checkUpdates') {
          await desktopApi.checkForUpdates();
          return;
        }

        if (action === 'app:openBackupsFolder') {
          await desktopApi.openBackupsFolder();
          return;
        }
      } catch (err) {
        console.error('Ação desktop falhou:', action, err);
        mostrarMensagem(`Erro: ${err?.message || err}`, 'error');
      }
    });

    updateTitle();
  }
});
