const _uploadCache = {};

const API = {
    async get(action, params = {}) {
        const period = parseInt(params.period) || CONFIG.DEFAULT_PERIOD;

        switch(action) {
            case 'overview': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                const overview = Engine.aggregateOverview(data);
                overview.top_worst = Engine.getTopWorstSkus(data, 10);
                overview.files = Engine.getFilesInfo();
                return overview;
            }
            case 'skus': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                // sort
                const sortBy = params.sort || 'severity';
                const order = params.order || 'desc';
                data.sort((a, b) => {
                    let va = a[sortBy], vb = b[sortBy];
                    if (va == null) va = order === 'asc' ? Infinity : -Infinity;
                    if (vb == null) vb = order === 'asc' ? Infinity : -Infinity;
                    if (typeof va === 'string') va = va.toLowerCase();
                    if (typeof vb === 'string') vb = vb.toLowerCase();
                    return order === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
                });
                return { data, total: data.length };
            }
            case 'suppliers': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                return Engine.aggregateBySupplier(data);
            }
            case 'categories': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                return Engine.aggregateByCategory(data);
            }
            case 'new-purchases': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                const newSkus = data.filter(r => r.is_new_sku);
                const recent = data.filter(r => r.recently_purchased);
                const cols = ['sku','name','category','supplier','location','assessment','stock_qty','sales_qty','purchase_qty','stock_value','days_since_last_purchase','is_new_sku','recently_purchased'];
                return {
                    new_skus: newSkus.map(r => pick(r, cols)),
                    recently_purchased: recent.map(r => pick(r, cols)),
                    new_count: newSkus.length,
                    recent_count: recent.length,
                };
            }
            case 'locations': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                return Engine.aggregateByLocation(data);
            }
            case 'po-assessment': {
                const invData = Engine.loadAndAssess(period);
                const poData = Engine.loadPOData();
                if (!poData || poData.length === 0) return { error: 'PO data not found', data: [], summary: {} };
                return Engine.assessPO(poData, invData);
            }
            case 'ordering': {
                let data = Engine.loadAndAssess(period);
                data = Engine.applyFilters(data, params);
                return Engine.getOrderRecommendations(data, parseInt(params.target_days || '30'));
            }
            case 'filters': {
                const data = Engine.loadAndAssess(period);
                if (!data || data.length === 0) return { statuses: [], suppliers: [], categories: [], locations: [], periods: CONFIG.PERIOD_OPTIONS };
                const statuses = new Set(), suppliers = new Set(), categories = new Set(), locations = new Set();
                data.forEach(r => { if(r.assessment) statuses.add(r.assessment); if(r.supplier) suppliers.add(r.supplier); if(r.category) categories.add(r.category); if(r.location) locations.add(r.location); });
                return { statuses: [...statuses].sort(), suppliers: [...suppliers].sort(), categories: [...categories].sort(), locations: [...locations].sort(), periods: CONFIG.PERIOD_OPTIONS };
            }
            case 'upload-status':
                return { authenticated: true, files: {} };
            default:
                return { error: 'Unknown action' };
        }
    },

    async post(action, body = {}) {
        // Handle uploads locally
        if (action === 'login') return { success: true, username: 'local' };
        if (action === 'logout') return { success: true };
        if (action === 'upload') {
            _uploadCache[body.type] = body.data;
            return { success: true, type: body.type, rows: body.data.length };
        }
        if (action === 'process') {
            const result = Engine.processUploadsFromMemory(_uploadCache);
            if (result.error) throw new Error(result.error);
            _uploadCache.soh = null;
            _uploadCache.sales = null;
            _uploadCache.po = null;
            return result;
        }
        return { error: 'Unknown action' };
    }
};

function pick(obj, keys) {
    const r = {};
    keys.forEach(k => { if (obj[k] !== undefined) r[k] = obj[k]; });
    return r;
}
