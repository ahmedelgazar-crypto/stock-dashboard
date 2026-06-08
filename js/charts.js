const Charts = {
    _instances: {},

    _destroy(id) {
        if (this._instances[id]) {
            this._instances[id].destroy();
            delete this._instances[id];
        }
    },

    statusDistribution(canvasId, distribution) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const labels = Object.keys(distribution);
        const values = Object.values(distribution);
        const colors = labels.map(l => getStatusColor(l));
        this._instances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(shortStatus),
                datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    supplierHealth(canvasId, suppliers) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const top = suppliers.slice(0, 15);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(s => s.supplier.length > 20 ? s.supplier.slice(0, 18) + '...' : s.supplier),
                datasets: [{
                    label: 'Health Score',
                    data: top.map(s => s.health_score),
                    backgroundColor: top.map(s => s.health_score >= 60 ? '#22C55E' : s.health_score >= 40 ? '#EAB308' : '#DC2626'),
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, max: 100, title: { display: true, text: 'Health Score' } } },
                plugins: { legend: { display: false } }
            }
        });
    },

    categoryStacked(canvasId, categories) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const statusKeys = new Set();
        categories.forEach(c => Object.keys(c.status_distribution || {}).forEach(k => statusKeys.add(k)));
        const statuses = [...statusKeys];
        const datasets = statuses.map(s => ({
            label: shortStatus(s),
            data: categories.map(c => (c.status_distribution || {})[s] || 0),
            backgroundColor: getStatusColor(s),
        }));
        this._instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories.map(c => c.category.length > 15 ? c.category.slice(0, 13) + '...' : c.category),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
            }
        });
    },

    poSummary(canvasId, summary) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const labels = ['Approved', 'To Review', 'Rejected'];
        const keys = ['APPROVED', 'REVIEW', 'REJECTED'];
        const colors = ['#22C55E', '#F59E0B', '#DC2626'];
        const values = keys.map(k => summary[k] || 0);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, padding: 12, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    orderingByStore(canvasId, storeSummary) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const top = storeSummary.slice(0, 15);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map(s => s.location),
                datasets: [{
                    label: 'Order Value',
                    data: top.map(s => s.total_order_value),
                    backgroundColor: '#FF5900',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } }
            }
        });
    },

    orderingUrgency(canvasId, urgencyCounts) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const labels = ['Urgent', 'Soon', 'Normal', 'Not Needed'];
        const keys = ['URGENT', 'SOON', 'NORMAL', 'NOT NEEDED'];
        const colors = ['#DC2626', '#F59E0B', '#3B82F6', '#9CA3AF'];
        const values = keys.map(k => urgencyCounts[k] || 0);
        this._instances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, padding: 12, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    locationBar(canvasId, locations) {
        this._destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this._instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: locations.map(l => l.location),
                datasets: [{
                    label: 'Stock Value',
                    data: locations.map(l => l.stock_value),
                    backgroundColor: '#FF5900',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } }
            }
        });
    }
};
