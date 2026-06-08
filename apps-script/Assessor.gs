/**
 * Assessor.gs — SKU assessment engine
 * Ported exactly from Python assessor.py
 */

/**
 * Assesses a single SKU and returns [assessment, severity].
 *
 * Status logic (in priority order):
 *  1. INACTIVE (0)                                — stock=0, sales=0, purchases=0
 *  2. CRITICAL - No Sales, Still Purchasing (10)  — sales=0, purchases>0, purchased recently (<=30 days)
 *  3. CRITICAL - Dead Stock (9)                   — stock>0, sales=0
 *  4. STOCKOUT - Selling but No Stock (8)         — stock=0, sales>0
 *  5. NEW/PIPELINE - Purchased, Awaiting Stock (1)— purchases>0, stock=0, sales=0, purchased recently
 *  6. LOW STOCK - May Stockout Soon (7)           — stock < avg_daily_sales * 14
 *  7. HIGH RISK - Overstocked & Over-Purchasing (5)
 *  8. HIGH RISK - Overstocked (4)                 — stock > avg_daily_sales * 90
 *  9. WARNING - Over-Purchasing (6)               — purchases > 2*sales
 * 10. HEALTHY - Good Turnover (0)                 — turnover_ratio > 2
 * 11. MEDIUM - Adequate Stock (2)                 — default
 */
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

/**
 * Applies assessment to all rows and adds calculated fields.
 * Returns the enriched data array.
 */
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

    // is_new_sku — no historical tracking in sheets version
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
