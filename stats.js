// ==================== СТАТИСТИКА ====================
// Окно статистики: фильтры, итоги, таблицы по клиентам/изделиям,
// круговая диаграмма и график по месяцам, экспорт резервной копии.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: orders/customers/products (главный скрипт),
// orderGrandTotal/orderVatAmount (money.js), closeModal (главный скрипт).
// updateTotals используется также из orders.js (для сумм недели/месяца под списком заказов).

// Раздел "Статистика" теперь обычная вкладка (см. showTab в index.html),
// а не всплывающее окно. Функция оставлена как алиас — на случай,
// если где-то ещё остался старый вызов openStatsModal().
function openStatsModal() {
    showTab('stats');
}

function downloadBackup() {
    // Экспорт текущих данных (из кэша) в JSON для резервной копии
    const exportOrders = orders.map(o => ({
        id: o.id,
        customer: o.customer,
        date: o.date,
        status: o.status,
        discount: o.discount,
        items: o.items.map(it => ({ product: it.product, quantity: it.quantity, price: it.price }))
    }));
    const data = {
        products: products.map(p => ({ name: p.name, price: p.price })),
        customers: customers.map(c => ({ name: c.name, contact: c.contact, discount: c.discount })),
        orders: exportOrders
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    a.href     = url;
    a.download = `runwaychef_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getFilteredOrders() {
    const dateRange = document.getElementById('statsDateRange').value;
    const dateFrom  = document.getElementById('statsDateFrom') ? document.getElementById('statsDateFrom').value : '';
    const dateTo    = document.getElementById('statsDateTo')   ? document.getElementById('statsDateTo').value   : '';
    let filtered = [...orders];
    if (selectedStatsCustomers.length > 0) filtered = filtered.filter(o => selectedStatsCustomers.includes(o.customer));
    if (dateRange === 'week' || dateRange === 'month') {
        const today = new Date();
        let start;
        if (dateRange === 'week') {
            start = new Date(today);
            start.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        } else {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        filtered = filtered.filter(o => new Date(o.date) >= start);
    } else if (dateRange === 'custom' && dateFrom && dateTo) {
        const from = new Date(dateFrom);
        const to   = new Date(dateTo); to.setDate(to.getDate() + 1);
        filtered = filtered.filter(o => { const d = new Date(o.date); return d >= from && d < to; });
    }
    return filtered;
}

function calculateStats(filteredOrders) {
    const today = new Date();
    const weekStart  = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const sum    = list => list.reduce((s, o) => s + orderGrandTotal(o), 0).toFixed(2);
    const sumVat = list => list.reduce((s, o) => s + orderVatAmount(o), 0).toFixed(2);
    return {
        totalPrice: sum(filteredOrders),
        totalVat:   sumVat(filteredOrders),
        weekTotal:  sum(filteredOrders.filter(o => new Date(o.date) >= weekStart)),
        monthTotal: sum(filteredOrders.filter(o => new Date(o.date) >= monthStart)),
    };
}

// ==================== МНОЖЕСТВЕННЫЙ ФИЛЬТР КЛИЕНТОВ ====================
let selectedStatsCustomers = []; // пусто = все клиенты

function updateStatsCustomerFilter() {
    const list = document.getElementById('customerFilterList');
    list.innerHTML = '';
    customers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
        const checked = selectedStatsCustomers.includes(c.name) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 px-1 py-1 text-xs hover:bg-gray-50 rounded';
        label.innerHTML = `<input type="checkbox" value="${c.name}" onchange="onCustomerFilterChange(this)" ${checked}> ${c.name}`;
        list.appendChild(label);
    });
    updateCustomerFilterLabel();
}

function toggleCustomerFilterDropdown() {
    document.getElementById('customerFilterDropdown').classList.toggle('hidden');
}

function toggleAllCustomersFilter(checkbox) {
    if (checkbox.checked) {
        selectedStatsCustomers = [];
        document.querySelectorAll('#customerFilterList input[type=checkbox]').forEach(cb => cb.checked = false);
    }
    updateCustomerFilterLabel();
    applyFilter();
}

function onCustomerFilterChange(checkbox) {
    if (checkbox.checked) {
        if (!selectedStatsCustomers.includes(checkbox.value)) selectedStatsCustomers.push(checkbox.value);
    } else {
        selectedStatsCustomers = selectedStatsCustomers.filter(n => n !== checkbox.value);
    }
    document.getElementById('customerFilterAll').checked = selectedStatsCustomers.length === 0;
    updateCustomerFilterLabel();
    applyFilter();
}

function updateCustomerFilterLabel() {
    const label = document.getElementById('customerFilterLabel');
    if (selectedStatsCustomers.length === 0) {
        label.textContent = 'Все клиенты';
    } else if (selectedStatsCustomers.length === 1) {
        label.textContent = selectedStatsCustomers[0];
    } else {
        label.textContent = `Выбрано клиентов: ${selectedStatsCustomers.length}`;
    }
}

// Закрытие выпадающего списка по клику снаружи
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('customerFilterDropdown');
    const btn = document.getElementById('customerFilterBtn');
    if (!dropdown || dropdown.classList.contains('hidden')) return;
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

function toggleDateRange() {
    const range = document.getElementById('statsDateRange').value;
    document.getElementById('customDateRange').classList.toggle('hidden', range !== 'custom');
}

function applyFilter() {
    const filtered = getFilteredOrders();
    updateDisplay(filtered);
    drawPieChart(filtered);
    drawMonthlyChart(filtered);
    drawCustomerTable(filtered);
    drawProductTable(filtered);
    drawProfitabilitySummary(filtered);
    drawProductProfitabilityTable();
}

function updateDisplay(filteredOrders = orders) {
    const stats = calculateStats(filteredOrders);
    document.getElementById('totalPrice').textContent      = stats.totalPrice + ' €';
    document.getElementById('totalVatModal').textContent   = stats.totalVat   + ' €';
    document.getElementById('weekTotalModal').textContent  = stats.weekTotal  + ' €';
    document.getElementById('monthTotalModal').textContent = stats.monthTotal + ' €';
    updateInfoCounts();
}

function updateInfoCounts() {
    document.getElementById('customerCount').textContent = customers.length;
    document.getElementById('productCount').textContent  = products.length;
    document.getElementById('orderCount').textContent    = orders.length;
}

function updateTotals(filteredOrders) {
    const today = new Date();
    const weekStart  = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const weekTotal  = filteredOrders.filter(o => new Date(o.date) >= weekStart).reduce((s,o) => s + orderGrandTotal(o), 0).toFixed(2);
    const monthTotal = filteredOrders.filter(o => new Date(o.date) >= monthStart).reduce((s,o) => s + orderGrandTotal(o), 0).toFixed(2);
    document.getElementById('weekTotal').textContent  = weekTotal  + ' €';
    document.getElementById('monthTotal').textContent = monthTotal + ' €';
}

// --- Таблица по клиентам ---
let lastCustomerTableData = null; // кэш для повторного использования при открытии полного списка

function buildCustomerRowsHtml(sorted, totals, vats, qtys, grandTotal) {
    let html = '';
    sorted.forEach(([name, val], i) => {
        const pct = grandTotal > 0 ? (val/grandTotal*100).toFixed(1) : '0.0';
        const color = `hsl(${i * 360 / sorted.length}, 60%, 50%)`;
        html += `<tr class="border-b"><td class="p-0.5 flex items-center gap-1"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>${name}</td><td class="p-0.5 text-right">${qtys[name] || 0}</td><td class="p-0.5 text-right font-medium">${val.toFixed(2)}</td><td class="p-0.5 text-right text-blue-700">${(vats[name]||0).toFixed(2)}</td><td class="p-0.5 text-right text-gray-500">${pct}%</td></tr>`;
    });
    return html;
}

function drawCustomerTable(filtered) {
    const totals = {};
    const vats    = {};
    const qtys   = {};
    filtered.forEach(o => {
        totals[o.customer] = (totals[o.customer] || 0) + orderGrandTotal(o);
        vats[o.customer]   = (vats[o.customer]   || 0) + orderVatAmount(o);
        const q = (o.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
        qtys[o.customer] = (qtys[o.customer] || 0) + q;
    });
    const sorted = Object.entries(totals).sort((a,b) => b[1] - a[1]);
    const grandTotal = sorted.reduce((s,[,v]) => s+v, 0);
    const grandVat   = Object.values(vats).reduce((s,v) => s+v, 0);
    const grandQty   = Object.values(qtys).reduce((s,v) => s+v, 0);

    // Сохраняем для возможного открытия полного списка
    lastCustomerTableData = { sorted, totals, vats, qtys, grandTotal, grandVat, grandQty };

    const container = document.getElementById('statsCustomerTableScroll');
    const totalContainer = document.getElementById('statsCustomerTableTotal');
    const moreBtn = document.getElementById('statsCustomerShowAllBtn');

    if (!sorted.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">Нет данных</p>';
        totalContainer.innerHTML = '';
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    const top10 = sorted.slice(0, 10);
    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left">Клиент</th><th class="p-0.5 text-right">Кол-во</th><th class="p-0.5 text-right">Сумма (€)</th><th class="p-0.5 text-right">НДС (€)</th><th class="p-0.5 text-right">Доля</th></tr></thead><tbody>';
    html += buildCustomerRowsHtml(top10, totals, vats, qtys, grandTotal);
    html += '</tbody></table>';
    container.innerHTML = html;
    totalContainer.innerHTML =
        `<table class="w-full text-xs"><tr class="bg-gray-50 font-semibold"><td class="p-0.5" style="width:40%">Итого</td><td class="p-0.5 text-right" style="width:15%">${grandQty}</td><td class="p-0.5 text-right" style="width:20%">${grandTotal.toFixed(2)}</td><td class="p-0.5 text-right text-blue-700" style="width:15%">${grandVat.toFixed(2)}</td><td class="p-0.5" style="width:10%"></td></tr></table>`;

    if (moreBtn) moreBtn.classList.toggle('hidden', sorted.length <= 10);
}

function openAllCustomersModal() {
    if (!lastCustomerTableData) return;
    const { sorted, totals, vats, qtys, grandTotal, grandVat, grandQty } = lastCustomerTableData;
    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left">Клиент</th><th class="p-0.5 text-right">Кол-во</th><th class="p-0.5 text-right">Сумма (€)</th><th class="p-0.5 text-right">НДС (€)</th><th class="p-0.5 text-right">Доля</th></tr></thead><tbody>';
    html += buildCustomerRowsHtml(sorted, totals, vats, qtys, grandTotal);
    html += `<tr class="bg-gray-50 font-semibold"><td class="p-0.5">Итого</td><td class="p-0.5 text-right">${grandQty}</td><td class="p-0.5 text-right">${grandTotal.toFixed(2)}</td><td class="p-0.5 text-right text-blue-700">${grandVat.toFixed(2)}</td><td class="p-0.5"></td></tr>`;
    html += '</tbody></table>';
    document.getElementById('allCustomersTable').innerHTML = html;
    document.getElementById('allCustomersModal').style.display = 'flex';
}

// --- Топ изделий ---
function drawProductTable(filtered) {
    const totals = {};
    const qtys   = {};
    filtered.forEach(o => {
        (o.items || []).forEach(it => {
            totals[it.product] = (totals[it.product] || 0) + it.quantity * it.price;
            qtys[it.product]   = (qtys[it.product] || 0) + Number(it.quantity || 0);
        });
    });
    const sorted = Object.entries(totals).sort((a,b) => b[1] - a[1]).slice(0, 10);
    if (!sorted.length) {
        document.getElementById('statsProductTable').innerHTML = '<p class="text-xs text-gray-400">Нет данных</p>';
        return;
    }
    const max = sorted[0][1];
    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left">Изделие</th><th class="p-0.5 text-right">Кол-во</th><th class="p-0.5 text-right">Сумма (€)</th></tr></thead><tbody>';
    sorted.forEach(([name, val]) => {
        const barW = max > 0 ? Math.round(val/max*100) : 0;
        html += `<tr class="border-b"><td class="p-0.5">
            <div>${name}</div>
            <div style="background:#e5e7eb;border-radius:2px;height:4px;margin-top:2px;">
                <div style="background:#6b7280;width:${barW}%;height:4px;border-radius:2px;"></div>
            </div>
        </td><td class="p-0.5 text-right align-top">${qtys[name] || 0}</td><td class="p-0.5 text-right font-medium align-top">${val.toFixed(2)}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('statsProductTable').innerHTML = html;
}

// --- Общая рентабельность за период ---
function drawProfitabilitySummary(filtered) {
    const totalCost   = filtered.reduce((s, o) => s + orderCost(o), 0);
    const totalProfit = filtered.reduce((s, o) => s + orderProfit(o), 0);
    const totalBase   = filtered.reduce((s, o) => s + orderAfterDiscount(o), 0);
    const profitPct   = totalBase > 0 ? (totalProfit / totalBase * 100) : 0;

    const costEl = document.getElementById('statsTotalCost');
    const profitEl = document.getElementById('statsTotalProfit');
    const profitPctEl = document.getElementById('statsProfitPct');
    if (costEl) costEl.textContent = totalCost.toFixed(2) + ' €';
    if (profitEl) {
        profitEl.textContent = totalProfit.toFixed(2) + ' €';
        profitEl.className = totalProfit >= 0 ? 'text-sm font-bold text-green-700' : 'text-sm font-bold text-red-600';
    }
    if (profitPctEl) profitPctEl.textContent = profitPct.toFixed(1) + '%';
}

// --- Топ-10 изделий по рентабельности (% прибыли) ---
function drawProductProfitabilityTable() {
    const container = document.getElementById('statsProductProfitability');
    if (!container) return;
    const withRecipe = products.filter(p => (p.ingredients || []).length > 0);
    if (!withRecipe.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">Нет изделий с заполненной рецептурой</p>';
        return;
    }
    const sorted = [...withRecipe].sort((a, b) => productProfitPct(b) - productProfitPct(a)).slice(0, 10);
    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left">Изделие</th><th class="p-0.5 text-right">Себест.</th><th class="p-0.5 text-right">Цена</th><th class="p-0.5 text-right">Рент.</th></tr></thead><tbody>';
    sorted.forEach(p => {
        const cost = productUnitCost(p);
        const pct  = productProfitPct(p);
        const pctClass = pct >= 0 ? 'text-green-700' : 'text-red-600';
        html += `<tr class="border-b"><td class="p-0.5">${p.name}</td><td class="p-0.5 text-right">${cost.toFixed(2)} €</td><td class="p-0.5 text-right">${p.price.toFixed(2)} €</td><td class="p-0.5 text-right font-semibold ${pctClass}">${pct.toFixed(1)}%</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// --- Столбчатый график по месяцам (выручка + линия прибыли) ---
function drawMonthlyChart(filtered) {
    const canvas = document.getElementById('monthlyCanvas');
    const W = canvas.offsetWidth || 360;
    const H = 140;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Группируем по ГГГГ-ММ — выручка (столбики) и прибыль (линия)
    const monthlyRevenue = {};
    const monthlyProfit  = {};
    filtered.forEach(o => {
        const key = o.date ? o.date.slice(0,7) : 'unknown';
        monthlyRevenue[key] = (monthlyRevenue[key] || 0) + orderGrandTotal(o);
        monthlyProfit[key]  = (monthlyProfit[key]  || 0) + orderProfit(o);
    });
    const keys = Object.keys(monthlyRevenue).sort();
    if (!keys.length) {
        ctx.fillStyle = '#9ca3af'; ctx.font = '11px sans-serif';
        ctx.fillText('Нет данных', W/2 - 30, H/2);
        return;
    }
    const revenueVals = keys.map(k => monthlyRevenue[k]);
    const profitVals  = keys.map(k => monthlyProfit[k] || 0);
    // Общий максимум по обеим сериям, чтобы прибыль не выходила за пределы графика
    const maxV  = Math.max(...revenueVals, ...profitVals, 0.01);
    const pad   = { top: 10, bottom: 30, left: 42, right: 8 };
    const bW    = Math.max(4, Math.floor((W - pad.left - pad.right) / keys.length) - 4);
    const chartH = H - pad.top - pad.bottom;

    // Сетка
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
        const y = pad.top + chartH * (1 - f);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#9ca3af'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText((maxV * f).toFixed(0), pad.left - 3, y + 3);
    });

    // Столбики выручки
    const points = [];
    keys.forEach((key, i) => {
        const x   = pad.left + i * ((W - pad.left - pad.right) / keys.length) + 2;
        const h   = maxV > 0 ? (revenueVals[i] / maxV) * chartH : 0;
        const y   = pad.top + chartH - h;
        ctx.fillStyle = `hsl(${210 + i*15}, 55%, 55%)`;
        ctx.fillRect(x, y, bW, h);
        points.push({ x: x + bW / 2, y: pad.top + chartH - (maxV > 0 ? (profitVals[i] / maxV) * chartH : 0) });
        // Подпись месяца
        ctx.fillStyle = '#6b7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
        const label = key.slice(5); // MM
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        ctx.fillText(months[parseInt(label)-1] || label, x + bW/2, H - 4);
    });

    // Линия прибыли поверх столбиков
    if (points.length) {
        ctx.beginPath();
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 2;
        points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        // Точки на линии
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#16a34a';
            ctx.fill();
        });
    }

    // Легенда графика
    ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = `hsl(210, 55%, 55%)`;
    ctx.fillRect(pad.left, 2, 8, 8);
    ctx.fillStyle = '#374151';
    ctx.fillText('Выручка', pad.left + 11, 9);
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad.left + 65, 6); ctx.lineTo(pad.left + 80, 6); ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.fillText('Прибыль', pad.left + 84, 9);
}

// --- Круговая диаграмма (без легенды на canvas) ---
function drawPieChart(filtered) {
    const canvas = document.getElementById('chartCanvas');
    const SIZE = 200;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = SIZE + 'px';
    canvas.style.height = SIZE + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    const totals = {};
    filtered.forEach(o => { totals[o.customer] = (totals[o.customer] || 0) + orderGrandTotal(o); });
    // Сортируем от большего к меньшему
    const sorted  = Object.entries(totals).sort((a,b) => b[1] - a[1]);
    const grandTotal = sorted.reduce((s,[,v]) => s+v, 0);
    if (!sorted.length || grandTotal === 0) {
        ctx.fillStyle = '#e5e7eb';
        ctx.beginPath(); ctx.arc(SIZE/2, SIZE/2, SIZE/2 - 10, 0, 2*Math.PI); ctx.fill();
        ctx.fillStyle = '#9ca3af'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Нет данных', SIZE/2, SIZE/2 + 4);
        document.getElementById('chartLegend').innerHTML = '';
        return;
    }

    const colors = sorted.map((_,i) => `hsl(${i * 360 / sorted.length}, 60%, 52%)`);
    let startAngle = -Math.PI / 2;
    const cx = SIZE/2, cy = SIZE/2, r = SIZE/2 - 8;

    sorted.forEach(([,val], i) => {
        const angle = (val / grandTotal) * 2 * Math.PI;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + angle);
        ctx.fillStyle = colors[i]; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        startAngle += angle;
    });

    // Легенда отдельно под диаграммой, отсортирована от большего к меньшему
    let legend = '';
    sorted.forEach(([name, val], i) => {
        const pct = (val / grandTotal * 100).toFixed(1);
        legend += `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #f3f4f6;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></span>
            <span style="flex:1;font-size:11px;color:#374151;">${name}</span>
            <span style="font-size:11px;font-weight:600;color:#111827;">${val.toFixed(2)} €</span>
            <span style="font-size:10px;color:#6b7280;min-width:35px;text-align:right;">${pct}%</span>
        </div>`;
    });
    document.getElementById('chartLegend').innerHTML = legend;
}

// Оставляем drawChart как алиас для совместимости
function drawChart() { applyFilter(); }
