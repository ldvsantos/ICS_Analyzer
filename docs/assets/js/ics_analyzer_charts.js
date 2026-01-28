// Módulo de visualização gráfica para análise histórica
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.renderHistoricalCharts = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return function renderHistoricalCharts(data) {
    if (typeof Chart === 'undefined') {
      return null;
    }

    const chartStore = (typeof window !== 'undefined') ? (window.ICSCharts || (window.ICSCharts = {})) : {};

    if (chartStore.sqChart) {
      chartStore.sqChart.destroy();
    }
    if (chartStore.tillageChart) {
      chartStore.tillageChart.destroy();
    }

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

    chartStore.sqChart = sqChart;
    chartStore.tillageChart = tillageChart;

    return { sqChart, tillageChart };
  };
});
