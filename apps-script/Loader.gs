/**
 * Loader.gs — Data loading and normalization
 * Reads the "RawData" sheet and normalizes column names.
 */

// ─── Column Map ──────────────────────────────────────────────────────────────

var COLUMN_MAP = {
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

// ─── Numeric and Date Columns ────────────────────────────────────────────────

var NUMERIC_COLUMNS = [
  'stock_qty', 'sales_qty', 'purchase_qty', 'cost_price', 'selling_price',
  'reorder_point', 'stock_value', 'warehouse_count',
  'sales_orders', 'sales_returns', 'sales_revenue', 'sales_cogs'
];

var DATE_COLUMNS = ['last_sale_date', 'last_purchase_date'];

var STRING_DEFAULTS = {
  name: 'Unknown',
  category: 'Uncategorized',
  supplier: 'Unknown',
  location: 'Default'
};

// ─── Data Loading ────────────────────────────────────────────────────────────

/**
 * Reads the "RawData" sheet and returns an array of normalized objects.
 */
function loadRawData() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('RawData');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  var range = sheet.getRange(1, 1, lastRow, lastCol);
  var values = range.getValues();

  var rawHeaders = values[0];
  var headers = normalizeColumns(rawHeaders);

  var data = [];
  for (var i = 1; i < values.length; i++) {
    var row = coerceRow(values[i], headers);
    if (row) {
      data.push(row);
    }
  }

  return data;
}

/**
 * Maps raw header names to canonical names using COLUMN_MAP.
 * Returns an array of {index, canonical} for each matched column.
 */
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

/**
 * Converts a raw row (array of values) into a normalized object.
 */
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
    return null; // Skip rows without SKU
  }
  obj.sku = String(obj.sku).trim();

  return obj;
}
