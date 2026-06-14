const App = {
    webhookId: null,
    responseTimes: [],
    repeatInterval: null,
    history: JSON.parse(localStorage.getItem('webhook_history') || '[]'),
    templates: JSON.parse(localStorage.getItem('webhook_templates') || '[]'),

    init() {
        this.bindEvents();
        this.renderHistory();
        this.renderTemplates();
        this.loadState();
    },

    bindEvents() {
        document.getElementById('generateUrlBtn').addEventListener('click', () => this.generateUrl());
        document.getElementById('copyUrlBtn').addEventListener('click', () => this.copyUrl());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendRequest());
        document.getElementById('formatJsonBtn').addEventListener('click', () => this.formatJson());
        document.getElementById('exportCurlBtn').addEventListener('click', () => this.exportCurl());
        document.getElementById('importCurlBtn').addEventListener('click', () => this.showModal('curlModal'));
        document.getElementById('parseCurlBtn').addEventListener('click', () => this.parseCurl());
        document.getElementById('saveTemplateBtn').addEventListener('click', () => this.showModal('templateModal'));
        document.getElementById('confirmSaveTemplateBtn').addEventListener('click', () => this.saveTemplate());
        document.getElementById('addHeaderBtn').addEventListener('click', () => this.addKvRow('headersEditor'));
        document.getElementById('addParamBtn').addEventListener('click', () => this.addKvRow('paramsEditor'));
        document.getElementById('autoRepeatToggle').addEventListener('change', (e) => this.toggleRepeatOptions(e.target.checked));
        document.getElementById('startRepeatBtn').addEventListener('click', () => this.startRepeat());
        document.getElementById('stopRepeatBtn').addEventListener('click', () => this.stopRepeat());
        document.getElementById('exportHistoryBtn').addEventListener('click', () => this.exportHistory());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabs = e.target.closest('.tabs');
                const container = tabs.parentElement;
                tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                container.querySelector(`#${btn.dataset.panel}-panel`).classList.add('active');
            });
        });

        document.querySelectorAll('.kv-remove').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.kv-row').remove());
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.modal').style.display = 'none');
        });

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => overlay.closest('.modal').style.display = 'none');
        });
    },

    generateUrl() {
        this.webhookId = this.generateId();
        const url = `https://webhook-tester.pages.dev/hooks/${this.webhookId}`;
        document.getElementById('webhookUrl').textContent = url;
        localStorage.setItem('webhook_id', this.webhookId);
    },

    generateId() {
        return 'wh_' + Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    },

    copyUrl() {
        const url = document.getElementById('webhookUrl').textContent;
        if (url.includes('hooks/')) {
            navigator.clipboard.writeText(url);
            const btn = document.getElementById('copyUrlBtn');
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = '📋', 2000);
        }
    },

    async sendRequest() {
        const method = document.getElementById('httpMethod').value;
        const url = document.getElementById('requestUrl').value;
        const body = document.getElementById('requestBody').value;

        const btn = document.getElementById('sendBtn');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        btn.disabled = true;

        const startTime = performance.now();

        try {
            const options = { method, headers: {} };

            const headers = this.getKvPairs('headersEditor');
            headers.forEach(h => { if (h.key) options.headers[h.key] = h.value; });

            const params = this.getKvPairs('paramsEditor');
            if (params.length > 0) {
                const separator = url.includes('?') ? '&' : '?';
                const queryString = params.filter(p => p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
                if (queryString) options.url = url + separator + queryString;
            }

            if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
                options.body = body;
                if (!options.headers['Content-Type']) {
                    options.headers['Content-Type'] = 'application/json';
                }
            }

            const response = await fetch(options.url || url, options);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            const responseText = await response.text();
            let responseHeaders = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            this.displayResponse({
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseText,
                time: duration,
                size: new Blob([responseText]).size
            });

            this.addToHistory({
                method,
                url: options.url || url,
                headers,
                body,
                status: response.status,
                statusText: response.statusText,
                responseHeaders,
                responseText,
                time: duration,
                timestamp: new Date().toISOString()
            });

            this.responseTimes.push(duration);
            if (this.responseTimes.length > 50) this.responseTimes.shift();
            this.updateChart();
        } catch (error) {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            this.displayResponse({
                status: 0,
                statusText: 'Error',
                headers: {},
                body: error.message,
                time: duration,
                size: error.message.length,
                error: true
            });

            this.addToHistory({
                method,
                url,
                headers: this.getKvPairs('headersEditor'),
                body,
                status: 0,
                statusText: 'Error',
                responseHeaders: {},
                responseText: error.message,
                time: duration,
                timestamp: new Date().toISOString()
            });
        }

        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        btn.disabled = false;
    },

    displayResponse(data) {
        const section = document.getElementById('responseSection');
        section.style.display = 'block';

        const statusBadge = document.getElementById('responseStatus');
        statusBadge.textContent = `${data.status} ${data.statusText}`;
        statusBadge.className = 'status-badge' + (data.error || data.status >= 400 ? ' error' : '');

        document.getElementById('responseTime').textContent = `${data.time}ms`;
        document.getElementById('responseSize').textContent = this.formatSize(data.size);

        let formattedBody = data.body;
        try {
            formattedBody = JSON.stringify(JSON.parse(data.body), null, 2);
        } catch {}
        document.getElementById('responseBody').textContent = formattedBody;

        const headersDiv = document.getElementById('responseHeaders');
        headersDiv.innerHTML = Object.entries(data.headers)
            .map(([key, value]) => `<div class="response-header-item"><span class="header-name">${this.escapeHtml(key)}</span><span class="header-value">${this.escapeHtml(value)}</span></div>`)
            .join('');

        document.getElementById('compareRequest').textContent = `${document.getElementById('httpMethod').value} ${document.getElementById('requestUrl').value}\n\n${document.getElementById('requestBody').value}`;
        document.getElementById('compareResponse').textContent = formattedBody;

        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    updateChart() {
        const canvas = document.getElementById('responseChart');
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 200;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);

        if (this.responseTimes.length < 2) return;

        const max = Math.max(...this.responseTimes) * 1.2 || 100;
        const padding = 40;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;

        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (graphHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        const points = this.responseTimes.map((t, i) => ({
            x: padding + (graphWidth / (this.responseTimes.length - 1)) * i,
            y: padding + graphHeight - (t / max) * graphHeight
        }));

        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

        ctx.lineTo(points[points.length - 1].x, height - padding);
        ctx.lineTo(points[0].x, height - padding);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        const stats = document.getElementById('chartStats');
        const avg = Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length);
        const min = Math.min(...this.responseTimes);
        const maxTime = Math.max(...this.responseTimes);
        stats.innerHTML = `
            <div class="chart-stat">Avg: <span class="chart-stat-value">${avg}ms</span></div>
            <div class="chart-stat">Min: <span class="chart-stat-value">${min}ms</span></div>
            <div class="chart-stat">Max: <span class="chart-stat-value">${maxTime}ms</span></div>
            <div class="chart-stat">Samples: <span class="chart-stat-value">${this.responseTimes.length}</span></div>
        `;
    },

    getKvPairs(editorId) {
        const rows = document.querySelectorAll(`#${editorId} .kv-row`);
        return Array.from(rows).map(row => ({
            key: row.querySelector('.kv-key').value,
            value: row.querySelector('.kv-value').value
        })).filter(p => p.key);
    },

    addKvRow(editorId) {
        const editor = document.getElementById(editorId);
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.innerHTML = `
            <input type="text" class="input kv-key" placeholder="Key">
            <input type="text" class="input kv-value" placeholder="Value">
            <button class="btn btn-icon btn-sm kv-remove">✕</button>
        `;
        row.querySelector('.kv-remove').addEventListener('click', () => row.remove());
        editor.appendChild(row);
    },

    formatJson() {
        const textarea = document.getElementById('requestBody');
        try {
            const parsed = JSON.parse(textarea.value);
            textarea.value = JSON.stringify(parsed, null, 2);
        } catch (e) {
            alert('Invalid JSON: ' + e.message);
        }
    },

    exportCurl() {
        const method = document.getElementById('httpMethod').value;
        const url = document.getElementById('requestUrl').value;
        const body = document.getElementById('requestBody').value;
        const headers = this.getKvPairs('headersEditor');

        let curl = `curl -X ${method} '${url}'`;
        headers.forEach(h => { if (h.key) curl += ` \\\n  -H '${h.key}: ${h.value}'`; });
        if (body) curl += ` \\\n  -d '${body.replace(/'/g, "'\\''")}'`;

        navigator.clipboard.writeText(curl);
        alert('cURL command copied to clipboard!');
    },

    parseCurl() {
        const input = document.getElementById('curlInput').value.trim();
        if (!input) return;

        try {
            const methodMatch = input.match(/-X\s+(\w+)/);
            const urlMatch = input.match(/(?:curl\s+)?'([^']+)'|"([^"]+)"/);
            const headerMatches = [...input.matchAll(/-H\s+'([^:]+):\s*([^']+)'|-H\s+"([^:]+):\s*([^"]+)"/g)];
            const dataMatch = input.match(/-d\s+'([\s\S]*?)'-d\s+"([\s\S]*?)"/);

            if (urlMatch) {
                document.getElementById('requestUrl').value = urlMatch[1] || urlMatch[2];
            }
            if (methodMatch) {
                document.getElementById('httpMethod').value = methodMatch[1];
            }
            if (headerMatches.length > 0) {
                const editor = document.getElementById('headersEditor');
                editor.innerHTML = '';
                headerMatches.forEach(m => {
                    const key = m[1] || m[3];
                    const value = m[2] || m[4];
                    this.addKvRowWithValue('headersEditor', key, value);
                });
            }
            if (dataMatch) {
                document.getElementById('requestBody').value = dataMatch[1] || dataMatch[2];
            }

            document.getElementById('curlModal').style.display = 'none';
        } catch (e) {
            alert('Failed to parse cURL command');
        }
    },

    addKvRowWithValue(editorId, key, value) {
        const editor = document.getElementById(editorId);
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.innerHTML = `
            <input type="text" class="input kv-key" placeholder="Key" value="${this.escapeHtml(key)}">
            <input type="text" class="input kv-value" placeholder="Value" value="${this.escapeHtml(value)}">
            <button class="btn btn-icon btn-sm kv-remove">✕</button>
        `;
        row.querySelector('.kv-remove').addEventListener('click', () => row.remove());
        editor.appendChild(row);
    },

    addToHistory(entry) {
        this.history.unshift(entry);
        if (this.history.length > 100) this.history.pop();
        localStorage.setItem('webhook_history', JSON.stringify(this.history));
        this.renderHistory();
    },

    renderHistory() {
        const list = document.getElementById('historyList');
        if (this.history.length === 0) {
            list.innerHTML = '<p class="empty-state">No requests yet. Start testing!</p>';
            return;
        }

        list.innerHTML = this.history.map((item, i) => `
            <div class="history-item" data-index="${i}">
                <div class="history-item-header">
                    <span class="history-item-method">${item.method}</span>
                    <span class="history-item-url">${this.escapeHtml(item.url)}</span>
                    <span class="history-item-status ${item.status >= 200 && item.status < 400 ? 'success' : 'error'}">${item.status}</span>
                </div>
                <div class="history-item-meta">${item.time}ms · ${new Date(item.timestamp).toLocaleString()}</div>
            </div>
        `).join('');

        list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const entry = this.history[item.dataset.index];
                document.getElementById('httpMethod').value = entry.method;
                document.getElementById('requestUrl').value = entry.url;
                document.getElementById('requestBody').value = entry.body || '';
                this.displayResponse({
                    status: entry.status,
                    statusText: entry.statusText,
                    headers: entry.responseHeaders,
                    body: entry.responseText,
                    time: entry.time,
                    size: new Blob([entry.responseText || '']).size
                });
            });
        });
    },

    exportHistory() {
        const data = JSON.stringify(this.history, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'webhook-history.json';
        a.click();
        URL.revokeObjectURL(url);
    },

    clearHistory() {
        if (confirm('Clear all request history?')) {
            this.history = [];
            localStorage.removeItem('webhook_history');
            this.renderHistory();
        }
    },

    saveTemplate() {
        const name = document.getElementById('templateName').value.trim();
        if (!name) return;

        const template = {
            name,
            method: document.getElementById('httpMethod').value,
            url: document.getElementById('requestUrl').value,
            body: document.getElementById('requestBody').value,
            headers: this.getKvPairs('headersEditor')
        };

        this.templates.push(template);
        localStorage.setItem('webhook_templates', JSON.stringify(this.templates));
        this.renderTemplates();
        document.getElementById('templateModal').style.display = 'none';
        document.getElementById('templateName').value = '';
    },

    renderTemplates() {
        const list = document.getElementById('templatesList');
        if (this.templates.length === 0) {
            list.innerHTML = '<p class="empty-state">No templates saved. Build a request and save it!</p>';
            return;
        }

        list.innerHTML = this.templates.map((item, i) => `
            <div class="template-item" data-index="${i}">
                <div class="template-item-header">
                    <span class="template-item-method">${item.method}</span>
                    <span class="template-item-url">${this.escapeHtml(item.name)} - ${this.escapeHtml(item.url)}</span>
                    <button class="btn btn-sm btn-danger template-delete" data-index="${i}">Delete</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('template-delete')) {
                    this.templates.splice(e.target.dataset.index, 1);
                    localStorage.setItem('webhook_templates', JSON.stringify(this.templates));
                    this.renderTemplates();
                    return;
                }
                const template = this.templates[item.dataset.index];
                document.getElementById('httpMethod').value = template.method;
                document.getElementById('requestUrl').value = template.url;
                document.getElementById('requestBody').value = template.body || '';

                const headersEditor = document.getElementById('headersEditor');
                headersEditor.innerHTML = '';
                if (template.headers && template.headers.length > 0) {
                    template.headers.forEach(h => this.addKvRowWithValue('headersEditor', h.key, h.value));
                } else {
                    this.addKvRow('headersEditor');
                }

                this.switchTab('tester');
            });
        });
    },

    toggleRepeatOptions(show) {
        document.getElementById('repeatOptions').style.display = show ? 'flex' : 'none';
    },

    startRepeat() {
        const interval = parseInt(document.getElementById('repeatInterval').value) || 1000;
        const count = parseInt(document.getElementById('repeatCount').value) || 10;
        let current = 0;

        document.getElementById('startRepeatBtn').style.display = 'none';
        document.getElementById('stopRepeatBtn').style.display = 'inline-flex';

        this.repeatInterval = setInterval(async () => {
            current++;
            document.getElementById('repeatStatus').textContent = `Request ${current}/${count}`;
            await this.sendRequest();
            if (current >= count) this.stopRepeat();
        }, interval);
    },

    stopRepeat() {
        clearInterval(this.repeatInterval);
        this.repeatInterval = null;
        document.getElementById('startRepeatBtn').style.display = 'inline-flex';
        document.getElementById('stopRepeatBtn').style.display = 'none';
        document.getElementById('repeatStatus').textContent = 'Complete';
    },

    switchTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    },

    showModal(id) {
        document.getElementById(id).style.display = 'flex';
    },

    loadState() {
        const savedId = localStorage.getItem('webhook_id');
        if (savedId) {
            this.webhookId = savedId;
            document.getElementById('webhookUrl').textContent = `https://webhook-tester.pages.dev/hooks/${savedId}`;
        }
    },

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
