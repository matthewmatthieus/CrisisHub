(function () {
    const data = window.__ADMIN_DASHBOARD__;

    if (!data || typeof Chart === 'undefined') {
        return;
    }

    const baseColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    function getLabelsAndValues(source) {
        return {
            labels: source.map((item) => item.category || item.month),
            values: source.map((item) => Number(item.total || item.total_reports || item.resolution_rate || 0))
        };
    }

    const incidentCtx = document.getElementById('incidentCategoryChart');
    if (incidentCtx) {
        const { labels, values } = getLabelsAndValues(data.incidentCategories || []);
        new Chart(incidentCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Incidents',
                    data: values,
                    backgroundColor: baseColors[0],
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#cbd5e1', precision: 0 },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    }
                }
            }
        });
    }

    const resourceCtx = document.getElementById('resourceCategoryChart');
    if (resourceCtx) {
        const { labels, values } = getLabelsAndValues(data.resourceCategories || []);
        new Chart(resourceCtx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: baseColors,
                    borderColor: '#131b29',
                    borderWidth: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#cbd5e1' }
                    }
                }
            }
        });
    }

    const resolutionCtx = document.getElementById('resolutionRateChart');
    if (resolutionCtx) {
        const labels = (data.resolutionRate || []).map((item) => item.month);
        const values = (data.resolutionRate || []).map((item) => Number(item.resolution_rate || 0));
        new Chart(resolutionCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Resolution Rate %',
                    data: values,
                    borderColor: baseColors[1],
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    }
                }
            }
        });
    }

    const monthlyCtx = document.getElementById('monthlyReportsChart');
    if (monthlyCtx) {
        const labels = (data.monthlyReports || []).map((item) => item.month);
        const values = (data.monthlyReports || []).map((item) => Number(item.total || 0));
        new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Reports per Month',
                    data: values,
                    backgroundColor: baseColors[2],
                    borderRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#cbd5e1', precision: 0 },
                        grid: { color: 'rgba(148, 163, 184, 0.12)' }
                    }
                }
            }
        });
    }
})();