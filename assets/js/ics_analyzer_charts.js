// Módulo de visualização gráfica para análise histórica
export const renderHistoricalCharts = (data) => {
  // Configuração do gráfico de linha para evolução do SQ
  const sqChart = new Chart(document.getElementById('sq-chart'), {
    type: 'line',
    data: {
      labels: data.years,
      datasets: [{
        label: 'Qualidade do Solo (SQ)',
        data: data.sqValues,
        borderColor: '#2e7d32',
        backgroundColor: 'rgba(46, 125, 50, 0.1)',
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Evolução da Qualidade do Solo ao Longo dos Anos'
        }
      }
    }
  });

  // Configuração do gráfico de barras para comparação de sistemas de preparo
  const tillageChart = new Chart(document.getElementById('tillage-chart'), {
    type: 'bar',
    data: {
      labels: Object.keys(data.tillageSystems),
      datasets: [{
        label: 'Média SQ',
        data: Object.values(data.tillageSystems),
        backgroundColor: ['#1565c0', '#7b1fa2', '#c2185b']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Comparação de Sistemas de Preparo do Solo'
        }
      }
    }
  });

  return { sqChart, tillageChart };
};
