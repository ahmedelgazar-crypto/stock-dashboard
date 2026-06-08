/**
 * POAssessment.gs — PO assessment engine
 * Ported from Python app.py _compute_po_assessment
 */

/**
 * PO Column mapping rules (same logic as Python _map_po_columns).
 */
var PO_COLUMN_RULES = [
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

/**
 * Reads the "PO" sheet and returns an array of objects.
 */
function loadPOData() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('PO');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rawHeaders = values[0];

  // Map PO columns
  var colMap = mapPOColumns(rawHeaders);

  var data = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
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
 * Maps raw PO headers to canonical names.
 * Returns { key: columnIndex }
 */
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

/**
 * Merges PO data with inventory data and computes assessments.
 * Returns { data: [...], summary: {APPROVED, REVIEW, REJECTED}, total }
 */
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
    var inv = invMap[sku] || null;
    var hasInv = !!inv;

    // Get inventory values
    var stockQty = hasInv ? (parseFloat(inv.stock_qty) || 0) : 0;
    var salesQty = hasInv ? (parseFloat(inv.sales_qty) || 0) : 0;
    var purchaseQty = hasInv ? (parseFloat(inv.purchase_qty) || 0) : 0;
    var stockValue = hasInv ? (parseFloat(inv.stock_value) || 0) : 0;
    var daysOfStock = hasInv ? (parseFloat(inv.days_of_stock) || 0) : 0;
    var avgDailySales = hasInv ? (parseFloat(inv.avg_daily_sales) || 0) : 0;
    var turnoverRatio = hasInv ? (parseFloat(inv.turnover_ratio) || 0) : 0;
    var assessment = hasInv ? (inv.assessment || '') : '';
    var category = hasInv ? (inv.category || '') : '';
    var supplier = hasInv ? (inv.supplier || '') : '';

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
      // NEW SKU
      recommendation = 'REVIEW';
      reason = 'New SKU — not in inventory. PO requests ' + formatInt(poQty) + ' units. Verify demand before proceeding.';
    } else if (!hasDemand) {
      // NO SALES
      recommendation = 'REJECTED';
      reason = 'No sales history. Holding ' + formatInt(Math.round(stockQty)) +
        ' units (value ' + formatNum(stockValue) + '). PO of ' +
        formatInt(poQty) + ' would add to unsold inventory.';
    } else if (totalDaysAfterPO <= 45) {
      // APPROVED
      recommendation = 'APPROVED';
      reason = 'After PO, total coverage is ' + formatNum(totalDaysAfterPO) + ' days (' +
        formatInt(Math.round(stockQty)) + ' on hand + ' + formatInt(poQty) + ' PO = ' +
        formatInt(Math.round(stockQty + poQty)) + ' units at ' + avgDailySales.toFixed(1) +
        '/day). Within 45-day target.';
    } else if (totalDaysAfterPO <= 60) {
      // REVIEW
      recommendation = 'REVIEW';
      reason = 'After PO, total coverage is ' + formatNum(totalDaysAfterPO) + ' days (' +
        formatInt(Math.round(stockQty)) + ' on hand + ' + formatInt(poQty) + ' PO = ' +
        formatInt(Math.round(stockQty + poQty)) + ' units at ' + avgDailySales.toFixed(1) +
        '/day). Exceeds 45 days — review if ' + formatInt(poQty) + ' units is justified. Suggested 30-day qty: ' +
        formatInt(suggestedQty) + '.';
    } else {
      // REJECTED
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

/**
 * Formats an integer with comma separators.
 */
function formatInt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats a number with comma separators (no decimals).
 */
function formatNum(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
