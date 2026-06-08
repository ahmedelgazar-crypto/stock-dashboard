const STATUS_COLORS = {
    'CRITICAL - Dead Stock': '#DC2626',
    'CRITICAL - No Sales, Still Purchasing': '#B91C1C',
    'HIGH RISK - Overstocked': '#F97316',
    'HIGH RISK - Overstocked & Over-Purchasing': '#EA580C',
    'WARNING - Over-Purchasing': '#EAB308',
    'STOCKOUT - Selling but No Stock': '#EF4444',
    'LOW STOCK - May Stockout Soon': '#F59E0B',
    'HEALTHY - Good Turnover': '#22C55E',
    'MEDIUM - Adequate Stock': '#3B82F6',
    'NEW/PIPELINE - Purchased, Awaiting Stock': '#8B5CF6',
    'INACTIVE': '#9CA3AF',
};

const STATUS_BG_COLORS = {
    'CRITICAL - Dead Stock': '#FEE2E2',
    'CRITICAL - No Sales, Still Purchasing': '#FEE2E2',
    'HIGH RISK - Overstocked': '#FFEDD5',
    'HIGH RISK - Overstocked & Over-Purchasing': '#FFEDD5',
    'WARNING - Over-Purchasing': '#FEF9C3',
    'STOCKOUT - Selling but No Stock': '#FEE2E2',
    'LOW STOCK - May Stockout Soon': '#FEF3C7',
    'HEALTHY - Good Turnover': '#DCFCE7',
    'MEDIUM - Adequate Stock': '#DBEAFE',
    'NEW/PIPELINE - Purchased, Awaiting Stock': '#F3E8FF',
    'INACTIVE': '#F3F4F6',
};

function getStatusColor(status) {
    return STATUS_COLORS[status] || '#6B7280';
}

function getStatusBg(status) {
    return STATUS_BG_COLORS[status] || '#F3F4F6';
}

function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function formatCurrency(n) {
    if (n == null || isNaN(n)) return '0.00';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatPct(n) {
    if (n == null || isNaN(n)) return '0%';
    return n.toFixed(1) + '%';
}

function statusBadge(status) {
    const color = getStatusColor(status);
    const bg = getStatusBg(status);
    return `<span class="status-badge" style="background:${bg};color:${color};border:1px solid ${color}">${status}</span>`;
}

function newSkuBadge(isNew) {
    if (!isNew) return '';
    return '<span class="badge-new">NEW</span>';
}

function recentBadge(isRecent) {
    if (!isRecent) return '';
    return '<span class="badge-recent">RECENT</span>';
}

function poBadge(recommendation) {
    const cls = (recommendation || '').toLowerCase();
    const labels = { 'approved': 'APPROVED', 'review': 'TO REVIEW', 'rejected': 'REJECTED' };
    return `<span class="po-badge ${cls}">${labels[cls] || recommendation}</span>`;
}

function urgencyBadge(urgency) {
    const cls = (urgency || '').toLowerCase().replace(' ', '-');
    return `<span class="urgency-badge ${cls}">${urgency}</span>`;
}

function shortStatus(status) {
    const map = {
        'CRITICAL - Dead Stock': 'Dead Stock',
        'CRITICAL - No Sales, Still Purchasing': 'No Sales + Buying',
        'HIGH RISK - Overstocked': 'Overstocked',
        'HIGH RISK - Overstocked & Over-Purchasing': 'Overstock+Buy',
        'WARNING - Over-Purchasing': 'Over-Purchasing',
        'STOCKOUT - Selling but No Stock': 'Stockout',
        'LOW STOCK - May Stockout Soon': 'Low Stock',
        'HEALTHY - Good Turnover': 'Healthy',
        'MEDIUM - Adequate Stock': 'Adequate',
        'NEW/PIPELINE - Purchased, Awaiting Stock': 'Pipeline',
        'INACTIVE': 'Inactive',
    };
    return map[status] || status;
}
