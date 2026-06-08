const ExportManager = {
    _on(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    },

    init() {
        this._on('btn-export-csv', async () => {
            try {
                const params = FilterState.getParams();
                const data = await API.get('skus', params);
                const rows = data.data || [];
                if (rows.length === 0) { alert('No data to export'); return; }
                this._downloadCSV(rows, 'stock_assessment.csv');
            } catch (e) {
                console.error('CSV export failed:', e);
                alert('Export failed: ' + e.message);
            }
        });

        this._on('btn-export-xlsx', async () => {
            try {
                const params = FilterState.getParams();
                const data = await API.get('skus', params);
                const rows = data.data || [];
                if (rows.length === 0) { alert('No data to export'); return; }
                this._downloadXLSX(rows, 'stock_assessment.xlsx', 'Stock Assessment');
            } catch (e) {
                console.error('Excel export failed:', e);
                alert('Export failed: ' + e.message);
            }
        });

        this._on('btn-export-ordering', async () => {
            try {
                const data = await API.get('ordering', FilterState.getParams());
                const rows = data.data || [];
                if (rows.length === 0) { alert('No data to export'); return; }
                this._downloadXLSX(rows, 'Order_Recommendations.xlsx', 'Orders');
            } catch (e) {
                console.error('Ordering export failed:', e);
                alert('Export failed: ' + e.message);
            }
        });

        this._on('btn-export-po', async () => {
            try {
                const data = await API.get('po-assessment', {});
                const rows = data.data || [];
                if (rows.length === 0) { alert('No data to export'); return; }
                this._downloadXLSX(rows, 'PO_Assessment.xlsx', 'PO Assessment');
            } catch (e) {
                console.error('PO export failed:', e);
                alert('Export failed: ' + e.message);
            }
        });

        this._on('btn-copy-po', () => {
            const table = document.querySelector('#tbl-po-assessment table');
            if (!table) return;
            const rows = [];
            table.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('th, td').forEach(td => cells.push(td.innerText.trim()));
                rows.push(cells.join('\t'));
            });
            navigator.clipboard.writeText(rows.join('\n')).then(() => {
                const btn = document.getElementById('btn-copy-po');
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = orig, 2000);
            });
        });
    },

    _downloadCSV(data, filename) {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        data.forEach(row => {
            const values = headers.map(h => {
                let val = row[h] != null ? String(row[h]) : '';
                // Escape double quotes and wrap in quotes if contains comma, quote, or newline
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csvRows.push(values.join(','));
        });
        const csvString = csvRows.join('\n');
        const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' });
        this._downloadBlob(blob, filename);
    },

    _downloadXLSX(data, filename, sheetName) {
        if (!data || data.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');

        // Auto-width columns
        const headers = Object.keys(data[0]);
        ws['!cols'] = headers.map(h => {
            let maxLen = h.length;
            data.forEach(row => {
                const val = row[h] != null ? String(row[h]) : '';
                if (val.length > maxLen) maxLen = val.length;
            });
            return { wch: Math.min(maxLen + 2, 40) };
        });

        XLSX.writeFile(wb, filename);
    },

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
