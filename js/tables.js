const Tables = {
    _instances: {},

    _destroy(id) {
        if (this._instances[id]) {
            this._instances[id].destroy();
            delete this._instances[id];
        }
    },

    skuTable(containerId, data) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: [
                { data: 'sku', title: 'SKU' },
                { data: 'name', title: 'Name', render: (d, t, r) => {
                    let badges = '';
                    if (r.is_new_sku) badges += newSkuBadge(true);
                    if (r.recently_purchased) badges += recentBadge(true);
                    return `<span class="sku-name">${d || ''}</span> ${badges}`;
                }},
                { data: 'assessment', title: 'Status', render: d => statusBadge(d) },
                { data: 'category', title: 'Category' },
                { data: 'supplier', title: 'Supplier' },
                { data: 'location', title: 'Location' },
                { data: 'stock_qty', title: 'Stock', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'sales_qty', title: 'Sales', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'purchase_qty', title: 'Purchases', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'stock_value', title: 'Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'days_of_stock', title: 'Days of Stock', render: d => d >= 9999 ? '∞' : formatNumber(d), className: 'dt-right' },
                { data: 'turnover_ratio', title: 'Turnover', render: d => d != null ? d.toFixed(2) : '0', className: 'dt-right' },
            ],
            order: [[2, 'asc']],
            pageLength: 25,
            dom: 'lBfrtip',
            buttons: ['copy', 'csv'],
            scrollX: true,
            language: { search: '', searchPlaceholder: 'Search in table...' },
            createdRow: (row, data) => {
                if (data.is_new_sku) row.classList.add('row-new-sku');
            }
        });
    },

    supplierTable(containerId, data, onDrilldown) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: [
                { data: 'supplier', title: 'Supplier', render: (d) =>
                    `<a href="#" class="drilldown-link" data-supplier="${d}">${d}</a>`
                },
                { data: 'total_skus', title: 'SKUs', className: 'dt-right' },
                { data: 'healthy_pct', title: 'Healthy %', render: d => formatPct(d), className: 'dt-right' },
                { data: 'at_risk_count', title: 'At Risk', className: 'dt-right' },
                { data: 'dead_stock_value', title: 'Dead Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'stock_value', title: 'Total Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'avg_turnover', title: 'Avg Turnover', className: 'dt-right' },
                { data: 'health_score', title: 'Health Score', render: (d) => {
                    const color = d >= 60 ? '#22C55E' : d >= 40 ? '#EAB308' : '#DC2626';
                    return `<span style="color:${color};font-weight:700">${d}</span>`;
                }, className: 'dt-right' },
            ],
            order: [[7, 'desc']],
            pageLength: 25,
            dom: 'lfrtip',
            scrollX: true,
        });

        $(table).on('click', '.drilldown-link', function(e) {
            e.preventDefault();
            if (onDrilldown) onDrilldown($(this).data('supplier'));
        });
    },

    categoryTable(containerId, data, onDrilldown) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: [
                { data: 'category', title: 'Category', render: (d) =>
                    `<a href="#" class="drilldown-link" data-category="${d}">${d}</a>`
                },
                { data: 'total_skus', title: 'SKUs', className: 'dt-right' },
                { data: 'healthy_pct', title: 'Healthy %', render: d => formatPct(d), className: 'dt-right' },
                { data: 'at_risk_count', title: 'At Risk', className: 'dt-right' },
                { data: 'dead_stock_value', title: 'Dead Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'stock_value', title: 'Total Stock Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'avg_turnover', title: 'Avg Turnover', className: 'dt-right' },
            ],
            order: [[2, 'desc']],
            pageLength: 25,
            dom: 'lfrtip',
            scrollX: true,
        });

        $(table).on('click', '.drilldown-link', function(e) {
            e.preventDefault();
            if (onDrilldown) onDrilldown($(this).data('category'));
        });
    },

    poTable(containerId, data) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: [
                { data: 'po_number', title: 'PO #' },
                { data: 'sku', title: 'SKU' },
                { data: 'product_name', title: 'Product' },
                { data: 'recommendation', title: 'Decision', render: d => poBadge(d) },
                { data: 'reason', title: 'Reason', render: d => `<span class="po-reason">${d}</span>` },
                { data: 'po_qty', title: 'PO Qty', render: d => `<strong>${formatNumber(d)}</strong>`, className: 'dt-right' },
                { data: 'suggested_qty', title: 'Suggested Qty', render: d => d > 0 ? formatNumber(d) : '-', className: 'dt-right' },
                { data: 'po_covers_days', title: 'PO Covers (Days)', render: d => d >= 9999 ? '∞' : formatNumber(d), className: 'dt-right' },
                { data: 'stock_qty', title: 'Stock On Hand', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'days_of_stock', title: 'Current Days of Stock', render: d => d >= 9999 ? '∞' : (d > 0 ? d.toFixed(0) : '0'), className: 'dt-right' },
                { data: 'avg_daily_sales', title: 'Avg Daily Sales', render: d => d > 0 ? d.toFixed(1) : '0', className: 'dt-right' },
                { data: 'sales_qty', title: 'Total Sales', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'assessment', title: 'Inventory Status', render: d => d ? statusBadge(d) : '<span style="color:#9CA3AF">New SKU</span>' },
                { data: 'po_state', title: 'PO Status', render: d => {
                    const s = (d || '').toLowerCase();
                    const colors = { pending: '#F59E0B', received: '#22C55E', cancelled: '#DC2626' };
                    const color = colors[s] || '#9CA3AF';
                    return `<span style="color:${color};font-weight:600;text-transform:capitalize">${d || ''}</span>`;
                }},
                { data: 'po_supplier', title: 'PO Supplier' },
                { data: 'store', title: 'Store' },
                { data: 'unit_cost', title: 'Unit Cost', render: d => d > 0 ? formatCurrency(d) : '-', className: 'dt-right' },
            ],
            order: [[2, 'asc']],
            pageLength: 50,
            dom: 'lBfrtip',
            buttons: ['copy', 'csv'],
            scrollX: true,
            language: { search: '', searchPlaceholder: 'Search PO lines...' },
            createdRow: (row, data) => {
                if (data.recommendation === 'REJECTED') row.style.background = 'rgba(220,38,38,0.07)';
                else if (data.recommendation === 'REVIEW') row.style.background = 'rgba(245,158,11,0.06)';
                else if (data.recommendation === 'APPROVED') row.style.background = 'rgba(34,197,94,0.05)';
            }
        });
    },

    orderingTable(containerId, data) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: [
                { data: 'sku', title: 'SKU' },
                { data: 'name', title: 'Name' },
                { data: 'location', title: 'Store' },
                { data: 'stock_qty', title: 'Current SOH', render: d => formatNumber(d), className: 'dt-right' },
                { data: 'avg_daily_sales', title: 'Avg Daily Sales', render: d => d > 0 ? d.toFixed(1) : '0', className: 'dt-right' },
                { data: 'days_of_stock', title: 'Days of Stock', render: d => d >= 9999 ? '∞' : (d > 0 ? d.toFixed(0) : '0'), className: 'dt-right' },
                { data: 'suggested_order_qty', title: 'Suggested Qty', render: d => `<strong>${formatNumber(d)}</strong>`, className: 'dt-right' },
                { data: 'order_value', title: 'Order Value', render: d => formatCurrency(d), className: 'dt-right' },
                { data: 'urgency', title: 'Urgency', render: d => urgencyBadge(d) },
                { data: 'supplier', title: 'Supplier' },
                { data: 'category', title: 'Category' },
                { data: 'assessment', title: 'Inventory Status', render: d => d ? statusBadge(d) : '' },
            ],
            order: [[8, 'asc']],
            pageLength: 50,
            dom: 'lBfrtip',
            buttons: ['copy', 'csv'],
            scrollX: true,
            language: { search: '', searchPlaceholder: 'Search orders...' },
            createdRow: (row, data) => {
                if (data.urgency === 'URGENT') row.style.background = 'rgba(220,38,38,0.07)';
                else if (data.urgency === 'SOON') row.style.background = 'rgba(245,158,11,0.06)';
            }
        });
    },

    simpleTable(containerId, data, columns) {
        this._destroy(containerId);
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const table = document.createElement('table');
        table.id = containerId + '-tbl';
        table.className = 'display compact stripe';
        table.style.width = '100%';
        el.appendChild(table);

        this._instances[containerId] = $(table).DataTable({
            data: data,
            columns: columns,
            pageLength: 25,
            dom: 'lfrtip',
            scrollX: true,
        });
    }
};
