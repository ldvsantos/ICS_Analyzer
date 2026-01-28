/* ICS Analyzer - utilitários de interface */

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

function safeCalcular() {
  try {
    // Garante que as leituras existam (caso algum listener de inicialização não tenha rodado)
    if (!document.getElementById('leitura1H') || !document.getElementById('leitura1V')) {
      setupLeituras();
    }
    calcular();
  } catch (err) {
    console.error('Erro no cálculo:', err);
    mostrarMensagem(`Erro interno ao calcular: ${err?.message || err}`, 'error');
  }
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
  const texturaEl = document.getElementById('textura');
  if (texturaEl) texturaEl.value = '';
  const declivEl = document.getElementById('declividade');
  if (declivEl) declivEl.value = '';
  const latEl = document.getElementById('latitude');
  if (latEl) latEl.value = '';
  const lonEl = document.getElementById('longitude');
  if (lonEl) lonEl.value = '';
  const climaIniEl = document.getElementById('climaInicio');
  if (climaIniEl) climaIniEl.value = '';
  const climaFimEl = document.getElementById('climaFim');
  if (climaFimEl) climaFimEl.value = '';
  const usleComprimentoEl = document.getElementById('usleComprimento');
  if (usleComprimentoEl) usleComprimentoEl.value = '';
  const uslePraticaEl = document.getElementById('uslePratica');
  if (uslePraticaEl) uslePraticaEl.value = '';
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
  clearClimaStatus();
  document.getElementById('area-results')?.classList?.add('hidden');
  document.getElementById('clima-results')?.classList?.add('hidden');
  document.getElementById('risco-results')?.classList?.add('hidden');
  document.getElementById('sust-results')?.classList?.add('hidden');
  window.ultimaClima = null;
  setupLeituras();
  setupCampoCalibracao();
}
