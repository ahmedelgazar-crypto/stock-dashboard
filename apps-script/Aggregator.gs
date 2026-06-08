/**
 * Aggregator.gs — Group analytics
 * Ported from Python aggregator.py
 */

var AT_RISK_STATUSES = [
  'CRITICAL - Dead Stock',
  'CRITICAL - No Sales, Still Purchasing',
  'HIGH RISK - Overstocked',
  'HIGH RISK - Overstocked & Over-Purchasing'
];

/**
 * Returns overview metrics for the entire dataset.
 */
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

/**
 * Builds status summary (grouped by assessment status).
 */
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

/**
 * Aggregates data by supplier.
 */
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

/**
 * Aggregates data by category.
 */
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

/**
 * Aggregates data by location.
 */
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

/**
 * Returns the top N worst-performing SKUs by severity.
 */
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
