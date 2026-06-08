/**
 * Code.gs — Main entry point for Stock Efficiency Dashboard
 * Handles doGet/doPost routing, helper functions, and CORS.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

var DEFAULT_ANALYSIS_DAYS = 90;
var ANALYSIS_PERIOD_OPTIONS = [30, 60, 90, 180];

// ─── Web App Entry Points ────────────────────────────────────────────────────

function doGet(e) {
  try {
    var params = getParams(e);
    var action = params.action || 'overview';
    var period = getPeriod(params);
    var result;

    switch (action) {
      case 'overview':
        result = handleOverview(period, params);
        break;
      case 'skus':
        result = handleSkus(period, params);
        break;
      case 'suppliers':
        result = handleSuppliers(period, params);
        break;
      case 'categories':
        result = handleCategories(period, params);
        break;
      case 'new-purchases':
        result = handleNewPurchases(period, params);
        break;
      case 'locations':
        result = handleLocations(period, params);
        break;
      case 'po-assessment':
        result = handlePOAssessmentGet(period, params);
        break;
      case 'ordering':
        result = handleOrdering(period, params);
        break;
      case 'filters':
        result = handleFilters(period, params);
        break;
      case 'files':
        result = handleFiles();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

function doPost(e) {
  try {
    var params = getParams(e);
    var action = params.action || '';
    var result;

    switch (action) {
      case 'upload':
        result = handleUpload(e);
        break;
      case 'process':
        result = handleProcess();
        break;
      case 'login':
        result = handleLogin(e);
        break;
      case 'logout':
        result = handleLogout(e);
        break;
      default:
        result = { error: 'Unknown POST action: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  }
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

function handleOverview(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);
  var overview = aggregateOverview(data);
  overview.top_worst = getTopWorstSkus(data, 10);
  overview.files = getFilesInfo();
  return overview;
}

function handleSkus(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);

  var sortBy = params.sort || 'severity';
  var order = params.order || 'desc';
  data = sortData(data, sortBy, order);

  var cols = [
    'sku', 'name', 'category', 'sub_category', 'supplier', 'location',
    'assessment', 'severity', 'stock_qty', 'sales_qty', 'purchase_qty',
    'cost_price', 'selling_price', 'stock_value', 'potential_revenue',
    'dead_stock_value', 'days_of_stock', 'turnover_ratio', 'avg_daily_sales',
    'days_since_last_sale', 'days_since_last_purchase',
    'is_new_sku', 'recently_purchased'
  ];
  var records = pickColumns(data, cols);
  return { data: records, total: records.length };
}

function handleSuppliers(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);
  return aggregateBySupplier(data);
}

function handleCategories(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);
  return aggregateByCategory(data);
}

function handleNewPurchases(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);

  var newSkus = [];
  var recentlyPurchased = [];
  var cols = [
    'sku', 'name', 'category', 'supplier', 'location', 'assessment',
    'stock_qty', 'sales_qty', 'purchase_qty', 'stock_value',
    'days_since_last_purchase', 'is_new_sku', 'recently_purchased'
  ];

  for (var i = 0; i < data.length; i++) {
    if (data[i].is_new_sku) {
      newSkus.push(pickColumnsRow(data[i], cols));
    }
    if (data[i].recently_purchased) {
      recentlyPurchased.push(pickColumnsRow(data[i], cols));
    }
  }

  return {
    new_skus: newSkus,
    recently_purchased: recentlyPurchased,
    new_count: newSkus.length,
    recent_count: recentlyPurchased.length
  };
}

function handleLocations(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);
  return aggregateByLocation(data);
}

function handlePOAssessmentGet(period, params) {
  var invData = loadAndAssess(period);
  var poData = loadPOData();
  if (!poData || poData.length === 0) {
    return { error: 'PO data not found', data: [], summary: {} };
  }
  return assessPO(poData, invData);
}

function handleOrdering(period, params) {
  var data = loadAndAssess(period);
  data = applyFilters(data, params);
  var targetDays = parseInt(params.target_days || '30', 10);
  var showAll = (params.show_all || 'false').toLowerCase() === 'true';
  var urgencyFilter = params.urgency || '';
  return getOrderRecommendations(data, targetDays, showAll, urgencyFilter);
}

function handleFilters(period, params) {
  var data = loadAndAssess(period);
  if (!data || data.length === 0) {
    return { statuses: [], suppliers: [], categories: [], locations: [], periods: ANALYSIS_PERIOD_OPTIONS };
  }

  var statuses = {};
  var suppliers = {};
  var categories = {};
  var locations = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i].assessment) statuses[data[i].assessment] = true;
    if (data[i].supplier) suppliers[data[i].supplier] = true;
    if (data[i].category) categories[data[i].category] = true;
    if (data[i].location) locations[data[i].location] = true;
  }

  return {
    statuses: Object.keys(statuses).sort(),
    suppliers: Object.keys(suppliers).sort(),
    categories: Object.keys(categories).sort(),
    locations: Object.keys(locations).sort(),
    periods: ANALYSIS_PERIOD_OPTIONS
  };
}

function handleFiles() {
  return getFilesInfo();
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Opens the spreadsheet using stored ID.
 */
function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID not set in Script Properties');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Extracts query parameters from the event object.
 */
function getParams(e) {
  if (!e) return {};
  var params = {};
  if (e.parameter) {
    for (var key in e.parameter) {
      params[key] = e.parameter[key];
    }
  }
  return params;
}

/**
 * Returns a JSON ContentService response.
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Gets the analysis period from params, validated against allowed options.
 */
function getPeriod(params) {
  var p = parseInt(params.period || String(DEFAULT_ANALYSIS_DAYS), 10);
  if (isNaN(p) || ANALYSIS_PERIOD_OPTIONS.indexOf(p) === -1) {
    return DEFAULT_ANALYSIS_DAYS;
  }
  return p;
}

/**
 * Loads raw data, runs assessment, and returns assessed array.
 */
function loadAndAssess(analysisDays) {
  var rawData = loadRawData();
  if (!rawData || rawData.length === 0) return [];
  return assessAll(rawData, analysisDays);
}

/**
 * Sorts data array by a given field.
 */
function sortData(data, sortBy, order) {
  if (!data || data.length === 0) return data;
  var asc = (order === 'asc');
  data.sort(function(a, b) {
    var va = a[sortBy];
    var vb = b[sortBy];
    if (va === undefined || va === null) va = asc ? Infinity : -Infinity;
    if (vb === undefined || vb === null) vb = asc ? Infinity : -Infinity;
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
  return data;
}

/**
 * Picks specified columns from each row in data array.
 */
function pickColumns(data, cols) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    result.push(pickColumnsRow(data[i], cols));
  }
  return result;
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

/**
 * Returns info about the data sheets.
 */
function getFilesInfo() {
  try {
    var ss = getSpreadsheet();
    var rawSheet = ss.getSheetByName('RawData');
    var poSheet = ss.getSheetByName('PO');
    var info = { data_files: [] };

    if (rawSheet) {
      info.data_files.push({
        name: 'RawData',
        rows: rawSheet.getLastRow() - 1,
        last_modified: rawSheet.getRange('A1').getNote() || 'unknown'
      });
    }
    if (poSheet) {
      info.data_files.push({
        name: 'PO',
        rows: poSheet.getLastRow() - 1,
        last_modified: poSheet.getRange('A1').getNote() || 'unknown'
      });
    }
    return info;
  } catch (err) {
    return { data_files: [], error: err.message };
  }
}
