const FilterState = {
    status: '',
    supplier: '',
    category: '',
    location: '',
    period: 90,
    search: '',
    _listeners: [],

    onChange(fn) { this._listeners.push(fn); },

    getParams() {
        return {
            status: this.status,
            supplier: this.supplier,
            category: this.category,
            location: this.location,
            period: this.period,
            search: this.search,
        };
    },

    _notify() {
        this._listeners.forEach(fn => fn(this.getParams()));
    },

    async init() {
        try {
            const data = await API.get('filters');
            this._populateSelect('filter-status', data.statuses);
            this._populateSelect('filter-supplier', data.suppliers);
            this._populateSelect('filter-category', data.categories);
            this._populateSelect('filter-location', data.locations);
        } catch (e) {
            console.error('Failed to load filters:', e);
        }

        document.getElementById('filter-status').addEventListener('change', (e) => {
            this.status = e.target.value;
            this._notify();
        });
        document.getElementById('filter-supplier').addEventListener('change', (e) => {
            this.supplier = e.target.value;
            this._notify();
        });
        document.getElementById('filter-category').addEventListener('change', (e) => {
            this.category = e.target.value;
            this._notify();
        });
        document.getElementById('filter-location').addEventListener('change', (e) => {
            this.location = e.target.value;
            this._notify();
        });
        document.getElementById('filter-period').addEventListener('change', (e) => {
            this.period = parseInt(e.target.value);
            this._notify();
        });

        let searchTimer;
        document.getElementById('filter-search').addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.search = e.target.value;
                this._notify();
            }, 300);
        });
    },

    _populateSelect(id, options) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const current = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            sel.appendChild(o);
        });
        if (current) sel.value = current;
    },

    reset() {
        this.status = '';
        this.supplier = '';
        this.category = '';
        this.location = '';
        this.period = 90;
        this.search = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-supplier').value = '';
        document.getElementById('filter-category').value = '';
        document.getElementById('filter-location').value = '';
        document.getElementById('filter-period').value = '90';
        document.getElementById('filter-search').value = '';
        this._notify();
    }
};
