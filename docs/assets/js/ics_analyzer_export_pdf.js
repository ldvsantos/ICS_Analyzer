/* ICS Analyzer - exportação de PDF */

function exportarPDF() {
  try {
    if (!window.ultimaDados) {
      mostrarMensagem('Erro: Execute o cálculo primeiro', 'error');
      return;
    }

    // --- Validação básica ---
    const numEl = document.getElementById('numLeituras');
    if (numEl) {
      const numAtual = parseInt(numEl.value, 10);
      if (Number.isFinite(numAtual) && window.ultimaDados.numLeituras && numAtual !== window.ultimaDados.numLeituras) {
        mostrarMensagem('Atenção: o número de leituras foi alterado após o cálculo. Recalcule antes de exportar.', 'error');
        return;
      }
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      mostrarMensagem('Erro: biblioteca de PDF não carregou (jsPDF). Verifique sua conexão com a internet ou tente abrir o sistema no navegador (não no preview do VS Code).', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    // Orientação Paisagem ('l') pode ser melhor para esse layout "ficha", mas o user pediu A4.
    // O layout da imagem parece Retrato ('p').
    const doc = new jsPDF('p', 'mm', 'a4');

    // Dados capturados
    const d = {
      ...window.ultimaDados,
      projeto: document.getElementById('projeto')?.value ?? window.ultimaDados.projeto,
      local: document.getElementById('local')?.value ?? window.ultimaDados.local,
      data: document.getElementById('data')?.value ?? window.ultimaDados.data,
      hora: document.getElementById('hora')?.value ?? window.ultimaDados.hora,
      operador: document.getElementById('operador')?.value ?? window.ultimaDados.operador,
      area: document.getElementById('area')?.value ?? window.ultimaDados.area, // Unidade Amostral
      textura: document.getElementById('textura')?.value ?? window.ultimaDados.textura,
      declividade: document.getElementById('declividade')?.value ?? window.ultimaDados.declividade,
      latitude: parseNumberPtBr(document.getElementById('latitude')?.value) ?? window.ultimaDados.latitude,
      longitude: parseNumberPtBr(document.getElementById('longitude')?.value) ?? window.ultimaDados.longitude,
      climaInicio: document.getElementById('climaInicio')?.value ?? window.ultimaDados.climaInicio,
      climaFim: document.getElementById('climaFim')?.value ?? window.ultimaDados.climaFim,
      // Clima
      luz: document.getElementById('luz')?.value ?? window.ultimaDados.luz,
      sombra: document.getElementById('sombra')?.value ?? window.ultimaDados.sombra,
      vento: document.getElementById('vento')?.value ?? window.ultimaDados.vento,
      chuva: document.getElementById('chuva')?.value ?? window.ultimaDados.chuva,
      notas: document.getElementById('notas')?.value ?? window.ultimaDados.notas,
    };

    // --- Função Auxiliar: Texto Vertical ---
    function verticalText(text, x, y, align = 'center') {
      doc.saveGraphicsState();
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.setFont(undefined, 'bold');
      // rotaciona 90 graus anti-horario
      doc.text(text, x, y, { angle: 90, align: align });
      doc.restoreGraphicsState();
    }

    // --- Função Auxiliar: Bloco Key-Value ---
    function drawField(label, value, x, y, w, h) {
      // Label em negrito
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text(label + ':', x + 2, y + 4.5);

      // Calcula largura do label para posicionar o valor
      const labelW = doc.getTextWidth(label + ':');

      const valueX = x + 2 + labelW + 2;
      const valueMaxW = Math.max(10, (x + w) - 2 - valueX);

      doc.setFont(undefined, 'normal');
      const rawValue = String(value || '-');

      // Para textos longos (ex.: Obs/Clima), tenta quebrar em múltiplas linhas dentro do box.
      // Fallback seguro: corta com reticências se ainda não couber.
      const wrap = label === 'Obs/Clima';
      if (wrap && typeof doc.splitTextToSize === 'function') {
        const valueFontSize = 7;
        doc.setFontSize(valueFontSize);

        const lineHeight = 3.0; // mm (aprox. mais justo para evitar overflow)
        const maxLines = Math.max(1, Math.floor((h - 2) / lineHeight));
        let lines = doc.splitTextToSize(rawValue, valueMaxW);

        if (Array.isArray(lines) && lines.length > maxLines) {
          lines = lines.slice(0, maxLines);
          const last = String(lines[lines.length - 1] ?? '');
          // tenta adicionar reticências no final
          const ellipsis = '…';
          let trimmed = last;
          while (trimmed.length > 0 && doc.getTextWidth(trimmed + ellipsis) > valueMaxW) {
            trimmed = trimmed.slice(0, -1);
          }
          lines[lines.length - 1] = trimmed.length > 0 ? (trimmed + ellipsis) : ellipsis;
        }

        const startY = y + 4.2; // baseline da 1ª linha
        lines.forEach((ln, idx) => {
          const yy = startY + idx * lineHeight;
          if (yy <= y + h - 1) doc.text(String(ln), valueX, yy);
        });
      } else {
        doc.setFontSize(9);
        // Se exceder a largura, aplica corte com reticências
        const ellipsis = '…';
        let txt = rawValue;
        while (txt.length > 0 && doc.getTextWidth(txt) > valueMaxW) {
          txt = txt.slice(0, -1);
        }
        while (txt.length > 0 && doc.getTextWidth(txt + ellipsis) > valueMaxW) {
          txt = txt.slice(0, -1);
        }
        const out = (doc.getTextWidth(rawValue) <= valueMaxW) ? rawValue : ((txt.length > 0 ? txt : '') + ellipsis);
        doc.text(out, valueX, y + 4.5);
      }

      // Borda inferior (linha)
      doc.setDrawColor(150);
      doc.setLineWidth(0.1);
      doc.line(x, y + h, x + w, y + h);

      // Borda direita vertical (opcional, para grade)
      // doc.line(x + w, y, x + w, y + h);
    }

    // Margens e Coordenadas
    const mLeft = 10;
    const mRight = 10;
    const pageW = 210;
    const contentW = pageW - mLeft - mRight; // 190
    let y = 10;

    const formatDatePtBr = (isoDate) => {
      if (!isoDate) return '-';
      const dt = new Date(String(isoDate));
      if (!Number.isFinite(dt.getTime())) return String(isoDate);
      return dt.toLocaleDateString('pt-BR');
    };

    const formatTimePtBr = (hhmm) => {
      if (!hhmm) return '-';
      const s = String(hhmm);
      // aceita HH:MM ou HH:MM:SS
      const m = s.match(/^\d{1,2}:\d{2}/);
      return m ? m[0] : s;
    };

    // ==========================================
    // 1. CABEÇALHO (Logo + Títulos)
    // ==========================================

    // Fundo do cabeçalho (faixa suave + linha de destaque)
    const headerH = 26;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.2);
    doc.rect(mLeft, y, contentW, headerH, 'FD');

    doc.setDrawColor(30, 58, 138); // blue-900-ish
    doc.setLineWidth(0.8);
    doc.line(mLeft, y + headerH, pageW - mRight, y + headerH);

    // Logo (à esquerda)
    const logoImg = document.getElementById('logo-for-pdf');
    let logoAdicionado = false;
    let logoWFinal = 0;

    if (logoImg) {
      try {
        if (logoImg.complete && logoImg.naturalHeight > 0) {
          const maxH = 16;
          const maxW = 26;
          const ratio = logoImg.naturalHeight / logoImg.naturalWidth;

          let logoW = maxW;
          let logoH = logoW * ratio;
          if (logoH > maxH) {
            logoH = maxH;
            logoW = logoH / ratio;
          }

          const logoX = mLeft + 4;
          const logoY = y + (headerH - logoH) / 2;
          doc.addImage(logoImg, 'PNG', logoX, logoY, logoW, logoH);
          logoAdicionado = true;
          logoWFinal = logoW;
        } else {
          console.warn('Logo existe mas não está carregado (complete=false).');
        }
      } catch (err) {
        console.warn('Não foi possível inserir a imagem do logo no PDF:', err);
      }
    }

    // Fallback: marca textual
    if (!logoAdicionado) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(14);
      doc.text('ICS Analyzer', mLeft + 4, y + 10);
      logoWFinal = 20;
    }

    // Título / subtítulo
    const titleX = mLeft + 4 + logoWFinal + 6;
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(13);
    doc.text('Relatório Técnico — Índice de Cobertura do Solo (ICS)', titleX, y + 11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(10);
    doc.text('Registro de campo, metadados, condições ambientais e estatísticas', titleX, y + 18);

    // Metadados à direita
    const rightX = pageW - mRight - 3;
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const linha1 = `Projeto: ${String(d.projeto || '-').slice(0, 60)}`;
    const linha2 = `Unidade: ${String(d.area || '-').slice(0, 40)}  •  Data/Hora: ${formatDatePtBr(d.data)} ${formatTimePtBr(d.hora)}`;
    doc.text(linha1, rightX, y + 9, { align: 'right' });
    doc.text(linha2, rightX, y + 16, { align: 'right' });

    y += headerH + 6;

    // Reset de estilos para não "vazar" a cor do cabeçalho para os boxes
    doc.setDrawColor(0);

    // ==========================================
    // 2. BOX "DADOS CADASTRAIS / PROJETO"
    // ==========================================
    // Altura total desse bloco
    const box1Height = 40;
    const yBox1 = y;

    // Borda externa geral
    doc.setLineWidth(0.3);
    doc.rect(mLeft, yBox1, contentW, box1Height);

    // -- Coluna Esquerda: Rótulo Vertical "DADOS DO PROJETO"
    const colVerW = 8;
    doc.rect(mLeft, yBox1, colVerW, box1Height); // Caixa do rótulo
    verticalText('DADOS DO PROJETO', mLeft + 5, yBox1 + box1Height / 2, 'center');

    // -- Coluna Meio: "Imagem representativa" (Placeholder)
    // Na imagem original é grande, vamos usar 50mm
    const colImgW = 50;
    const imgX = mLeft + colVerW;
    doc.setDrawColor(180);
    doc.rect(imgX, yBox1, colImgW, box1Height);

    // Lógica para inserir Croqui/Foto se existir
    if (window.imagemCroquiBase64) {
      try {
        const imgProps = doc.getImageProperties(window.imagemCroquiBase64);
        // Espaço disponível (com uma pequena margem de 1mm)
        const maxW = colImgW - 2;
        const maxH = box1Height - 2;

        let w = imgProps.width;
        let h = imgProps.height;
        const ratio = h / w;

        // Tentar ajustar primeiro pela largura
        let finalW = maxW;
        let finalH = finalW * ratio;

        // Se a altura estourar, ajustar pela altura
        if (finalH > maxH) {
          finalH = maxH;
          finalW = finalH / ratio;
        }

        // Centralizar a imagem no box
        const posX = imgX + (colImgW - finalW) / 2;
        const posY = yBox1 + (box1Height - finalH) / 2;

        doc.addImage(window.imagemCroquiBase64, 'JPEG', posX, posY, finalW, finalH);

      } catch(err){
        console.warn('Erro ao inserir croqui no box:', err);
        doc.setFontSize(8);
        doc.setTextColor(200, 0, 0);
        doc.text('Erro Img', imgX + colImgW/2, yBox1 + box1Height/2, { align: 'center' });
      }
    } else {
      // Texto placeholder se não houver imagem
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Local para Croqui/Foto', imgX + colImgW/2, yBox1 + box1Height/2, { align: 'center' });
    }

    doc.setTextColor(0);

    // -- Coluna Direita: Campos de Texto
    const fieldsX = imgX + colImgW;
    const fieldsW = contentW - colVerW - colImgW;
    const rowH = 7; // primeiras 4 linhas
    const rowHObs = box1Height - rowH * 4; // última linha (Obs/Clima) maior para caber quebra

    doc.setDrawColor(0); // Preto para linhas internas

    // Linhas do grid
    // Linha 1
    drawField('Projeto', d.projeto, fieldsX, yBox1, fieldsW, rowH);
    // Linha 2
    drawField('Local/Endereço', d.local, fieldsX, yBox1 + rowH, fieldsW, rowH);
    // Linha 3 (Dividida em 2: Data | Hora)
    const halfW = fieldsW / 2;
    drawField('Data', d.data, fieldsX, yBox1 + rowH * 2, halfW, rowH);
    drawField('Hora', d.hora, fieldsX + halfW, yBox1 + rowH * 2, halfW, rowH);
    // Linha 4 (Dividida: Operador | Área)
    drawField('Operador', d.operador, fieldsX, yBox1 + rowH * 3, halfW, rowH);
    drawField('Unid. Amostral', d.area, fieldsX + halfW, yBox1 + rowH * 3, halfW, rowH);
    // Linha 5 (Notas/Obs)
    drawField('Obs/Clima', `${d.textoClima || (d.luz + ' ' + d.notas).trim()}`, fieldsX, yBox1 + rowH * 4, fieldsW, rowHObs);

    y += box1Height + 5;

    // ==========================================
    // 3. BARRA "DADOS GERAIS" (Resultados Resumidos)
    // ==========================================
    // Título da Seção
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS GERAIS DA ANÁLISE', mLeft + contentW/2, y, { align: 'center' });
    // Linhas grossas estilo cabeçalho
    doc.setLineWidth(0.5);
    doc.line(mLeft, y + 1, pageW - mRight, y + 1);
    y += 2;

    // Tabela Dados Gerais (1 linha)
    // Colunas: N. Leituras | ICS Médio | Cobertura % | Desvio Padrão
    const rowGenH = 8;
    const colGenW = contentW / 4;

    // Fundo cinza nos labels? Vamos fazer estilo "Label: Valor" em caixa
    function fitTextToWidth(text, maxW, ellipsis = '…') {
      const raw = String(text ?? '');
      if (raw === '') return '';
      if (doc.getTextWidth(raw) <= maxW) return raw;

      let t = raw;
      while (t.length > 0 && doc.getTextWidth(t + ellipsis) > maxW) {
        t = t.slice(0, -1);
      }
      return t.length > 0 ? (t + ellipsis) : '';
    }

    function drawGenBox(label, value, idx, opts = {}) {
      const bx = mLeft + idx * colGenW;

      // Fundo cinza claro no label
      doc.setFillColor(230);
      doc.rect(bx, y, colGenW, rowGenH, 'F'); // Fundo total ou parcial?
      // Vamos fazer estilo imagem: Label esquerda cinza, Valor direita branco?
      // A imagem: "No. ambientes (label) | 7 (valor) | Area (label) | 208 (valor)"
      // Vamos replicar: Label (cinza) | Valor (branco)

      const labelRatio = typeof opts.labelRatio === 'number' ? opts.labelRatio : 0.6;
      const labelPartW = colGenW * labelRatio;
      const valPartW = colGenW - labelPartW;

      doc.setFillColor(220); // Cinza label
      doc.rect(bx, y, labelPartW, rowGenH, 'F');
      doc.rect(bx, y, colGenW, rowGenH); // Borda full

      doc.setFillColor(255); // Branco valor
      doc.rect(bx + labelPartW, y, valPartW, rowGenH, 'F');
      doc.rect(bx + labelPartW, y, valPartW, rowGenH); // Borda valor

      const labelFontSize = typeof opts.labelFontSize === 'number' ? opts.labelFontSize : 8;
      const valueFontSize = typeof opts.valueFontSize === 'number' ? opts.valueFontSize : 8;

      doc.setFontSize(labelFontSize);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0);
      const labelTxt = fitTextToWidth(label, labelPartW - 4);
      doc.text(labelTxt, bx + 2, y + 5);

      doc.setFontSize(valueFontSize);
      doc.setFont(undefined, 'normal');
      const valueTxt = fitTextToWidth(String(value), valPartW - 4);
      doc.text(valueTxt, bx + labelPartW + 2, y + 5);
    }

    // Presets de layout para caixas de dados gerais
    const genBoxOptsClassificacao = { labelRatio: 0.35, labelFontSize: 7, valueFontSize: 7 };
    const genBoxOptsMinMax = { labelRatio: 0.62, labelFontSize: 7, valueFontSize: 7 };
    const genBoxOptsAreas = { labelRatio: 0.72, labelFontSize: 7, valueFontSize: 7 };
    const genBoxOptsClimaLinha1 = { labelRatio: 0.68, labelFontSize: 6.5, valueFontSize: 7 };
    const genBoxOptsClimaLinha2 = { labelRatio: 0.7, labelFontSize: 7, valueFontSize: 7 };

    drawGenBox('No. Leituras', d.numLeituras, 0);
    drawGenBox('ICS Médio', d.media.toFixed(3), 1);
    drawGenBox('Cobertura (%)', d.percentual.toFixed(1), 2);
    drawGenBox('Desvio Padrão', d.desvio.toFixed(2), 3);

    y += rowGenH + 5;

    // Mesmos dados exibidos no site (Resultados)
    const cvTxt = (typeof d.cv === 'number') ? `${d.cv.toFixed(1)}%` : '-';
    const ampTxt = (typeof d.amplitude === 'number') ? d.amplitude.toFixed(3) : '-';
    const minTxt = (typeof d.minimo === 'number') ? d.minimo.toFixed(3) : '-';
    const maxTxt = (typeof d.maximo === 'number') ? d.maximo.toFixed(3) : '-';
    const classeTxt = (d.classe ?? '-') + (d.classeDesc ? ` - ${d.classeDesc}` : '');

    // Linha 2: CV, Classe, Amplitude, (Min..Max)
    drawGenBox('CV (%)', cvTxt, 0);
    drawGenBox('Classificação', classeTxt, 1, genBoxOptsClassificacao);
    drawGenBox('Amplitude', ampTxt, 2);
    drawGenBox('Min..Max', `${minTxt}..${maxTxt}`, 3, genBoxOptsMinMax);

    y += rowGenH + 5;

    // Linha extra (opcional): Áreas em m² quando houver calibração W/H
    if (typeof d.areaCampo === 'number') {
      const areaMediaTxt = typeof d.areaCobertaMedia === 'number' ? d.areaCobertaMedia.toFixed(2) : '-';
      const areaTotalTxt = typeof d.areaCobertaTotal === 'number' ? d.areaCobertaTotal.toFixed(2) : '-';
      const areaCampoTxt = d.areaCampo.toFixed(2);

      // Labels longos: usar fonte menor e dar mais largura para o label.
      drawGenBox('A campo (m²)', areaCampoTxt, 0, genBoxOptsAreas);
      drawGenBox('Área cob. média (m²)', areaMediaTxt, 1, genBoxOptsAreas);
      drawGenBox('Área cob. total (m²)', areaTotalTxt, 2, genBoxOptsAreas);
      drawGenBox('Dist. visada (m)', d.distVisada || '-', 3, genBoxOptsAreas);
      y += rowGenH + 5;
    }

    // Linha extra (opcional): Clima e risco potencial quando disponível
    {
      const riscoTxt = Number.isFinite(d.riscoErosaoScore)
        ? `${d.riscoErosaoScore} (${d.riscoErosaoClasse || ''})`
        : '-';
      const exposicaoTxt = Number.isFinite(d.exposicao) ? `${(d.exposicao * 100).toFixed(1)}%` : '-';
      const chuva7dTxt = Number.isFinite(d.climaChuva7dMm) ? d.climaChuva7dMm.toFixed(1) : '-';
      const chuva30dTxt = Number.isFinite(d.climaChuva30dMm) ? d.climaChuva30dMm.toFixed(1) : '-';

      const hasLinha1 = (riscoTxt !== '-') || (exposicaoTxt !== '-') || (chuva7dTxt !== '-') || (chuva30dTxt !== '-');
      if (hasLinha1) {
        drawGenBox('Risco erosão', riscoTxt, 0, genBoxOptsClimaLinha1);
        drawGenBox('Exposição', exposicaoTxt, 1, genBoxOptsClimaLinha1);
        drawGenBox('Chuva 7d (mm)', chuva7dTxt, 2, genBoxOptsClimaLinha1);
        drawGenBox('Chuva 30d (mm)', chuva30dTxt, 3, genBoxOptsClimaLinha1);
        y += rowGenH + 5;
      }

      const declivTxt = parseNumberPtBr(d.declividade);
      const declivOut = declivTxt === null ? '-' : declivTxt.toFixed(1);
      const texturaOut = (String(d.textura ?? '').trim() === '') ? '-' : String(d.textura).trim();
      const maxDiaTxt = Number.isFinite(d.climaChuvaMaxDiaMm) ? d.climaChuvaMaxDiaMm.toFixed(1) : '-';
      const tempTxt = Number.isFinite(d.climaTempMediaC) ? d.climaTempMediaC.toFixed(1) : '-';
      const hasLinha2 = (declivOut !== '-') || (texturaOut !== '-') || (maxDiaTxt !== '-') || (tempTxt !== '-');
      if (hasLinha2) {
        drawGenBox('Declividade (%)', declivOut, 0, genBoxOptsClimaLinha2);
        drawGenBox('Textura', texturaOut, 1, genBoxOptsClimaLinha2);
        drawGenBox('Máx dia (mm)', maxDiaTxt, 2, genBoxOptsClimaLinha2);
        drawGenBox('T média (°C)', tempTxt, 3, genBoxOptsClimaLinha2);
        y += rowGenH + 5;
      }
    }

    // ==========================================
    // 4. "DISTRIBUIÇÃO POR CLASSES" (Estilo tabela de sistemas)
    // ==========================================
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('DISTRIBUIÇÃO DE FREQUÊNCIA (CLASSES)', mLeft + contentW/2, y, { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(mLeft, y + 1, pageW - mRight, y + 1);
    y += 2;

    // Calcular contagens (mesmo critério usado no sistema)
    const labels = ['0.0', '0.2', '0.4', '0.6', '0.8', '1.0'];
    const counts = [0, 0, 0, 0, 0, 0];
    const total = d.numLeituras;

    (d.leituras || []).forEach((val) => {
      if (val < 0.1) counts[0]++;
      else if (val < 0.3) counts[1]++;
      else if (val < 0.5) counts[2]++;
      else if (val < 0.7) counts[3]++;
      else if (val < 0.9) counts[4]++;
      else counts[5]++;
    });

    // Tabela simples: Classe | N | Pct
    const freqTableW = 120;
    const freqTableX = (pageW - freqTableW) / 2;
    const freqRowH = 7;
    const colC = 30;
    const colN = 30;
    const colP = freqTableW - (colC + colN);

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setFillColor(220);
    doc.rect(freqTableX, y, freqTableW, freqRowH, 'F');
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(freqTableX, y, freqTableW, freqRowH);
    doc.text('Classe', freqTableX + 2, y + 5);
    doc.text('N', freqTableX + colC + 2, y + 5);
    doc.text('Pct', freqTableX + colC + colN + 2, y + 5);
    y += freqRowH;

    doc.setFont(undefined, 'normal');
    labels.forEach((lab, i) => {
      doc.rect(freqTableX, y, freqTableW, freqRowH);
      doc.line(freqTableX + colC, y, freqTableX + colC, y + freqRowH);
      doc.line(freqTableX + colC + colN, y, freqTableX + colC + colN, y + freqRowH);

      const pct = total > 0 ? ((counts[i] / total) * 100).toFixed(1) + '%' : '0.0%';
      doc.text(lab, freqTableX + 2, y + 5);
      doc.text(String(counts[i]), freqTableX + colC + 2, y + 5);
      doc.text(pct, freqTableX + colC + colN + 2, y + 5);
      y += freqRowH;
    });

    y += 8;

    // ==========================================
    // 5. GRÁFICO (Centralizado)
    // ==========================================
    // Título Gráfico
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('REPRESENTAÇÃO GRÁFICA', mLeft + contentW/2, y, { align: 'center' });
    doc.line(mLeft, y + 1, pageW - mRight, y + 1);
    y += 5;

    const chartInfo = {
      x: (pageW - 100) / 2, // Centraliza 100mm
      y: y,
      w: 100,
      h: 50
    };

    // Reutiliza função de desenho de barras (nativa PDF)
    // Precisamos adaptar a função `desenharBarrasFrequenciaICS` para não desenhar fundo/borda se não quisermos
    // Mas o style "clean" atual já é bom.

    // Tema para o gráfico ficar "limpo" no papel branco
    const chartTheme = {
      panelHex: '#FFFFFF',
      lineHex: '#1a5f7a',
      fillHex: '#b7e4c7'
    };

    // Adiciona moldura ao redor da área do gráfico para parecer o "box" da imagem
    doc.setLineWidth(0.1);
    doc.setDrawColor(200);
    doc.rect(mLeft, y - 2, contentW, chartInfo.h + 5); // Box largo pegando a pagina toda

    desenharAreaChartICS(doc, chartInfo.x, chartInfo.y, chartInfo.w, chartInfo.h, d.leituras, chartTheme);

    y += chartInfo.h + 10;

    // ==========================================
    // 6. (REMOVIDO) DETALHAMENTO TABULAR
    // ==========================================
    // O detalhamento linha-a-linha foi removido para manter o PDF mais enxuto.

    // ==========================================
    // TEXTO LATERAL DIREITO (Marca d'água vertical)
    // ==========================================
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.saveGraphicsState();

      // Rodapé Padrão
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${p} de ${pageCount} - Gerado em ${new Date().toLocaleDateString()}`, 105, 292, { align: 'center', angle: 0 });
      doc.restoreGraphicsState();
    }

    const sanitizeFileName = (name) => {
      const base = String(name || 'Relatorio_ICS.pdf');
      // Remove caracteres proibidos no Windows + normaliza espaços
      const cleaned = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      return cleaned || 'Relatorio_ICS.pdf';
    };

    const baixarPdfComFallback = (pdfDoc, fileName) => {
      try {
        pdfDoc.save(fileName);
        return true;
      } catch (err) {
        try {
          const blob = pdfDoc.output('blob');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          return true;
        } catch (err2) {
          console.error('Falha ao baixar PDF (save e fallback falharam):', err, err2);
          return false;
        }
      }
    };

    // Nome arquivo
    const nomeArquivo = sanitizeFileName(`Relatorio_ICS_${d.projeto || 'vazio'}.pdf`);
    const ok = baixarPdfComFallback(doc, nomeArquivo);
    if (ok) {
      mostrarMensagem(`✓ PDF exportado: ${nomeArquivo}`, 'success');
    } else {
      mostrarMensagem('Erro: não foi possível iniciar o download do PDF. Tente abrir em um navegador (Chrome/Edge) e permitir downloads.', 'error');
    }
  } catch (err) {
    console.error('Erro inesperado ao exportar PDF:', err);
    mostrarMensagem(`Erro ao exportar PDF: ${err?.message || err}`, 'error');
  }
}
