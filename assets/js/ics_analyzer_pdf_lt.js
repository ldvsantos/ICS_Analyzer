// Módulo de geração de PDF para análises de longo prazo
export const generateLongTermPDF = (data) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Configurações do documento
  doc.setFontSize(16);
  doc.text('Relatório de Análise de Longo Prazo', 105, 15, null, null, 'center');
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(`Período analisado: ${data.startYear} - ${data.endYear}`, 105, 25, null, null, 'center');
  
  // Adicionar gráficos
  const chartCanvas = document.getElementById('sq-chart');
  const chartImg = chartCanvas.toDataURL('image/png');
  doc.addImage(chartImg, 'PNG', 15, 40, 180, 80);
  
  // Tabela de resultados
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
  
  doc.autoTable({
    startY: 135,
    head: headers,
    body: rows,
    theme: 'grid',
    styles: { fontSize: 10 }
  });
  
  // Conclusões
  doc.setFontSize(14);
  doc.text('Conclusões e Recomendações', 15, doc.autoTable.previous.finalY + 15);
  doc.setFontSize(11);
  doc.setTextColor(40);
  const conclusions = data.conclusions.split('\n');
  conclusions.forEach((line, i) => {
    doc.text(line, 15, doc.autoTable.previous.finalY + 25 + (i * 7));
  });
  
  // Salvar PDF
  doc.save(`relatorio_longo_prazo_${data.startYear}-${data.endYear}.pdf`);
};
