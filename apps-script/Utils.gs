/**
 * Utils.gs — Helper functions
 * Shared utility functions used across all modules.
 */

/**
 * Rounds a number to the specified decimal places (default 2).
 *
 * @param {number} n - The number to round
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} The rounded number
 */
function round2(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  if (n === Infinity || n === -Infinity) return 9999;
  if (decimals === undefined) decimals = 2;
  var factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Formats a Date object as YYYY-MM-DD string.
 *
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string, or '' if invalid
 */
function formatDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var d = ('0' + date.getDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

/**
 * Calculates the number of whole days between two dates.
 *
 * @param {Date} date1 - Earlier date
 * @param {Date} date2 - Later date
 * @returns {number} Number of days (always positive)
 */
function daysBetween(date1, date2) {
  if (!date1 || !date2) return 0;
  if (!(date1 instanceof Date)) date1 = new Date(date1);
  if (!(date2 instanceof Date)) date2 = new Date(date2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
  var msPerDay = 86400000; // 24 * 60 * 60 * 1000
  return Math.round(Math.abs(date2.getTime() - date1.getTime()) / msPerDay);
}

/**
 * Applies filters to a data array based on query parameters.
 *
 * @param {Array} data - Array of row objects
 * @param {Object} params - Filter parameters { status, supplier, category, location, search }
 * @returns {Array} Filtered data
 */
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

/**
 * Converts a sheet (with header row) to an array of objects.
 * First row is used as keys.
 *
 * @param {Sheet} sheet - The Google Sheet object
 * @returns {Array} Array of objects
 */
function sheetToObjects(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];

  var result = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      if (key) {
        obj[key] = values[i][j];
      }
    }
    result.push(obj);
  }

  return result;
}

/**
 * Writes an array of objects to a sheet.
 * First row will be the keys (headers).
 *
 * @param {Sheet} sheet - The Google Sheet object
 * @param {Array} data - Array of objects to write
 * @param {Array} [columns] - Optional ordered list of column keys. If not provided, uses keys from first object.
 */
function objectsToSheet(sheet, data, columns) {
  if (!sheet || !data || data.length === 0) return;

  sheet.clear();

  // Determine columns
  var cols = columns;
  if (!cols) {
    cols = [];
    var seen = {};
    for (var i = 0; i < data.length; i++) {
      for (var key in data[i]) {
        if (!seen[key]) {
          cols.push(key);
          seen[key] = true;
        }
      }
    }
  }

  // Build output array
  var output = [cols]; // Header row
  for (var r = 0; r < data.length; r++) {
    var row = [];
    for (var c = 0; c < cols.length; c++) {
      var val = data[r][cols[c]];
      row.push(val !== undefined && val !== null ? val : '');
    }
    output.push(row);
  }

  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
}
