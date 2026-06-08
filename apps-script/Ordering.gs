/**
 * Ordering.gs — Order recommendations
 * Ported from Python app.py api_ordering
 */

/**
 * Generates order recommendations for each SKU.
 *
 * @param {Array} data - Assessed inventory data
 * @param {number} targetDays - Target days of stock (default 30)
 * @param {boolean} showAll - Whether to include "NOT NEEDED" items
 * @param {string} urgencyFilter - Filter by urgency level
 * @returns {Object} { data, total, summary, store_summary }
 */
function getOrderRecommendations(data, targetDays, showAll, urgencyFilter) {
  if (!data || data.length === 0) {
    return { data: [], summary: {}, store_summary: [], total: 0 };
  }

  if (!targetDays) targetDays = 30;

  // Calculate order fields for each row
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
    // Filter out NOT NEEDED unless showAll
    if (!showAll && item.urgency === 'NOT NEEDED') continue;
    // Filter by urgency if specified
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
  for (var loc in storeGroups) {
    var sg = storeGroups[loc];
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
