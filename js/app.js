const App = {
    currentPage: 'overview',

    async init() {
        await FilterState.init();
        ExportManager.init();
        FilterState.onChange(() => this.loadCurrentPage());

        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(link.dataset.page);
            });
        });

        document.getElementById('btn-reset-filters').addEventListener('click', () => FilterState.reset());

        this.switchPage('overview');
    },

    switchPage(page) {
        this.currentPage = page;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('[data-page]').forEach(l => l.classList.remove('active'));
        const pageEl = document.getElementById('page-' + page);
        if (pageEl) pageEl.classList.add('active');
        const linkEl = document.querySelector(`[data-page="${page}"]`);
        if (linkEl) linkEl.classList.add('active');
        this.loadCurrentPage();
    },

    async loadCurrentPage() {
        const loaders = {
            'overview': () => this.loadOverview(),
            'sku-detail': () => this.loadSkuDetail(),
            'suppliers': () => this.loadSuppliers(),
            'categories': () => this.loadCategories(),
            'new-purchases': () => this.loadNewPurchases(),
            'locations': () => this.loadLocations(),
            'po-assessment': () => this.loadPoAssessment(),
            'ordering': () => this.loadOrdering(),
            'data-upload': () => this.loadUpload(),
        };
        const loader = loaders[this.currentPage];
        if (loader) {
            this._showLoading();
            try { await loader(); }
            catch (e) { console.error('Load error:', e); this._showError(e.message); }
            finally { this._hideLoading(); }
        }
    },

    async loadOverview() {
        const data = await API.get('overview', FilterState.getParams());

        document.getElementById('kpi-total-skus').textContent = formatNumber(data.total_skus);
        document.getElementById('kpi-total-inventory').textContent = formatCurrency(data.total_stock_value);
        document.getElementById('kpi-dead-stock').textContent = formatCurrency(data.dead_stock_value);
        document.getElementById('kpi-healthy-pct').textContent = formatPct(data.healthy_pct);
        document.getElementById('kpi-at-risk').textContent = formatNumber(data.at_risk_count);
        document.getElementById('kpi-stockout').textContent = formatNumber(data.stockout_count);
        document.getElementById('kpi-low-stock').textContent = formatNumber(data.low_stock_count);

        Charts.statusDistribution('chart-status-dist', data.status_distribution || {});

        if (data.top_worst && data.top_worst.length > 0) {
            Tables.simpleTable('tbl-top-worst', data.top_worst, [
                { data: 'sku', title: 'SKU' },
                { data: 'name', title: 'Name' },
                { data: 'assessment', title: 'Status', render: d => statusBadge(d) },
                { data: 'stock_value', title: 'Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'supplier', title: 'Supplier' },
            ]);
        }

        Tables.simpleTable('tbl-status-summary', data.status_summary || [], [
            { data: 'status', title: 'Status', render: d => statusBadge(d) },
            { data: 'sku_count', title: 'SKU Count', render: d => formatNumber(d), className: 'dt-right' },
            { data: 'stock_qty', title: 'Stock Qty', render: d => formatNumber(d), className: 'dt-right' },
            { data: 'stock_value', title: 'Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
            { data: 'pct_of_total', title: '% of Total', render: d => d + '%', className: 'dt-right' },
        ]);

        if (data.files && data.files.length > 0) {
            const f = data.files[0];
            document.getElementById('file-info').textContent = `Data: ${f.name}`;
        }
    },

    async loadSkuDetail() {
        const data = await API.get('skus', FilterState.getParams());
        Tables.skuTable('tbl-sku-detail', data.data || []);
        document.getElementById('sku-count-info').textContent = `${formatNumber(data.total)} SKUs`;
    },

    async loadSuppliers() {
        const data = await API.get('suppliers', FilterState.getParams());
        Charts.supplierHealth('chart-supplier-health', data);
        Tables.supplierTable('tbl-suppliers', data, async (supplier) => {
            FilterState.supplier = supplier;
            document.getElementById('filter-supplier').value = supplier;
            this.switchPage('sku-detail');
        });
    },

    async loadCategories() {
        const data = await API.get('categories', FilterState.getParams());
        Charts.categoryStacked('chart-category-stacked', data);
        Tables.categoryTable('tbl-categories', data, async (category) => {
            FilterState.category = category;
            document.getElementById('filter-category').value = category;
            this.switchPage('sku-detail');
        });
    },

    async loadNewPurchases() {
        const data = await API.get('new-purchases', FilterState.getParams());

        document.getElementById('new-sku-count').textContent = data.new_count || 0;
        document.getElementById('recent-purchase-count').textContent = data.recent_count || 0;

        const baseCols = [
            { data: 'sku', title: 'SKU' },
            { data: 'name', title: 'Name' },
            { data: 'assessment', title: 'Status', render: d => statusBadge(d) },
            { data: 'category', title: 'Category' },
            { data: 'supplier', title: 'Supplier' },
            { data: 'location', title: 'Location' },
            { data: 'stock_qty', title: 'Stock', render: d => formatNumber(d), className: 'dt-right' },
            { data: 'purchase_qty', title: 'Purchases', render: d => formatNumber(d), className: 'dt-right' },
            { data: 'stock_value', title: 'Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
        ];

        Tables.simpleTable('tbl-new-skus', data.new_skus || [], baseCols);
        Tables.simpleTable('tbl-recent-purchases', data.recently_purchased || [], baseCols);
    },

    async loadLocations() {
        const data = await API.get('locations', FilterState.getParams());
        Charts.locationBar('chart-location-bar', data);
        Tables.simpleTable('tbl-locations', data, [
            { data: 'location', title: 'Location' },
            { data: 'total_skus', title: 'SKUs', className: 'dt-right' },
            { data: 'stock_value', title: 'Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
        ]);
    },

    _poAllData: [],
    _poActiveStatus: null,

    async loadPoAssessment() {
        const data = await API.get('po-assessment', FilterState.getParams());

        if (data.error) {
            document.getElementById('tbl-po-assessment').innerHTML =
                '<div class="empty-state"><h3>PO File Not Found</h3><p>Place "POs under creation .xlsx" in the tmart_data folder.</p></div>';
            return;
        }

        this._poAllData = data.data || [];
        this._poActiveStatus = null;

        const s = data.summary || {};
        document.getElementById('po-approved-count').textContent = s.APPROVED || 0;
        document.getElementById('po-review-count').textContent = s.REVIEW || 0;
        document.getElementById('po-rejected-count').textContent = s.REJECTED || 0;
        document.getElementById('po-file-date').textContent = data.file_date ? `PO File updated: ${data.file_date}` : '';
        document.getElementById('po-total-badge').textContent = `${data.total || 0} SKUs`;

        Charts.poSummary('chart-po-summary', s);

        this._buildPoStatusSlicer();
        Tables.poTable('tbl-po-assessment', this._poAllData);
    },

    _buildPoStatusSlicer() {
        const container = document.getElementById('po-status-chips');
        if (!container) return;
        container.innerHTML = '';

        const counts = {};
        this._poAllData.forEach(r => {
            const st = (r.po_state || '').toLowerCase() || 'unknown';
            counts[st] = (counts[st] || 0) + 1;
        });

        const allChip = document.createElement('span');
        allChip.className = 'po-slicer-chip active';
        allChip.dataset.status = '';
        allChip.innerHTML = `All<span class="chip-count">(${this._poAllData.length})</span>`;
        container.appendChild(allChip);

        Object.keys(counts).sort().forEach(st => {
            const chip = document.createElement('span');
            chip.className = 'po-slicer-chip';
            chip.dataset.status = st;
            chip.innerHTML = `${st.charAt(0).toUpperCase() + st.slice(1)}<span class="chip-count">(${counts[st]})</span>`;
            container.appendChild(chip);
        });

        container.addEventListener('click', e => {
            const chip = e.target.closest('.po-slicer-chip');
            if (!chip) return;
            container.querySelectorAll('.po-slicer-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            this._poActiveStatus = chip.dataset.status || null;
            this._applyPoStatusFilter();
        });
    },

    _applyPoStatusFilter() {
        let filtered = this._poAllData;
        if (this._poActiveStatus) {
            filtered = this._poAllData.filter(r =>
                (r.po_state || '').toLowerCase() === this._poActiveStatus
            );
        }
        document.getElementById('po-total-badge').textContent = `${filtered.length} SKUs`;
        Tables.poTable('tbl-po-assessment', filtered);
    },

    async loadOrdering() {
        const data = await API.get('ordering', FilterState.getParams());

        const s = data.summary || {};
        document.getElementById('ord-total-skus').textContent = formatNumber(s.total_skus_to_order || 0);
        document.getElementById('ord-total-value').textContent = formatCurrency(s.total_order_value || 0);
        document.getElementById('ord-urgent-count').textContent = formatNumber((s.urgency_counts || {}).URGENT || 0);
        document.getElementById('ord-stores-count').textContent = formatNumber(s.stores_needing_orders || 0);
        document.getElementById('ord-total-badge').textContent = `${data.total || 0} SKUs`;

        Charts.orderingByStore('chart-ordering-store', data.store_summary || []);
        Charts.orderingUrgency('chart-ordering-urgency', s.urgency_counts || {});
        Tables.orderingTable('tbl-ordering', data.data || []);
    },

    async loadUpload() {
        await UploadManager.init();
    },

    _showLoading() {
        const el = document.getElementById('loading-overlay');
        if (el) el.classList.add('active');
    },
    _hideLoading() {
        const el = document.getElementById('loading-overlay');
        if (el) el.classList.remove('active');
    },
    _showError(msg) {
        console.error('Dashboard error:', msg);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
