const UploadManager = {
    authenticated: false,
    username: '',
    files: { soh: null, sales: null, po: null },
    dataTypes: ['soh', 'sales'],
    allTypes: ['soh', 'sales', 'po'],

    async init() {
        // Local mode: always authenticated, no server check needed
        this.authenticated = true;
        this.username = 'local';
        this.files = { soh: null, sales: null, po: null };

        this._bindEvents();
        this._updateUI();
    },

    _bindEvents() {
        const loginBtn = document.getElementById('btn-upload-login');
        const logoutBtn = document.getElementById('btn-upload-logout');
        const processBtn = document.getElementById('btn-process-data');
        const passField = document.getElementById('upload-password');

        if (loginBtn._bound) return;
        loginBtn._bound = true;

        loginBtn.addEventListener('click', () => this.login());
        logoutBtn.addEventListener('click', () => this.logout());
        processBtn.addEventListener('click', () => this.processFiles());
        if (passField) {
            passField.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.login(); });
        }

        this.allTypes.forEach(type => {
            const dropzone = document.getElementById('dropzone-' + type);
            const fileInput = document.getElementById('file-' + type);

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                if (e.dataTransfer.files.length) this.uploadFile(type, e.dataTransfer.files[0]);
            });
            dropzone.addEventListener('click', (e) => {
                if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') fileInput.click();
            });
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length) this.uploadFile(type, fileInput.files[0]);
                fileInput.value = '';
            });
        });
    },

    async login() {
        // Local mode: auto-succeed
        this.authenticated = true;
        this.username = 'local';
        this.files = { soh: null, sales: null, po: null };
        this._updateUI();
    },

    async logout() {
        // Local mode: just reset UI state
        this.authenticated = true;  // Stay authenticated in local mode
        this.username = 'local';
        this.files = { soh: null, sales: null, po: null };
        this._updateUI();
    },

    async uploadFile(type, file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
            this._setCardError(type, 'File must be .xlsx, .xls, or .csv');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            this._setCardError(type, 'File too large (max 50MB)');
            return;
        }

        const card = document.getElementById('upload-card-' + type);
        card.className = 'upload-card uploading';
        this._setCardStatus(type, 'Parsing file...');

        try {
            // Parse file in browser using SheetJS
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            this._setCardStatus(type, `Storing ${jsonData.length} rows...`);

            const res = await API.post('upload', { type: type, data: jsonData });

            const sizeKb = Math.round(file.size / 1024);
            this.files[type] = { uploaded: true, filename: file.name, size_kb: sizeKb, rows: jsonData.length };
            card.className = 'upload-card uploaded';
            this._setCardStatus(type, `${file.name} (${sizeKb} KB, ${jsonData.length} rows)`, true);
            this._updateProcessButton();
        } catch (e) {
            card.className = 'upload-card error';
            this._setCardError(type, e.message);
        }
    },

    async processFiles() {
        const btn = document.getElementById('btn-process-data');
        const statusEl = document.getElementById('process-status');
        btn.disabled = true;
        btn.textContent = 'Processing...';
        statusEl.textContent = 'Consolidating data files...';
        statusEl.className = 'upload-process-status processing';

        try {
            const res = await API.post('process');
            statusEl.textContent = res.message || 'Data processed successfully!';
            statusEl.className = 'upload-process-status success';
            btn.textContent = 'Done!';
            this.files = { soh: null, sales: null, po: null };

            setTimeout(() => {
                this.allTypes.forEach(type => {
                    document.getElementById('upload-card-' + type).className = 'upload-card';
                    this._setCardStatus(type, '');
                });
                btn.textContent = 'Process & Update Dashboard';
                this._updateProcessButton();
                statusEl.textContent = '';
                statusEl.className = 'upload-process-status';
                App.switchPage('overview');
            }, 2000);
        } catch (e) {
            statusEl.textContent = e.message;
            statusEl.className = 'upload-process-status error';
            btn.textContent = 'Process & Update Dashboard';
            btn.disabled = false;
        }
    },

    _updateUI() {
        const loginEl = document.getElementById('upload-login');
        const interfaceEl = document.getElementById('upload-interface');

        // Local mode: always show upload interface, hide login
        loginEl.style.display = 'none';
        interfaceEl.style.display = 'block';
        document.getElementById('upload-user-info').textContent = 'Local Mode';

        this.allTypes.forEach(type => {
            const card = document.getElementById('upload-card-' + type);
            if (this.files[type]) {
                card.className = 'upload-card uploaded';
                const info = this.files[type];
                const label = info.rows
                    ? `${info.filename} (${info.size_kb} KB, ${info.rows} rows)`
                    : `${info.filename} (${info.size_kb} KB)`;
                this._setCardStatus(type, label, true);
            } else {
                card.className = 'upload-card';
                this._setCardStatus(type, '');
            }
        });
        this._updateProcessButton();
    },

    _updateProcessButton() {
        const btn = document.getElementById('btn-process-data');
        // Only require SOH and Sales (PO is optional)
        const ready = this.dataTypes.every(t => this.files[t]);
        btn.disabled = !ready;
    },

    _setCardStatus(type, text, showCheck) {
        const el = document.getElementById('status-' + type);
        if (text && showCheck) {
            el.innerHTML = text;
        } else {
            el.textContent = text;
        }
        el.className = 'upload-file-status' + (text ? ' has-file' : '');
    },

    _setCardError(type, text) {
        const el = document.getElementById('status-' + type);
        el.textContent = text;
        el.className = 'upload-file-status upload-error';
    },
};
