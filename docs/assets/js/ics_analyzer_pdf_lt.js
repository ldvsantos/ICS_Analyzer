// Módulo de geração de PDF para análises de longo prazo
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.generateLongTermPDF = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return function generateLongTermPDF(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return false;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Relatório de Análise Conservacionista', 105, 15, null, null, 'center');
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Período analisado: ${data.startYear} - ${data.endYear}`, 105, 25, null, null, 'center');

    const chartCanvas = document.getElementById('sq-chart');
    if (chartCanvas) {
      const chartImg = chartCanvas.toDataURL('image/png');
      doc.addImage(chartImg, 'PNG', 15, 40, 180, 80);
    }

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Resumo Quantitativo', 15, 130);

    const headers = [['Ano', 'Sistema de Preparo', 'Cultura', 'SQ']];
    const rows = data.results.map(item => [
      item.year,
      item.tillageSystem,
      item.crop,
      item.sq.toFixed(2)
    ]);

    if (doc.autoTable) {
      doc.autoTable({
        startY: 135,
        head: headers,
        body: rows,
        theme: 'grid',
        styles: { fontSize: 10 }
      });
    }

    const finalY = doc.autoTable && doc.autoTable.previous ? doc.autoTable.previous.finalY : 135;
    doc.setFontSize(14);
    doc.text('Conclusões e Recomendações', 15, finalY + 15);
    doc.setFontSize(11);
    doc.setTextColor(40);
    const conclusions = data.conclusions.split('\n');
    conclusions.forEach((line, i) => {
      doc.text(line, 15, finalY + 25 + (i * 7));
    });

    const afterConclusionsY = finalY + 25 + (conclusions.length * 7) + 8;
    if (data.fuzzy && (Number.isFinite(data.fuzzy.priorityScore) || (data.fuzzy.recommendations && data.fuzzy.recommendations.length))) {
      let y = afterConclusionsY;
      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Diagnóstico operacional (fuzzy)', 15, y);
      y += 8;

      doc.setFontSize(11);
      doc.setTextColor(40);
      const scoreTxt = Number.isFinite(data.fuzzy.priorityScore) ? data.fuzzy.priorityScore.toFixed(2) : 'Indeterminado';
      const labelTxt = data.fuzzy.priorityLabel ? String(data.fuzzy.priorityLabel) : 'Indeterminado';
      doc.text(`Prioridade: ${labelTxt} (${scoreTxt}/100)`, 15, y);
      y += 7;

      if (data.fuzzy.drivers && data.fuzzy.drivers.length) {
        const driversTxt = data.fuzzy.drivers.map((d) => d.tag).join(' | ');
        const splitDrivers = doc.splitTextToSize(`Gatilhos dominantes: ${driversTxt}`, 180);
        doc.text(splitDrivers, 15, y);
        y += splitDrivers.length * 6;
      }

      if (data.fuzzy.inputsUsed) {
        const iu = data.fuzzy.inputsUsed;
        const parts = [];
        if (Number.isFinite(iu.coveragePct)) parts.push(`Cobertura: ${iu.coveragePct}%`);
        if (Number.isFinite(iu.slopePct)) parts.push(`Declividade: ${iu.slopePct}%`);
        if (Number.isFinite(iu.infiltrationMmH)) parts.push(`Infiltração: ${iu.infiltrationMmH} mm/h`);
        if (Number.isFinite(iu.organicMatterPct)) parts.push(`Matéria orgânica: ${iu.organicMatterPct}%`);
        if (Number.isFinite(iu.bulkDensity)) parts.push(`Densidade: ${iu.bulkDensity} g/cm³`);
        if (Number.isFinite(iu.aggregateStabilityPct)) parts.push(`Agregados: ${iu.aggregateStabilityPct}%`);
        if (parts.length) {
          const splitInputs = doc.splitTextToSize(`Entradas utilizadas: ${parts.join(' | ')}`, 180);
          doc.text(splitInputs, 15, y);
          y += splitInputs.length * 6;
        }
      }

      if (data.fuzzy.recommendations && data.fuzzy.recommendations.length) {
        const recTxt = data.fuzzy.recommendations.map((r) => `- ${r}`).join('\n');
        const splitRecs = doc.splitTextToSize(`Recomendações por gatilho\n${recTxt}`, 180);
        if (y + splitRecs.length * 6 > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(splitRecs, 15, y);
      }
    }

    if (data.fuzzyISPCReduced && (Number.isFinite(data.fuzzyISPCReduced.score) || (data.fuzzyISPCReduced.missingReducedInputs && data.fuzzyISPCReduced.missingReducedInputs.length))) {
      let y = afterConclusionsY;

      const hasOperational = Boolean(data.fuzzy && (Number.isFinite(data.fuzzy.priorityScore) || (data.fuzzy.recommendations && data.fuzzy.recommendations.length)));

      if (hasOperational) {
        y = 20;
        doc.addPage();
      } else if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('ISPC reduzido (fuzzy)', 15, y);
      y += 8;

      doc.setFontSize(11);
      doc.setTextColor(40);
      if (Number.isFinite(data.fuzzyISPCReduced.score)) {
        const label = data.fuzzyISPCReduced.classLabel ? String(data.fuzzyISPCReduced.classLabel) : 'Indeterminado';
        doc.text(`ISPC reduzido: ${label} (${data.fuzzyISPCReduced.score.toFixed(2)}/10)`, 15, y);
        y += 7;
      } else {
        doc.text('ISPC reduzido: Indeterminado', 15, y);
        y += 7;
      }

      if (data.fuzzyISPCReduced.missingReducedInputs && data.fuzzyISPCReduced.missingReducedInputs.length) {
        const splitMissing = doc.splitTextToSize(`Faltam entradas para calcular (modo reduzido): ${data.fuzzyISPCReduced.missingReducedInputs.join(', ')}`, 180);
        doc.text(splitMissing, 15, y);
        y += splitMissing.length * 6;
      }

      if (data.fuzzyISPCReduced.topRules && data.fuzzyISPCReduced.topRules.length) {
        const rulesTxt = data.fuzzyISPCReduced.topRules
          .map((r) => `R${r.idx} (força ${Number.isFinite(r.strength) ? r.strength.toFixed(2) : 'NA'})`)
          .join(' | ');
        const splitRules = doc.splitTextToSize(`Regras mais ativadas: ${rulesTxt}`, 180);
        doc.text(splitRules, 15, y);
        y += splitRules.length * 6;
      }

      if (data.fuzzyISPCReduced.reducedRawInputs) {
        const iu = data.fuzzyISPCReduced.reducedRawInputs;
        const parts = [];
        const add = (label, val) => {
          if (Number.isFinite(val)) parts.push(`${label}: ${val}`);
        };
        add('DMG', iu.dmg);
        add('Estoque de C', iu.estoque_c);
        add('Na', iu.na);
        add('ICV(%)', iu.icv);
        add('Altura', iu.altura);
        add('Diâmetro espiga', iu.diam_espiga);
        add('Comprimento espiga', iu.comp_espiga);
        add('N plantas/ha', iu.n_plantas);
        add('N espigas/ha', iu.n_espigas);
        add('Produtividade', iu.produtividade);

        if (parts.length) {
          const splitInputs = doc.splitTextToSize(`Entradas informadas (10): ${parts.join(' | ')}`, 180);
          if (y + splitInputs.length * 6 > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(splitInputs, 15, y);
          y += splitInputs.length * 6;
        }
      }

      if (data.fuzzyISPCReduced.estimatedValues) {
        const ev = data.fuzzyISPCReduced.estimatedValues;
        const parts = [];
        const add = (label, val) => {
          if (Number.isFinite(val)) parts.push(`${label}: ${val.toFixed(3)}`);
        };
        add('DMP (estim.)', ev.dmp);
        add('RMP (estim.)', ev.rmp);
        add('Densidade (estim.)', ev.densidade);
        add('N espigas comerciais/ha (estim.)', ev.n_espigas_com);
        add('Peso espigas comerciais/ha (estim.)', ev.peso_espigas);

        if (parts.length) {
          const splitEst = doc.splitTextToSize(`Entradas estimadas: ${parts.join(' | ')}`, 180);
          if (y + splitEst.length * 6 > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(splitEst, 15, y);
          y += splitEst.length * 6;
        }
      }

      if (data.fuzzyISPCReduced.estimatedModels) {
        const em = data.fuzzyISPCReduced.estimatedModels;
        const parts = [];
        for (const k of Object.keys(em)) {
          const m = em[k];
          const r2 = Number.isFinite(m && m.r2) ? m.r2.toFixed(2) : 'NA';
          const slope = Number.isFinite(m && m.slope) ? m.slope.toFixed(3) : 'NA';
          const intercept = Number.isFinite(m && m.intercept) ? m.intercept.toFixed(3) : 'NA';
          parts.push(`${k} <- ${intercept} + ${slope}*${m.x} (R²=${r2})`);
        }
        if (parts.length) {
          const splitModels = doc.splitTextToSize(`Modelos de estimativa (0–10 cm): ${parts.join(' | ')}`, 180);
          if (y + splitModels.length * 6 > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(splitModels, 15, y);
        }
      }
    }

    doc.save(`relatorio_longo_prazo_${data.startYear}-${data.endYear}.pdf`);
    return true;
  };
});
