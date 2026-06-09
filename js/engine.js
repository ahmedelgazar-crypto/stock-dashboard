/**
 * Engine.js — Client-side assessment and aggregation engine
 * Ported from Apps Script (.gs) files to run entirely in the browser.
 * All data persisted in localStorage.
 */

const Engine = (() => {

    // =========================================================================
    // From Loader.gs — Column mapping and normalization
    // =========================================================================

    const COLUMN_MAP = {
        sku: ['sku', 'item code', 'item_code', 'product code', 'product_code', 'barcode', 'article', 'sku_id'],
        name: ['name', 'item name', 'item_name', 'product name', 'product_name', 'description', 'item description', 'item name (english)'],
        category: ['category', 'product category', 'group', 'department', 'class', 'category name'],
        sub_category: ['sub_category', 'sub-category', 'sub-category name', 'subcategory'],
        supplier: ['supplier', 'vendor', 'supplier name', 'vendor name'],
        stock_qty: ['stock qty', 'stock_qty', 'on hand', 'on_hand', 'quantity on hand', 'qty on hand', 'soh', 'stock', 'stock closing quantity'],
        sales_qty: ['sales qty', 'sales_qty', 'sold qty', 'units sold', 'qty sold', 'sales', 'grand total', 'sales_total'],
        purchase_qty: ['purchase qty', 'purchase_qty', 'ordered qty', 'qty purchased', 'qty ordered', 'po qty', 'purchases'],
        location: ['location', 'warehouse', 'store', 'branch', 'site', 'warehouse name'],
        cost_price: ['cost price', 'cost_price', 'unit cost', 'buying price', 'cost', 'avg cost', 'stock closing wac (lc)'],
        selling_price: ['selling price', 'selling_price', 'retail price', 'unit price', 'price', 'srp', 'item price (avg.)'],
        stock_value: ['stock_value', 'stock value', 'stock closing value (lc)'],
        last_sale_date: ['last sale date', 'last_sale_date', 'last sold', 'last sale'],
        last_purchase_date: ['last purchase date', 'last_purchase_date', 'last ordered', 'last po date', 'last purchase'],
        reorder_point: ['reorder point', 'reorder_point', 'min stock', 'safety stock', 'min qty', 'rop'],
        warehouse_type: ['warehouse_type', 'type'],
        country: ['country', 'country code'],
        warehouse_count: ['warehouse_count'],
        sales_orders: ['sales_orders'],
        sales_returns: ['sales_returns'],
        sales_revenue: ['sales_revenue'],
        sales_cogs: ['sales_cogs']
    };

    const NUMERIC_COLUMNS = [
        'stock_qty', 'sales_qty', 'purchase_qty', 'cost_price', 'selling_price',
        'reorder_point', 'stock_value', 'warehouse_count',
        'sales_orders', 'sales_returns', 'sales_revenue', 'sales_cogs'
    ];

    const DATE_COLUMNS = ['last_sale_date', 'last_purchase_date'];

    const STRING_DEFAULTS = {
        name: 'Unknown',
        category: 'Uncategorized',
        supplier: 'Unknown',
        location: 'Default'
    };

    const AT_RISK_STATUSES = [
        'CRITICAL - Dead Stock',
        'CRITICAL - No Sales, Still Purchasing',
        'HIGH RISK - Overstocked',
        'HIGH RISK - Overstocked & Over-Purchasing'
    ];

    // PO Column mapping rules (from POAssessment.gs)
    const PO_COLUMN_RULES = [
        { key: 'sku', candidates: ['item sku', 'sku_id', 'sku'] },
        { key: 'name', candidates: ['item name (english)', 'product_name', 'item name', 'product name'] },
        { key: 'po_qty', candidates: ['ordered_qty', 'ordered quantity', 'total ordered quantity', 'ordered qty'] },
        { key: 'delivered_qty', candidates: ['received_qty', 'total delivered quantity', 'delivered quantity'] },
        { key: 'po_number', candidates: ['po_number', 'po number'] },
        { key: 'po_supplier', candidates: ['supplier_name', 'supplier name'] },
        { key: 'store', candidates: ['store_name', 'store name'] },
        { key: 'unit_cost', candidates: ['discounted_unit_cost', 'discounted cost per unit', 'unit_cost', 'cost per unit'] },
        { key: 'state', candidates: ['po_status', 'state'] }
    ];

    // =========================================================================
    // From Utils.gs — Helper functions
    // =========================================================================

    function round2(n, decimals) {
        if (n === null || n === undefined || isNaN(n)) return 0;
        if (n === Infinity || n === -Infinity) return 9999;
        if (decimals === undefined) decimals = 2;
        var factor = Math.pow(10, decimals);
        return Math.round(n * factor) / factor;
    }

    function formatDate(date) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
        var y = date.getFullYear();
        var m = ('0' + (date.getMonth() + 1)).slice(-2);
        var d = ('0' + date.getDate()).slice(-2);
        return y + '-' + m + '-' + d;
    }

    function daysBetween(date1, date2) {
        if (!date1 || !date2) return 0;
        if (!(date1 instanceof Date)) date1 = new Date(date1);
        if (!(date2 instanceof Date)) date2 = new Date(date2);
        if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
        var msPerDay = 86400000;
        return Math.round(Math.abs(date2.getTime() - date1.getTime()) / msPerDay);
    }

    function formatInt(n) {
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatNum(n) {
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function pickColumnsRow(row, cols) {
        var obj = {};
        for (var j = 0; j < cols.length; j++) {
            var c = cols[j];
            if (row[c] !== undefined) {
                obj[c] = row[c];
            }
        }
        return obj;
    }

    function pickColumns(data, cols) {
        var result = [];
        for (var i = 0; i < data.length; i++) {
            result.push(pickColumnsRow(data[i], cols));
        }
        return result;
    }

    // =========================================================================
    // From Loader.gs — normalizeColumns / coerceRow
    // =========================================================================

    function normalizeColumns(rawHeaders) {
        var mapped = [];
        for (var i = 0; i < rawHeaders.length; i++) {
            var raw = String(rawHeaders[i]).trim().toLowerCase().replace(/\s+/g, ' ');
            var canonical = null;

            for (var key in COLUMN_MAP) {
                var aliases = COLUMN_MAP[key];
                for (var j = 0; j < aliases.length; j++) {
                    if (raw === aliases[j]) {
                        canonical = key;
                        break;
                    }
                }
                if (canonical) break;
            }

            mapped.push({
                index: i,
                canonical: canonical,
                raw: rawHeaders[i]
            });
        }
        return mapped;
    }

    function coerceRow(rowValues, headers) {
        var obj = {};

        for (var i = 0; i < headers.length; i++) {
            var h = headers[i];
            if (!h.canonical) continue;
            var val = i < rowValues.length ? rowValues[i] : null;
            obj[h.canonical] = val;
        }

        // Coerce numeric fields
        for (var n = 0; n < NUMERIC_COLUMNS.length; n++) {
            var col = NUMERIC_COLUMNS[n];
            if (obj[col] !== undefined && obj[col] !== null) {
                var num = parseFloat(obj[col]);
                obj[col] = isNaN(num) ? 0 : num;
            } else {
                if (col !== 'stock_value') {
                    obj[col] = 0;
                }
            }
        }

        // Coerce date fields
        for (var d = 0; d < DATE_COLUMNS.length; d++) {
            var dcol = DATE_COLUMNS[d];
            if (obj[dcol] !== undefined && obj[dcol] !== null && obj[dcol] !== '') {
                var dateVal = obj[dcol];
                if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
                    obj[dcol] = dateVal;
                } else {
                    var parsed = new Date(dateVal);
                    obj[dcol] = isNaN(parsed.getTime()) ? null : parsed;
                }
            } else {
                obj[dcol] = null;
            }
        }

        // Fill string defaults
        for (var skey in STRING_DEFAULTS) {
            if (!obj[skey] || String(obj[skey]).trim() === '') {
                obj[skey] = STRING_DEFAULTS[skey];
            } else {
                obj[skey] = String(obj[skey]).trim();
            }
        }

        // Ensure SKU exists
        if (!obj.sku || String(obj.sku).trim() === '') {
            return null;
        }
        obj.sku = String(obj.sku).trim();

        return obj;
    }

    // =========================================================================
    // From Assessor.gs — assessSku / assessAll
    // =========================================================================

    function assessSku(row, analysisDays, referenceDate) {
        var stock = parseFloat(row.stock_qty || 0) || 0;
        var sales = parseFloat(row.sales_qty || 0) || 0;
        var purchases = parseFloat(row.purchase_qty || 0) || 0;
        var lastPurchase = row.last_purchase_date;

        var avgDailySales = analysisDays > 0 ? sales / analysisDays : 0;
        var daysOfStock = avgDailySales > 0 ? stock / avgDailySales : Infinity;
        var turnover = stock > 0 ? sales / stock : 0;

        var purchasedRecently = false;
        if (lastPurchase && lastPurchase instanceof Date && !isNaN(lastPurchase.getTime())) {
            var daysSincePurchase = daysBetween(lastPurchase, referenceDate);
            purchasedRecently = daysSincePurchase <= 30;
        }

        // 1. INACTIVE
        if (stock === 0 && sales === 0 && purchases === 0) {
            return ['INACTIVE', 0];
        }

        // 2. CRITICAL - No Sales, Still Purchasing
        if (sales === 0 && purchases > 0 && purchasedRecently) {
            return ['CRITICAL - No Sales, Still Purchasing', 10];
        }

        // 3. CRITICAL - Dead Stock
        if (stock > 0 && sales === 0) {
            return ['CRITICAL - Dead Stock', 9];
        }

        // 4. STOCKOUT - Selling but No Stock
        if (stock === 0 && sales > 0) {
            return ['STOCKOUT - Selling but No Stock', 8];
        }

        // 5. NEW/PIPELINE - Purchased, Awaiting Stock
        if (purchases > 0 && stock === 0 && sales === 0 && purchasedRecently) {
            return ['NEW/PIPELINE - Purchased, Awaiting Stock', 1];
        }

        // 6. LOW STOCK - May Stockout Soon
        if (stock > 0 && avgDailySales > 0 && stock < (avgDailySales * 14)) {
            return ['LOW STOCK - May Stockout Soon', 7];
        }

        // Compute flags for overstocked/over-purchasing
        var isOverstocked = avgDailySales > 0 && stock > (avgDailySales * 90);
        var isOverPurchasing = sales > 0 && purchases > (2 * sales);

        // 7. HIGH RISK - Overstocked & Over-Purchasing
        if (isOverstocked && isOverPurchasing) {
            return ['HIGH RISK - Overstocked & Over-Purchasing', 5];
        }

        // 8. HIGH RISK - Overstocked
        if (isOverstocked) {
            return ['HIGH RISK - Overstocked', 4];
        }

        // 9. WARNING - Over-Purchasing
        if (isOverPurchasing) {
            return ['WARNING - Over-Purchasing', 6];
        }

        // 10. HEALTHY - Good Turnover
        if (turnover > 2) {
            return ['HEALTHY - Good Turnover', 0];
        }

        // 11. MEDIUM - Adequate Stock (default)
        return ['MEDIUM - Adequate Stock', 2];
    }

    function assessAll(data, analysisDays) {
        if (!data || data.length === 0) return [];
        if (!analysisDays) analysisDays = 90;

        // Determine reference date: max of now and all date columns
        var referenceDate = new Date();

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            if (row.last_sale_date && row.last_sale_date instanceof Date && !isNaN(row.last_sale_date.getTime())) {
                if (row.last_sale_date > referenceDate) {
                    referenceDate = new Date(row.last_sale_date.getTime());
                }
            }
            if (row.last_purchase_date && row.last_purchase_date instanceof Date && !isNaN(row.last_purchase_date.getTime())) {
                if (row.last_purchase_date > referenceDate) {
                    referenceDate = new Date(row.last_purchase_date.getTime());
                }
            }
        }

        // Assess each row
        for (var j = 0; j < data.length; j++) {
            var r = data[j];
            var result = assessSku(r, analysisDays, referenceDate);
            r.assessment = result[0];
            r.severity = result[1];

            // Calculated fields
            var avgDaily = analysisDays > 0 ? (r.sales_qty || 0) / analysisDays : 0;
            r.avg_daily_sales = round2(avgDaily);

            r.days_of_stock = avgDaily > 0 ? round2((r.stock_qty || 0) / avgDaily, 1) : 9999;

            r.turnover_ratio = (r.stock_qty || 0) > 0 ? round2((r.sales_qty || 0) / r.stock_qty) : 0;

            // Stock value: use existing if available, otherwise calculate
            if (!r.stock_value || r.stock_value === 0) {
                r.stock_value = round2((r.stock_qty || 0) * (r.cost_price || 0));
            } else {
                r.stock_value = round2(r.stock_value);
            }

            // Potential revenue
            r.potential_revenue = round2((r.stock_qty || 0) * (r.selling_price || 0));

            // Dead stock value
            r.dead_stock_value = (r.assessment.indexOf('Dead Stock') !== -1) ? r.stock_value : 0;

            // Days since last sale
            if (r.last_sale_date && r.last_sale_date instanceof Date && !isNaN(r.last_sale_date.getTime())) {
                r.days_since_last_sale = daysBetween(r.last_sale_date, referenceDate);
            } else {
                r.days_since_last_sale = -1;
            }

            // Days since last purchase
            if (r.last_purchase_date && r.last_purchase_date instanceof Date && !isNaN(r.last_purchase_date.getTime())) {
                r.days_since_last_purchase = daysBetween(r.last_purchase_date, referenceDate);
            } else {
                r.days_since_last_purchase = -1;
            }

            // is_new_sku
            r.is_new_sku = false;

            // recently_purchased — last purchase within 60 days
            if (r.last_purchase_date && r.last_purchase_date instanceof Date && !isNaN(r.last_purchase_date.getTime())) {
                r.recently_purchased = daysBetween(r.last_purchase_date, referenceDate) <= 60;
            } else {
                r.recently_purchased = false;
            }

            // Format date fields for JSON output
            if (r.last_sale_date instanceof Date) {
                r.last_sale_date = formatDate(r.last_sale_date);
            } else {
                r.last_sale_date = '';
            }
            if (r.last_purchase_date instanceof Date) {
                r.last_purchase_date = formatDate(r.last_purchase_date);
            } else {
                r.last_purchase_date = '';
            }
        }

        return data;
    }

    // =========================================================================
    // From Aggregator.gs
    // =========================================================================

    function aggregateOverview(data) {
        if (!data || data.length === 0) {
            return {
                total_skus: 0,
                total_stock_value: 0,
                dead_stock_value: 0,
                healthy_pct: 0,
                at_risk_count: 0,
                stockout_count: 0,
                low_stock_count: 0,
                new_sku_count: 0,
                recently_purchased_count: 0,
                status_distribution: {},
                status_summary: []
            };
        }

        var totalStockValue = 0;
        var deadStockValue = 0;
        var healthyCount = 0;
        var activeCount = 0;
        var atRiskCount = 0;
        var stockoutCount = 0;
        var lowStockCount = 0;
        var newSkuCount = 0;
        var recentPurchasedCount = 0;
        var statusDist = {};

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            totalStockValue += (row.stock_value || 0);
            deadStockValue += (row.dead_stock_value || 0);

            var assess = row.assessment || '';

            if (assess !== 'INACTIVE') activeCount++;
            if (assess === 'HEALTHY - Good Turnover') healthyCount++;
            if (AT_RISK_STATUSES.indexOf(assess) !== -1) atRiskCount++;
            if (assess === 'STOCKOUT - Selling but No Stock') stockoutCount++;
            if (assess === 'LOW STOCK - May Stockout Soon') lowStockCount++;
            if (row.is_new_sku) newSkuCount++;
            if (row.recently_purchased) recentPurchasedCount++;

            statusDist[assess] = (statusDist[assess] || 0) + 1;
        }

        if (activeCount === 0) activeCount = 1;

        return {
            total_skus: data.length,
            total_stock_value: round2(totalStockValue),
            dead_stock_value: round2(deadStockValue),
            healthy_pct: round2(healthyCount / activeCount * 100, 1),
            at_risk_count: atRiskCount,
            stockout_count: stockoutCount,
            low_stock_count: lowStockCount,
            new_sku_count: newSkuCount,
            recently_purchased_count: recentPurchasedCount,
            status_distribution: statusDist,
            status_summary: buildStatusSummary(data, totalStockValue)
        };
    }

    function buildStatusSummary(data, totalValue) {
        if (totalValue === 0) totalValue = 1;

        var groups = {};
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var status = row.assessment || '';
            if (!groups[status]) {
                groups[status] = { status: status, sku_count: 0, stock_qty: 0, stock_value: 0 };
            }
            groups[status].sku_count++;
            groups[status].stock_qty += (row.stock_qty || 0);
            groups[status].stock_value += (row.stock_value || 0);
        }

        var result = [];
        for (var s in groups) {
            var g = groups[s];
            g.stock_value = round2(g.stock_value);
            g.stock_qty = Math.round(g.stock_qty);
            g.pct_of_total = round2(g.stock_value / totalValue * 100, 1);
            result.push(g);
        }

        result.sort(function(a, b) { return b.stock_value - a.stock_value; });
        return result;
    }

    function aggregateBySupplier(data) {
        if (!data || data.length === 0) return [];

        var groups = {};
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var key = row.supplier || 'Unknown';
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }

        var result = [];
        for (var supplier in groups) {
            var g = groups[supplier];
            var activeCount = 0;
            var healthyCount = 0;
            var riskCount = 0;
            var deadStockVal = 0;
            var stockVal = 0;
            var turnoverSum = 0;
            var statusDist = {};

            for (var j = 0; j < g.length; j++) {
                var r = g[j];
                var assess = r.assessment || '';
                if (assess !== 'INACTIVE') activeCount++;
                if (assess === 'HEALTHY - Good Turnover') healthyCount++;
                if (AT_RISK_STATUSES.indexOf(assess) !== -1) riskCount++;
                deadStockVal += (r.dead_stock_value || 0);
                stockVal += (r.stock_value || 0);
                turnoverSum += (r.turnover_ratio || 0);
                statusDist[assess] = (statusDist[assess] || 0) + 1;
            }

            if (activeCount === 0) activeCount = 1;
            var healthyPct = round2(healthyCount / activeCount * 100, 1);
            var riskPct = round2(riskCount / activeCount * 100, 1);
            var avgTurn = round2(turnoverSum / g.length);

            var healthScore = round2(
                healthyPct * 0.4 +
                (100 - riskPct) * 0.3 +
                Math.min(avgTurn * 10, 100) * 0.3,
                1
            );

            result.push({
                supplier: supplier,
                total_skus: g.length,
                healthy_count: healthyCount,
                healthy_pct: healthyPct,
                at_risk_count: riskCount,
                dead_stock_value: round2(deadStockVal),
                stock_value: round2(stockVal),
                avg_turnover: avgTurn,
                health_score: healthScore,
                status_distribution: statusDist
            });
        }

        result.sort(function(a, b) { return b.health_score - a.health_score; });
        return result;
    }

    function aggregateByCategory(data) {
        if (!data || data.length === 0) return [];

        var groups = {};
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var key = row.category || 'Uncategorized';
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }

        var result = [];
        for (var cat in groups) {
            var g = groups[cat];
            var activeCount = 0;
            var healthyCount = 0;
            var riskCount = 0;
            var deadStockVal = 0;
            var stockVal = 0;
            var turnoverSum = 0;
            var statusDist = {};

            for (var j = 0; j < g.length; j++) {
                var r = g[j];
                var assess = r.assessment || '';
                if (assess !== 'INACTIVE') activeCount++;
                if (assess === 'HEALTHY - Good Turnover') healthyCount++;
                if (AT_RISK_STATUSES.indexOf(assess) !== -1) riskCount++;
                deadStockVal += (r.dead_stock_value || 0);
                stockVal += (r.stock_value || 0);
                turnoverSum += (r.turnover_ratio || 0);
                statusDist[assess] = (statusDist[assess] || 0) + 1;
            }

            if (activeCount === 0) activeCount = 1;

            result.push({
                category: cat,
                total_skus: g.length,
                healthy_count: healthyCount,
                healthy_pct: round2(healthyCount / activeCount * 100, 1),
                at_risk_count: riskCount,
                dead_stock_value: round2(deadStockVal),
                stock_value: round2(stockVal),
                avg_turnover: round2(turnoverSum / g.length),
                status_distribution: statusDist
            });
        }

        result.sort(function(a, b) { return b.healthy_pct - a.healthy_pct; });
        return result;
    }

    function aggregateByLocation(data) {
        if (!data || data.length === 0) return [];

        var groups = {};
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var key = row.location || 'Default';
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(row);
        }

        var result = [];
        for (var loc in groups) {
            var g = groups[loc];
            var stockVal = 0;
            var statusDist = {};

            for (var j = 0; j < g.length; j++) {
                stockVal += (g[j].stock_value || 0);
                var assess = g[j].assessment || '';
                statusDist[assess] = (statusDist[assess] || 0) + 1;
            }

            result.push({
                location: loc,
                total_skus: g.length,
                stock_value: round2(stockVal),
                status_distribution: statusDist
            });
        }

        result.sort(function(a, b) { return b.stock_value - a.stock_value; });
        return result;
    }

    function getTopWorstSkus(data, n) {
        if (!data || data.length === 0) return [];
        if (!n) n = 10;

        var sorted = data.slice();
        sorted.sort(function(a, b) { return (b.severity || 0) - (a.severity || 0); });
        var top = sorted.slice(0, n);

        var cols = [
            'sku', 'name', 'assessment', 'severity', 'stock_qty', 'sales_qty',
            'purchase_qty', 'stock_value', 'days_of_stock', 'supplier', 'category', 'location'
        ];

        return pickColumns(top, cols);
    }

    // =========================================================================
    // From POAssessment.gs
    // =========================================================================

    function mapPOColumns(rawHeaders) {
        var colMap = {};
        var headersLower = [];
        for (var i = 0; i < rawHeaders.length; i++) {
            headersLower.push({
                index: i,
                lower: String(rawHeaders[i]).trim().toLowerCase().replace(/\s+/g, '_')
            });
        }

        for (var r = 0; r < PO_COLUMN_RULES.length; r++) {
            var rule = PO_COLUMN_RULES[r];
            var found = false;

            for (var c = 0; c < rule.candidates.length && !found; c++) {
                var candNorm = rule.candidates[c].trim().toLowerCase().replace(/\s+/g, '_');
                for (var h = 0; h < headersLower.length; h++) {
                    if (headersLower[h].lower === candNorm || headersLower[h].lower.indexOf(candNorm) !== -1) {
                        colMap[rule.key] = headersLower[h].index;
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                colMap[rule.key] = null;
            }
        }

        // Fallback: if sku not found, try any column with "sku" or use first column
        if (colMap.sku === null) {
            for (var s = 0; s < headersLower.length; s++) {
                if (headersLower[s].lower.indexOf('sku') !== -1) {
                    colMap.sku = headersLower[s].index;
                    break;
                }
            }
            if (colMap.sku === null) colMap.sku = 0;
        }

        return colMap;
    }

    function parsePOArray(poArray) {
        // poArray is a 2D array from localStorage (first row = headers)
        if (!poArray || poArray.length < 2) return [];

        var rawHeaders = poArray[0];
        var colMap = mapPOColumns(rawHeaders);

        var data = [];
        for (var i = 1; i < poArray.length; i++) {
            var row = poArray[i];
            var obj = {};

            for (var key in colMap) {
                var idx = colMap[key];
                obj[key] = (idx !== null && idx < row.length) ? row[idx] : '';
            }

            // Coerce SKU
            if (!obj.sku || String(obj.sku).trim() === '') continue;
            var skuNum = parseFloat(obj.sku);
            if (!isNaN(skuNum)) {
                obj.sku = String(Math.floor(skuNum));
            } else {
                obj.sku = String(obj.sku).trim();
            }

            // Coerce po_qty
            obj.po_qty = parseInt(obj.po_qty, 10) || 0;

            // Coerce unit_cost
            obj.unit_cost = parseFloat(obj.unit_cost) || 0;

            // Coerce strings
            obj.product_name = String(obj.name || '').trim();
            obj.po_number = String(obj.po_number || '').trim();
            obj.po_supplier = String(obj.po_supplier || '').trim();
            obj.store = String(obj.store || '').trim();
            obj.po_state = String(obj.state || '').trim();

            // Filter by state: only pending, in progress, confirmed
            var stateLower = obj.po_state.toLowerCase();
            if (stateLower && stateLower !== 'pending' && stateLower !== 'in progress' && stateLower !== 'confirmed') {
                continue;
            }

            data.push(obj);
        }

        return data;
    }

    /**
     * Parses PO data stored as array of objects (from sheet_to_json).
     * Maps column names using PO_COLUMN_RULES and applies same coercion as parsePOArray.
     */
    function parsePOObjects(objArray) {
        if (!objArray || objArray.length === 0) return [];

        // Get all unique keys from the objects
        var rawHeaders = [];
        var keySet = {};
        for (var i = 0; i < objArray.length; i++) {
            for (var key in objArray[i]) {
                if (!keySet[key]) {
                    keySet[key] = true;
                    rawHeaders.push(key);
                }
            }
        }

        var colMap = mapPOColumns(rawHeaders);

        var data = [];
        for (var i = 0; i < objArray.length; i++) {
            var row = objArray[i];
            var obj = {};

            for (var ruleKey in colMap) {
                var headerName = colMap[ruleKey] !== null ? rawHeaders[colMap[ruleKey]] : null;
                obj[ruleKey] = headerName ? (row[headerName] !== undefined ? row[headerName] : '') : '';
            }

            // Coerce SKU
            if (!obj.sku || String(obj.sku).trim() === '') continue;
            var skuNum = parseFloat(obj.sku);
            if (!isNaN(skuNum)) {
                obj.sku = String(Math.floor(skuNum));
            } else {
                obj.sku = String(obj.sku).trim();
            }

            // Coerce po_qty
            obj.po_qty = parseInt(obj.po_qty, 10) || 0;

            // Coerce unit_cost
            obj.unit_cost = parseFloat(obj.unit_cost) || 0;

            // Coerce strings
            obj.product_name = String(obj.name || '').trim();
            obj.po_number = String(obj.po_number || '').trim();
            obj.po_supplier = String(obj.po_supplier || '').trim();
            obj.store = String(obj.store || '').trim();
            obj.po_state = String(obj.state || '').trim();

            // Filter by state: only pending, in progress, confirmed
            var stateLower = obj.po_state.toLowerCase();
            if (stateLower && stateLower !== 'pending' && stateLower !== 'in progress' && stateLower !== 'confirmed') {
                continue;
            }

            data.push(obj);
        }

        return data;
    }

    function assessPO(poData, inventoryData) {
        if (!poData || poData.length === 0) {
            return { data: [], summary: { APPROVED: 0, REVIEW: 0, REJECTED: 0 }, total: 0 };
        }

        // Build inventory lookup by SKU
        var invMap = {};
        if (inventoryData && inventoryData.length > 0) {
            for (var i = 0; i < inventoryData.length; i++) {
                var inv = inventoryData[i];
                var invSku = String(inv.sku).trim();
                if (!invMap[invSku]) {
                    invMap[invSku] = inv;
                }
            }
        }

        var results = [];
        var summary = { APPROVED: 0, REVIEW: 0, REJECTED: 0 };

        for (var j = 0; j < poData.length; j++) {
            var po = poData[j];
            var sku = String(po.sku).trim();
            var invItem = invMap[sku] || null;
            var hasInv = !!invItem;

            // Get inventory values
            var stockQty = hasInv ? (parseFloat(invItem.stock_qty) || 0) : 0;
            var salesQty = hasInv ? (parseFloat(invItem.sales_qty) || 0) : 0;
            var purchaseQty = hasInv ? (parseFloat(invItem.purchase_qty) || 0) : 0;
            var stockValue = hasInv ? (parseFloat(invItem.stock_value) || 0) : 0;
            var daysOfStock = hasInv ? (parseFloat(invItem.days_of_stock) || 0) : 0;
            var avgDailySales = hasInv ? (parseFloat(invItem.avg_daily_sales) || 0) : 0;
            var turnoverRatio = hasInv ? (parseFloat(invItem.turnover_ratio) || 0) : 0;
            var assessment = hasInv ? (invItem.assessment || '') : '';
            var category = hasInv ? (invItem.category || '') : '';
            var supplier = hasInv ? (invItem.supplier || '') : '';

            var poQty = po.po_qty || 0;
            var hasDemand = avgDailySales > 0;

            // Calculated PO fields
            var poCoversDays = hasDemand ? Math.round(poQty / avgDailySales) : 9999;
            var totalDaysAfterPO = hasDemand ? Math.round((stockQty + poQty) / avgDailySales) : 9999;
            var suggestedQty = hasDemand ? Math.max(0, Math.round(avgDailySales * 30 - stockQty)) : 0;

            // Decision logic
            var recommendation;
            var reason;

            if (!hasInv) {
                recommendation = 'REVIEW';
                reason = 'New SKU — not in inventory. PO requests ' + formatInt(poQty) + ' units. Verify demand before proceeding.';
            } else if (!hasDemand) {
                recommendation = 'REJECTED';
                reason = 'No sales history. Holding ' + formatInt(Math.round(stockQty)) +
                    ' units (value ' + formatNum(stockValue) + '). PO of ' +
                    formatInt(poQty) + ' would add to unsold inventory.';
            } else if (totalDaysAfterPO <= 45) {
                recommendation = 'APPROVED';
                reason = 'After PO, total coverage is ' + formatNum(totalDaysAfterPO) + ' days (' +
                    formatInt(Math.round(stockQty)) + ' on hand + ' + formatInt(poQty) + ' PO = ' +
                    formatInt(Math.round(stockQty + poQty)) + ' units at ' + avgDailySales.toFixed(1) +
                    '/day). Within 45-day target.';
            } else if (totalDaysAfterPO <= 60) {
                recommendation = 'REVIEW';
                reason = 'After PO, total coverage is ' + formatNum(totalDaysAfterPO) + ' days (' +
                    formatInt(Math.round(stockQty)) + ' on hand + ' + formatInt(poQty) + ' PO = ' +
                    formatInt(Math.round(stockQty + poQty)) + ' units at ' + avgDailySales.toFixed(1) +
                    '/day). Exceeds 45 days — review if ' + formatInt(poQty) + ' units is justified. Suggested 30-day qty: ' +
                    formatInt(suggestedQty) + '.';
            } else {
                recommendation = 'REJECTED';
                reason = 'After PO, total coverage is ' + formatNum(totalDaysAfterPO) + ' days (' +
                    formatInt(Math.round(stockQty)) + ' on hand + ' + formatInt(poQty) + ' PO = ' +
                    formatInt(Math.round(stockQty + poQty)) + ' units at ' + avgDailySales.toFixed(1) +
                    '/day). Exceeds 60 days — excessive. Suggested 30-day qty: ' +
                    formatInt(suggestedQty) + '.';
            }

            summary[recommendation] = (summary[recommendation] || 0) + 1;

            results.push({
                sku: sku,
                product_name: po.product_name || '',
                po_qty: poQty,
                po_number: po.po_number || '',
                po_supplier: po.po_supplier || '',
                store: po.store || '',
                unit_cost: po.unit_cost || 0,
                po_state: po.po_state || '',
                recommendation: recommendation,
                reason: reason,
                assessment: assessment,
                stock_qty: Math.round(stockQty),
                sales_qty: Math.round(salesQty),
                purchase_qty: Math.round(purchaseQty),
                stock_value: round2(stockValue),
                days_of_stock: round2(daysOfStock, 1),
                avg_daily_sales: round2(avgDailySales),
                turnover_ratio: round2(turnoverRatio),
                po_covers_days: poCoversDays,
                total_days_after_po: totalDaysAfterPO,
                suggested_qty: suggestedQty,
                category: category,
                supplier: supplier
            });
        }

        return {
            data: results,
            summary: summary,
            total: results.length
        };
    }

    // =========================================================================
    // From Ordering.gs
    // =========================================================================

    function getOrderRecommendations(data, targetDays, showAll, urgencyFilter) {
        if (!data || data.length === 0) {
            return { data: [], summary: {}, store_summary: [], total: 0 };
        }

        if (!targetDays) targetDays = 30;

        var enriched = [];
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var avgDaily = row.avg_daily_sales || 0;
            var stock = row.stock_qty || 0;
            var dos = row.days_of_stock || 0;
            var costPrice = row.cost_price || 0;

            var suggestedOrderQty = Math.max(0, Math.round(avgDaily * targetDays - stock));
            var orderValue = round2(suggestedOrderQty * costPrice);

            // Urgency calculation
            var urgency;
            var hasSales = avgDaily > 0;

            if (!hasSales) {
                urgency = 'NOT NEEDED';
            } else if (dos >= 9999) {
                urgency = 'NOT NEEDED';
            } else if (dos > targetDays) {
                urgency = 'NOT NEEDED';
            } else if (dos >= 14 && dos <= targetDays) {
                urgency = 'NORMAL';
            } else if (dos >= 7 && dos < 14) {
                urgency = 'SOON';
            } else if (dos < 7) {
                urgency = 'URGENT';
            } else {
                urgency = 'NORMAL';
            }

            enriched.push({
                sku: row.sku || '',
                name: row.name || '',
                location: row.location || '',
                supplier: row.supplier || '',
                category: row.category || '',
                stock_qty: Math.round(stock),
                avg_daily_sales: round2(avgDaily),
                days_of_stock: round2(dos, 1),
                suggested_order_qty: suggestedOrderQty,
                order_value: orderValue,
                urgency: urgency,
                cost_price: round2(costPrice),
                selling_price: round2(row.selling_price || 0),
                assessment: row.assessment || '',
                severity: row.severity || 0
            });
        }

        // Build urgency counts from ALL data (before filtering)
        var urgencyCounts = { URGENT: 0, SOON: 0, NORMAL: 0, 'NOT NEEDED': 0 };
        for (var u = 0; u < enriched.length; u++) {
            var urg = enriched[u].urgency;
            urgencyCounts[urg] = (urgencyCounts[urg] || 0) + 1;
        }

        // Filter output
        var output = [];
        for (var f = 0; f < enriched.length; f++) {
            var item = enriched[f];
            if (!showAll && item.urgency === 'NOT NEEDED') continue;
            if (urgencyFilter && item.urgency !== urgencyFilter) continue;
            output.push(item);
        }

        // Summary calculations
        var totalOrderValue = 0;
        var totalSkusToOrder = 0;
        for (var s = 0; s < output.length; s++) {
            totalOrderValue += output[s].order_value;
            if (output[s].suggested_order_qty > 0) totalSkusToOrder++;
        }

        // Store summary
        var storeGroups = {};
        for (var g = 0; g < output.length; g++) {
            var it = output[g];
            if (it.suggested_order_qty <= 0) continue;
            var loc = it.location || 'Default';
            if (!storeGroups[loc]) {
                storeGroups[loc] = { location: loc, total_order_value: 0, skus_to_order: 0, total_units: 0 };
            }
            storeGroups[loc].total_order_value += it.order_value;
            storeGroups[loc].skus_to_order++;
            storeGroups[loc].total_units += it.suggested_order_qty;
        }

        var storeSummary = [];
        for (var loc2 in storeGroups) {
            var sg = storeGroups[loc2];
            sg.total_order_value = round2(sg.total_order_value);
            storeSummary.push(sg);
        }
        storeSummary.sort(function(a, b) { return b.total_order_value - a.total_order_value; });

        return {
            data: output,
            total: output.length,
            summary: {
                total_skus_to_order: totalSkusToOrder,
                total_order_value: round2(totalOrderValue),
                urgency_counts: urgencyCounts,
                stores_needing_orders: storeSummary.length
            },
            store_summary: storeSummary
        };
    }

    // =========================================================================
    // From Utils.gs — applyFilters
    // =========================================================================

    function applyFilters(data, params) {
        if (!data || data.length === 0) return data;
        if (!params) return data;

        var filtered = data;

        // Filter by status (comma-separated)
        var status = params.status || '';
        if (status) {
            var statuses = status.split(',');
            var statusMap = {};
            for (var s = 0; s < statuses.length; s++) {
                var st = statuses[s].trim();
                if (st) statusMap[st] = true;
            }
            filtered = filtered.filter(function(row) {
                return statusMap[row.assessment || ''];
            });
        }

        // Filter by supplier
        var supplier = params.supplier || '';
        if (supplier) {
            filtered = filtered.filter(function(row) {
                return row.supplier === supplier;
            });
        }

        // Filter by category
        var category = params.category || '';
        if (category) {
            filtered = filtered.filter(function(row) {
                return row.category === category;
            });
        }

        // Filter by location
        var location = params.location || '';
        if (location) {
            filtered = filtered.filter(function(row) {
                return row.location === location;
            });
        }

        // Filter by search text (matches SKU or name)
        var search = (params.search || '').trim().toLowerCase();
        if (search) {
            filtered = filtered.filter(function(row) {
                var skuMatch = (row.sku || '').toLowerCase().indexOf(search) !== -1;
                var nameMatch = (row.name || '').toLowerCase().indexOf(search) !== -1;
                return skuMatch || nameMatch;
            });
        }

        return filtered;
    }

    // =========================================================================
    // From Upload.gs — normalizeUploadRow / processUploads
    // =========================================================================

    function normalizeUploadRow(row, type) {
        var normalized = {};

        // Try to match column names using COLUMN_MAP
        for (var key in row) {
            var lowerKey = String(key).trim().toLowerCase().replace(/\s+/g, ' ');
            var canonical = null;

            for (var mapKey in COLUMN_MAP) {
                var aliases = COLUMN_MAP[mapKey];
                for (var a = 0; a < aliases.length; a++) {
                    if (lowerKey === aliases[a]) {
                        canonical = mapKey;
                        break;
                    }
                }
                if (canonical) break;
            }

            if (canonical) {
                normalized[canonical] = row[key];
            } else {
                // Keep the original key in lowercase with underscores
                normalized[lowerKey.replace(/\s/g, '_')] = row[key];
            }
        }

        // Coerce numeric fields
        var numFields = ['stock_qty', 'sales_qty', 'purchase_qty', 'cost_price',
                         'selling_price', 'stock_value', 'sales_orders', 'sales_returns',
                         'sales_revenue', 'sales_cogs'];
        for (var n = 0; n < numFields.length; n++) {
            var f = numFields[n];
            if (normalized[f] !== undefined && normalized[f] !== null) {
                var v = parseFloat(normalized[f]);
                normalized[f] = isNaN(v) ? 0 : v;
            } else {
                normalized[f] = 0;
            }
        }

        // Ensure SKU
        if (normalized.sku !== undefined && normalized.sku !== null) {
            var skuNum = parseFloat(normalized.sku);
            if (!isNaN(skuNum)) {
                normalized.sku = String(Math.floor(skuNum));
            } else {
                normalized.sku = String(normalized.sku).trim();
            }
        }

        return normalized;
    }

    /**
     * Processes uploaded data from localStorage.
     * Mirrors Upload.gs handleProcess() exactly.
     */
    function processUploads() {
        try {
            // Step 1: Read uploaded data from localStorage
            var sohRaw = localStorage.getItem('stock_upload_soh');
            var salesRaw = localStorage.getItem('stock_upload_sales');
            var poRaw = localStorage.getItem('stock_upload_po');

            if (!sohRaw) {
                return { error: 'SOH data is missing. Please upload SOH file.' };
            }
            if (!salesRaw) {
                return { error: 'Sales data is missing. Please upload Sales file.' };
            }

            var sohData = JSON.parse(sohRaw);
            var salesData = JSON.parse(salesRaw);

            if (!Array.isArray(sohData) || sohData.length < 1) {
                return { error: 'SOH data is empty.' };
            }
            if (!Array.isArray(salesData) || salesData.length < 1) {
                return { error: 'Sales data is empty.' };
            }

            // Step 2: Normalize SOH data — aggregate by SKU
            var sohBySku = {};
            for (var i = 0; i < sohData.length; i++) {
                var row = normalizeUploadRow(sohData[i], 'soh');
                if (!row || !row.sku) continue;

                var sku = String(row.sku).trim();
                if (!sohBySku[sku]) {
                    sohBySku[sku] = {
                        sku: sku,
                        name: row.name || 'Unknown',
                        category: row.category || '',
                        sub_category: row.sub_category || '',
                        supplier: row.supplier || '',
                        location: row.location || '',
                        stock_qty: 0,
                        cost_price: row.cost_price || 0,
                        selling_price: row.selling_price || 0,
                        stock_value: 0,
                        warehouse_count: 0,
                        country: row.country || '',
                        warehouse_type: row.warehouse_type || ''
                    };
                }
                sohBySku[sku].stock_qty += (row.stock_qty || 0);
                sohBySku[sku].stock_value += (row.stock_value || 0);
                sohBySku[sku].warehouse_count++;

                // Keep the name/location from the row with the highest stock
                if ((row.stock_qty || 0) > 0) {
                    if (row.name) sohBySku[sku].name = row.name;
                    if (row.location) sohBySku[sku].location = row.location;
                    if (row.category) sohBySku[sku].category = row.category;
                }
            }

            // Step 3: Normalize Sales data — aggregate by SKU
            var salesBySku = {};
            for (var s = 0; s < salesData.length; s++) {
                var sRow = normalizeUploadRow(salesData[s], 'sales');
                if (!sRow || !sRow.sku) continue;

                var sSku = String(sRow.sku).trim();
                if (!salesBySku[sSku]) {
                    salesBySku[sSku] = {
                        sales_qty: 0,
                        sales_orders: 0,
                        sales_returns: 0,
                        sales_revenue: 0,
                        sales_cogs: 0
                    };
                }
                salesBySku[sSku].sales_qty += (sRow.sales_qty || 0);
                salesBySku[sSku].sales_orders += (sRow.sales_orders || 0);
                salesBySku[sSku].sales_returns += (sRow.sales_returns || 0);
                salesBySku[sSku].sales_revenue += (sRow.sales_revenue || 0);
                salesBySku[sSku].sales_cogs += (sRow.sales_cogs || 0);
            }

            // Step 4: Merge SOH + Sales
            var merged = [];
            var outColumns = [
                'sku', 'name', 'category', 'sub_category', 'supplier', 'location',
                'country', 'warehouse_type', 'stock_qty', 'sales_qty', 'purchase_qty',
                'sales_orders', 'sales_returns', 'sales_revenue', 'sales_cogs',
                'cost_price', 'selling_price', 'stock_value',
                'last_sale_date', 'last_purchase_date', 'warehouse_count'
            ];

            for (var msku in sohBySku) {
                var inv = sohBySku[msku];
                var sal = salesBySku[msku] || {};

                // Fill cost from sales COGS if SOH cost is 0
                var costPrice = inv.cost_price || 0;
                if (costPrice === 0 && (sal.sales_cogs || 0) > 0 && (sal.sales_qty || 0) > 0) {
                    costPrice = round2(sal.sales_cogs / sal.sales_qty);
                }

                var sellingPrice = inv.selling_price || 0;
                if (sellingPrice === 0 && (sal.sales_revenue || 0) > 0 && (sal.sales_qty || 0) > 0) {
                    sellingPrice = round2(sal.sales_revenue / sal.sales_qty);
                }

                var stockValue = inv.stock_value || 0;
                if (stockValue === 0) {
                    stockValue = round2(inv.stock_qty * costPrice);
                }

                var purchaseQty = 0; // No separate purchase file in this flow

                merged.push({
                    sku: msku,
                    name: inv.name,
                    category: inv.category || 'Uncategorized',
                    sub_category: inv.sub_category || '',
                    supplier: inv.supplier || 'Unknown',
                    location: inv.location || 'Default',
                    country: inv.country || '',
                    warehouse_type: inv.warehouse_type || '',
                    stock_qty: Math.round(inv.stock_qty),
                    sales_qty: Math.round(sal.sales_qty || 0),
                    purchase_qty: purchaseQty,
                    sales_orders: Math.round(sal.sales_orders || 0),
                    sales_returns: Math.round(sal.sales_returns || 0),
                    sales_revenue: round2(sal.sales_revenue || 0),
                    sales_cogs: round2(sal.sales_cogs || 0),
                    cost_price: costPrice,
                    selling_price: sellingPrice,
                    stock_value: stockValue,
                    last_sale_date: '',
                    last_purchase_date: '',
                    warehouse_count: inv.warehouse_count || 1
                });
            }

            // Step 5: Save merged data to localStorage as main data
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(merged));
            // Save timestamp
            localStorage.setItem(CONFIG.STORAGE_KEY + '_ts', new Date().toISOString());

            // Step 6: Handle PO data
            var poUpdated = false;
            if (poRaw) {
                var poData = JSON.parse(poRaw);
                if (Array.isArray(poData) && poData.length > 0) {
                    localStorage.setItem(CONFIG.STORAGE_PO_KEY, JSON.stringify(poData));
                    localStorage.setItem(CONFIG.STORAGE_PO_KEY + '_ts', new Date().toISOString());
                    poUpdated = true;
                }
            }

            // Step 7: Clear upload storage keys
            localStorage.removeItem('stock_upload_soh');
            localStorage.removeItem('stock_upload_sales');
            localStorage.removeItem('stock_upload_po');

            var msg = 'Data updated successfully! ' + merged.length + ' SKUs processed.';
            if (poUpdated) msg += ' PO file updated.';

            return {
                success: true,
                message: msg,
                sku_count: merged.length
            };

        } catch (err) {
            return { error: 'Processing failed: ' + err.message };
        }
    }

    function processUploadsFromMemory(cache) {
        try {
            var sohData = cache.soh;
            var salesData = cache.sales;
            var poRawData = cache.po;

            if (!sohData || !Array.isArray(sohData) || sohData.length < 1) {
                return { error: 'SOH data is missing. Please upload SOH file.' };
            }
            if (!salesData || !Array.isArray(salesData) || salesData.length < 1) {
                return { error: 'Sales data is missing. Please upload Sales file.' };
            }

            var sohBySku = {};
            for (var i = 0; i < sohData.length; i++) {
                var row = normalizeUploadRow(sohData[i], 'soh');
                if (!row || !row.sku) continue;
                var sku = String(row.sku).trim();
                if (!sohBySku[sku]) {
                    sohBySku[sku] = { sku: sku, name: row.name || 'Unknown', category: row.category || '', sub_category: row.sub_category || '', supplier: row.supplier || '', location: row.location || '', stock_qty: 0, cost_price: row.cost_price || 0, selling_price: row.selling_price || 0, stock_value: 0, warehouse_count: 0 };
                }
                sohBySku[sku].stock_qty += (row.stock_qty || 0);
                sohBySku[sku].stock_value += (row.stock_value || 0);
                sohBySku[sku].warehouse_count++;
                if ((row.stock_qty || 0) > 0) { if (row.name) sohBySku[sku].name = row.name; if (row.location) sohBySku[sku].location = row.location; if (row.category) sohBySku[sku].category = row.category; }
            }

            var salesBySku = {};
            for (var s = 0; s < salesData.length; s++) {
                var sRow = normalizeUploadRow(salesData[s], 'sales');
                if (!sRow || !sRow.sku) continue;
                var sSku = String(sRow.sku).trim();
                if (!salesBySku[sSku]) { salesBySku[sSku] = { sales_qty: 0, sales_orders: 0, sales_returns: 0, sales_revenue: 0, sales_cogs: 0 }; }
                salesBySku[sSku].sales_qty += (sRow.sales_qty || 0); salesBySku[sSku].sales_orders += (sRow.sales_orders || 0); salesBySku[sSku].sales_returns += (sRow.sales_returns || 0); salesBySku[sSku].sales_revenue += (sRow.sales_revenue || 0); salesBySku[sSku].sales_cogs += (sRow.sales_cogs || 0);
            }

            var merged = [];
            for (var msku in sohBySku) {
                var inv = sohBySku[msku]; var sal = salesBySku[msku] || {};
                var costPrice = inv.cost_price || 0;
                if (costPrice === 0 && (sal.sales_cogs || 0) > 0 && (sal.sales_qty || 0) > 0) costPrice = round2(sal.sales_cogs / sal.sales_qty);
                var sellingPrice = inv.selling_price || 0;
                if (sellingPrice === 0 && (sal.sales_revenue || 0) > 0 && (sal.sales_qty || 0) > 0) sellingPrice = round2(sal.sales_revenue / sal.sales_qty);
                var stockValue = inv.stock_value || 0;
                if (stockValue === 0) stockValue = round2(inv.stock_qty * costPrice);
                merged.push({ sku: msku, name: inv.name, category: inv.category || 'Uncategorized', sub_category: inv.sub_category || '', supplier: inv.supplier || 'Unknown', location: inv.location || 'Default', country: '', warehouse_type: '', stock_qty: Math.round(inv.stock_qty), sales_qty: Math.round(sal.sales_qty || 0), purchase_qty: 0, sales_orders: Math.round(sal.sales_orders || 0), sales_returns: Math.round(sal.sales_returns || 0), sales_revenue: round2(sal.sales_revenue || 0), sales_cogs: round2(sal.sales_cogs || 0), cost_price: costPrice, selling_price: sellingPrice, stock_value: stockValue, last_sale_date: '', last_purchase_date: '', warehouse_count: inv.warehouse_count || 1 });
            }

            // Store in memory + IndexedDB (persists across refreshes)
            _cachedData = merged;
            _dataLoaded = true;
            saveData(merged);

            // Handle PO data
            var poUpdated = false;
            if (poRawData && Array.isArray(poRawData) && poRawData.length > 0) {
                _cachedPO = poRawData;
                _memoryPOData = poRawData;
                savePOData(poRawData);
                poUpdated = true;
            }

            var msg = 'Data updated successfully! ' + merged.length + ' SKUs processed.';
            if (poUpdated) msg += ' PO file updated.';
            return { success: true, message: msg, sku_count: merged.length };
        } catch (err) {
            return { error: 'Processing failed: ' + err.message };
        }
    }

    var _memoryPOData = null;

    // =========================================================================
    // IndexedDB persistence (handles large datasets, no size limit)
    // =========================================================================

    var DB_NAME = 'StockDashboard';
    var DB_VERSION = 1;
    var _dbReady = false;
    var _cachedData = null;
    var _cachedPO = null;
    var _dataLoaded = false;

    function openDB() {
        return new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    function saveData(rawData) {
        _cachedData = rawData;
        _dataLoaded = true;
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction('data', 'readwrite');
                var store = tx.objectStore('data');
                store.put(rawData, 'inventory');
                store.put(new Date().toISOString(), 'inventory_ts');
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        }).catch(function() {});
    }

    function loadDataFromDB() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction('data', 'readonly');
                var store = tx.objectStore('data');
                var req = store.get('inventory');
                req.onsuccess = function() {
                    var data = req.result || [];
                    _cachedData = data;
                    _dataLoaded = data.length > 0;
                    resolve(data);
                };
                req.onerror = function() { resolve([]); };
            });
        }).catch(function() { return []; });
    }

    function loadData() {
        if (_cachedData && _cachedData.length > 0) return _cachedData;
        if (_bundledData && _bundledData.length > 0) return _bundledData;
        return [];
    }

    function savePOData(poData) {
        _cachedPO = poData;
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction('data', 'readwrite');
                var store = tx.objectStore('data');
                store.put(poData, 'po');
                store.put(new Date().toISOString(), 'po_ts');
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e.target.error); };
            });
        }).catch(function() {});
    }

    function loadPODataFromStorage() {
        if (_cachedPO && _cachedPO.length > 0) return _cachedPO;
        if (_memoryPOData && _memoryPOData.length > 0) return _memoryPOData;
        return [];
    }

    function loadPOFromDB() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction('data', 'readonly');
                var store = tx.objectStore('data');
                var req = store.get('po');
                req.onsuccess = function() {
                    _cachedPO = req.result || [];
                    resolve(_cachedPO);
                };
                req.onerror = function() { resolve([]); };
            });
        }).catch(function() { return []; });
    }

    function clearData() {
        _cachedData = null;
        _cachedPO = null;
        _dataLoaded = false;
        _bundledData = null;
        _bundledLoaded = false;
        _memoryPOData = null;
        return openDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction('data', 'readwrite');
                tx.objectStore('data').clear();
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
            });
        }).catch(function() {});
    }

    var _bundledData = null;
    var _bundledLoading = false;
    var _bundledLoaded = false;

    function hasData() {
        return _dataLoaded || _bundledLoaded || (_cachedData && _cachedData.length > 0);
    }

    function initDB() {
        return loadDataFromDB().then(function(data) {
            if (data && data.length > 0) {
                _cachedData = data;
                _dataLoaded = true;
            }
            return loadPOFromDB();
        }).then(function(po) {
            if (po && po.length > 0) _cachedPO = po;
        }).catch(function() {});
    }

    function loadBundledData() {
        if (_bundledLoaded || _bundledLoading) return Promise.resolve();
        _bundledLoading = true;
        return fetch('data/inventory.json')
            .then(function(res) { return res.json(); })
            .then(function(arr) {
                if (!arr || arr.length < 2) return;
                var headers = arr[0];
                var rows = [];
                for (var i = 1; i < arr.length; i++) {
                    var obj = {};
                    for (var j = 0; j < headers.length; j++) {
                        obj[headers[j]] = arr[i][j];
                    }
                    rows.push(obj);
                }
                _bundledData = rows;
                _bundledLoaded = true;
                _bundledLoading = false;
            })
            .catch(function() { _bundledLoading = false; });
    }

    /**
     * Loads raw data from localStorage, normalizes/coerces it, and runs assessment.
     * This is the main entry point for all data views.
     */
    function loadAndAssess(analysisDays) {
        var rawData = loadData();
        if (!rawData || rawData.length === 0) return [];

        // The data from localStorage is stored as objects (already merged),
        // but date fields are stored as strings. Re-parse them.
        for (var i = 0; i < rawData.length; i++) {
            var r = rawData[i];

            // Coerce numeric fields
            for (var n = 0; n < NUMERIC_COLUMNS.length; n++) {
                var col = NUMERIC_COLUMNS[n];
                if (r[col] !== undefined && r[col] !== null) {
                    var num = parseFloat(r[col]);
                    r[col] = isNaN(num) ? 0 : num;
                } else {
                    if (col !== 'stock_value') {
                        r[col] = 0;
                    }
                }
            }

            // Coerce date fields
            for (var d = 0; d < DATE_COLUMNS.length; d++) {
                var dcol = DATE_COLUMNS[d];
                if (r[dcol] !== undefined && r[dcol] !== null && r[dcol] !== '') {
                    var dateVal = r[dcol];
                    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
                        // already a Date
                    } else {
                        var parsed = new Date(dateVal);
                        r[dcol] = isNaN(parsed.getTime()) ? null : parsed;
                    }
                } else {
                    r[dcol] = null;
                }
            }

            // Fill string defaults
            for (var skey in STRING_DEFAULTS) {
                if (!r[skey] || String(r[skey]).trim() === '') {
                    r[skey] = STRING_DEFAULTS[skey];
                } else {
                    r[skey] = String(r[skey]).trim();
                }
            }

            // Ensure SKU
            if (!r.sku || String(r.sku).trim() === '') {
                r.sku = 'UNKNOWN_' + i;
            } else {
                r.sku = String(r.sku).trim();
            }
        }

        return assessAll(rawData, analysisDays);
    }

    /**
     * Returns file info for the data status display.
     */
    function getFilesInfo() {
        var info = { data_files: [] };
        var ts = localStorage.getItem(CONFIG.STORAGE_KEY + '_ts');
        var data = loadData();

        if (data && data.length > 0) {
            info.data_files.push({
                name: 'RawData',
                rows: data.length,
                last_modified: ts || 'unknown'
            });
        }

        var poTs = localStorage.getItem(CONFIG.STORAGE_PO_KEY + '_ts');
        var poData = loadPODataFromStorage();
        if (poData && poData.length > 0) {
            info.data_files.push({
                name: 'PO',
                rows: poData.length,
                last_modified: poTs || 'unknown'
            });
        }

        return info;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    return {
        // Constants
        COLUMN_MAP: COLUMN_MAP,

        // Loader
        normalizeColumns: normalizeColumns,
        coerceRow: coerceRow,

        // Assessor
        assessSku: assessSku,
        assessAll: assessAll,

        // Aggregator
        aggregateOverview: aggregateOverview,
        aggregateBySupplier: aggregateBySupplier,
        aggregateByCategory: aggregateByCategory,
        aggregateByLocation: aggregateByLocation,
        getTopWorstSkus: getTopWorstSkus,

        // PO Assessment
        assessPO: assessPO,
        parsePOArray: parsePOArray,

        // Ordering
        getOrderRecommendations: getOrderRecommendations,

        // Filters
        applyFilters: applyFilters,

        // Data persistence
        saveData: saveData,
        loadData: loadData,
        savePOData: savePOData,
        loadPOData: function() {
            var raw = _memoryPOData || loadPODataFromStorage();
            if (!raw || raw.length === 0) return [];
            if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
                return parsePOArray(raw);
            }
            return parsePOObjects(raw);
        },
        clearData: clearData,
        hasData: hasData,
        loadBundledData: loadBundledData,
        initDB: initDB,

        // Processing
        processUploads: processUploads,
        processUploadsFromMemory: processUploadsFromMemory,
        loadAndAssess: loadAndAssess,
        getFilesInfo: getFilesInfo,

        // Helpers (exposed for use by api.js)
        round2: round2,
        formatDate: formatDate,
        daysBetween: daysBetween,
        pickColumns: pickColumns,
        normalizeUploadRow: normalizeUploadRow
    };

})();
