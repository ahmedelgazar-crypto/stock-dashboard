/**
 * Upload.gs — Data upload handling
 * Handles receiving parsed data as JSON and writing to sheets,
 * then consolidating uploaded data into the RawData sheet.
 */

/**
 * Handles file upload via POST.
 * Expects JSON body: { type: "soh"|"sales"|"po", data: [[...]] }
 * First row of data is headers.
 *
 * @param {Object} e - The doPost event object
 * @returns {Object} Result with success/error
 */
function handleUpload(e) {
  try {
    // Check authentication
    if (!isAuthenticated(e)) {
      return { error: 'Authentication required' };
    }

    var body;
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      return { error: 'No data provided' };
    }

    var fileType = (body.type || '').toLowerCase();
    var data = body.data;

    if (!fileType || !data || !Array.isArray(data) || data.length < 2) {
      return { error: 'Invalid upload. Provide type (soh/sales/po) and data (2D array with headers).' };
    }

    var validTypes = { soh: 'SOH_Upload', sales: 'Sales_Upload', po: 'PO_Upload' };
    var sheetName = validTypes[fileType];
    if (!sheetName) {
      return { error: 'Invalid file type. Must be: soh, sales, or po' };
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }

    // Write data
    if (data.length > 0 && data[0].length > 0) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }

    // Add timestamp note
    sheet.getRange('A1').setNote('Uploaded: ' + new Date().toISOString());

    return {
      success: true,
      type: fileType,
      rows: data.length - 1,
      columns: data[0].length,
      sheet: sheetName
    };
  } catch (err) {
    return { error: 'Upload failed: ' + err.message };
  }
}

/**
 * Consolidates uploaded data into the RawData and PO sheets.
 *
 * Process:
 *  1. Read SOH_Upload, Sales_Upload sheets
 *  2. Merge by SKU (aggregate SOH, merge sales)
 *  3. Write consolidated data to "RawData" sheet
 *  4. Copy PO_Upload to "PO" sheet
 *  5. Clear upload sheets
 *  6. Return { success, message, sku_count }
 */
function handleProcess() {
  try {
    var ss = getSpreadsheet();

    // ── Step 1: Read uploaded data ────────────────────────────────────────

    var sohSheet = ss.getSheetByName('SOH_Upload');
    var salesSheet = ss.getSheetByName('Sales_Upload');
    var poSheet = ss.getSheetByName('PO_Upload');

    if (!sohSheet || sohSheet.getLastRow() < 2) {
      return { error: 'SOH_Upload sheet is missing or empty' };
    }
    if (!salesSheet || salesSheet.getLastRow() < 2) {
      return { error: 'Sales_Upload sheet is missing or empty' };
    }

    var sohData = sheetToObjects(sohSheet);
    var salesData = sheetToObjects(salesSheet);

    // ── Step 2: Normalize SOH data ───────────────────────────────────────

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

    // ── Step 3: Normalize Sales data ─────────────────────────────────────

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

    // ── Step 4: Merge SOH + Sales ────────────────────────────────────────

    var merged = [];
    var outColumns = [
      'sku', 'name', 'category', 'sub_category', 'supplier', 'location',
      'country', 'warehouse_type', 'stock_qty', 'sales_qty', 'purchase_qty',
      'sales_orders', 'sales_returns', 'sales_revenue', 'sales_cogs',
      'cost_price', 'selling_price', 'stock_value',
      'last_sale_date', 'last_purchase_date', 'warehouse_count'
    ];

    for (var sku in sohBySku) {
      var inv = sohBySku[sku];
      var sal = salesBySku[sku] || {};

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

      var purchaseQty = 0; // No separate purchase file in this flow — PO sheet handles it

      var lastPurchaseDate = '';
      // No explicit purchase date; will be set if PO data exists

      merged.push({
        sku: sku,
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
        last_purchase_date: lastPurchaseDate,
        warehouse_count: inv.warehouse_count || 1
      });
    }

    // ── Step 5: Write to RawData sheet ───────────────────────────────────

    var rawSheet = ss.getSheetByName('RawData');
    if (!rawSheet) {
      rawSheet = ss.insertSheet('RawData');
    } else {
      rawSheet.clear();
    }

    if (merged.length > 0) {
      // Write headers
      var headers = outColumns;
      var outputData = [headers];

      for (var m = 0; m < merged.length; m++) {
        var r = merged[m];
        var rowArr = [];
        for (var c = 0; c < headers.length; c++) {
          rowArr.push(r[headers[c]] !== undefined ? r[headers[c]] : '');
        }
        outputData.push(rowArr);
      }

      rawSheet.getRange(1, 1, outputData.length, outputData[0].length).setValues(outputData);
      rawSheet.getRange('A1').setNote('Processed: ' + new Date().toISOString());
    }

    // ── Step 6: Copy PO_Upload to PO sheet ───────────────────────────────

    var poUpdated = false;
    if (poSheet && poSheet.getLastRow() >= 2) {
      var poValues = poSheet.getDataRange().getValues();
      var destPO = ss.getSheetByName('PO');
      if (!destPO) {
        destPO = ss.insertSheet('PO');
      } else {
        destPO.clear();
      }
      destPO.getRange(1, 1, poValues.length, poValues[0].length).setValues(poValues);
      destPO.getRange('A1').setNote('Updated: ' + new Date().toISOString());
      poUpdated = true;
    }

    // ── Step 7: Clear upload sheets ──────────────────────────────────────

    if (sohSheet) sohSheet.clear();
    if (salesSheet) salesSheet.clear();
    if (poSheet) poSheet.clear();

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

/**
 * Normalizes an uploaded row object based on data type.
 */
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
