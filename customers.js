// ==================== КЛИЕНТЫ ====================
// Список клиентов: отображение, добавление, редактирование (скидка, флажок «Без НДС»).
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), customers/orders (главный скрипт),
// showLoading/hideLoading, logActivity (employees.js),
// svgEdit/svgDelete, updateCustomerSelects, updateStatsCustomerFilter,
// updateOrderCustomerFilter, openDeleteModal, closeModal (главный скрипт).

function displayCustomers() {
    customers.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';
    let warningCount = 0;
    customers.forEach((c, i) => {
        const hasName = !!(c.name && c.name.trim());
        if (!hasName) warningCount++;
        const nameLabel = hasName ? escapeHtml(c.name) : '⚠ (имя не указано)';
        const row = document.createElement('tr');
        row.className = 'order-row' + (hasName ? '' : ' bg-red-50');
        row.innerHTML = `
            <td class="border p-0.5 text-xs ${hasName ? '' : 'text-red-600 font-semibold'}" onclick="openCustomerDetail(${c.id})">${nameLabel}</td>
            <td class="border p-0.5 text-xs" onclick="openCustomerDetail(${c.id})">${escapeHtml(c.contact)}</td>
            <td class="border p-0.5 text-xs" onclick="openCustomerDetail(${c.id})">${c.discount.toFixed(2)}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openCustomerDetail(${c.id})">${c.vat_exempt ? '✓' : ''}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openCustomerDetail(${c.id})`)}
                ${svgDelete(`openDeleteModal(${i},'customer','клиента «${c.name || '(без имени)'}»')`)}
            </td>`;
        tbody.appendChild(row);
    });
    const warningEl = document.getElementById('customersNameWarning');
    if (warningEl) warningEl.classList.toggle('hidden', warningCount === 0);
    updateCustomerSelects();
    updateStatsCustomerFilter();
    updateOrderCustomerFilter();
}

// Кнопка "+": попап для создания нового клиента
function openAddCustomerModal() {
    document.getElementById('customerName').value = '';
    document.getElementById('customerContact').value = '';
    document.getElementById('customerDiscount').value = '';
    document.getElementById('customerVatExempt').checked = false;
    document.getElementById('addCustomerModal').style.display = 'flex';
}

async function addCustomer() {
    const name     = document.getElementById('customerName').value.trim();
    const contact  = document.getElementById('customerContact').value.trim();
    const discount = parseFloat(document.getElementById('customerDiscount').value) || 0;
    const vatExempt = document.getElementById('customerVatExempt').checked;
    if (!name || !contact) { showInfo('Заполните все поля корректно!'); return; }
    showLoading();
    try {
        const { data, error } = await db.from('customers').insert({ name, contact, discount: parseFloat(discount.toFixed(2)), vat_exempt: vatExempt }).select().single();
        if (error) throw error;
        customers.push({ id: data.id, name: data.name, contact: data.contact || '', discount: Number(data.discount || 0), vat_exempt: !!data.vat_exempt });
        displayCustomers();
        closeModal();
        logActivity('customer', `Добавлен клиент «${name}»`);
        document.getElementById('customerName').value    = '';
        document.getElementById('customerContact').value = '';
        document.getElementById('customerDiscount').value = '';
        document.getElementById('customerVatExempt').checked = false;
    } catch (e) { console.error(e); showInfo('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// Массово проставляет текущий НДС-статус клиента во ВСЕХ его существующих заказах.
// Разовое действие по явному запросу — НДС-статус заказа сам по себе не меняется
// задним числом автоматически при смене статуса клиента (см. saveCdHeader).
async function applyVatExemptToAllOrders() {
    const cust = customers.find(c => c.id === currentCustomerId);
    if (!cust) return;

    const custOrders = orders.filter(o => o.customer_id === cust.id);
    const toUpdate = custOrders.filter(o => !!o.vat_exempt !== !!cust.vat_exempt);

    if (!toUpdate.length) {
        await showInfo('У всех заказов этого клиента НДС-статус уже совпадает с текущим.');
        return;
    }

    const statusLabel = cust.vat_exempt ? '«Без НДС»' : '«С НДС»';
    const ok = await showConfirm(`Применить статус ${statusLabel} к ${toUpdate.length} ${toUpdate.length === 1 ? 'заказу' : 'заказам'} клиента «${cust.name}»?\nЭто изменит уже существующие заказы.`);
    if (!ok) return;

    showLoading();
    try {
        const ids = toUpdate.map(o => o.id);
        const { error } = await db.from('orders').update({ vat_exempt: cust.vat_exempt }).in('id', ids);
        if (error) throw error;
        toUpdate.forEach(o => { o.vat_exempt = cust.vat_exempt; });
        logActivity('customer', `Применён НДС-статус ${statusLabel} к ${toUpdate.length} заказам клиента «${cust.name}»`);
        renderCustomerStats(cust);
        renderCustomerOrders();
        await showInfo(`Готово: обновлено заказов — ${toUpdate.length}.`);
    } catch (e) { console.error(e); showInfo('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// ==================== КАРТОЧКА КЛИЕНТА ====================
function openCustomerDetail(custId) {
    currentCustomerId = custId;
    const cust = customers.find(c => c.id === custId);
    if (!cust) return;

    document.getElementById('customersList').classList.add('hidden');
    document.getElementById('customerDetail').classList.add('active');

    document.getElementById('cdName').value = cust.name;
    document.getElementById('cdContact').value = cust.contact;
    document.getElementById('cdDiscount').value = cust.discount.toFixed(2);
    document.getElementById('cdVatExempt').checked = !!cust.vat_exempt;
    document.getElementById('cdDateRange').value = 'all';

    renderCustomerStats(cust);
    renderCustomerOrders();
    refreshFab();
}

function closeCustomerDetail() {
    currentCustomerId = null;
    document.getElementById('customersList').classList.remove('hidden');
    document.getElementById('customerDetail').classList.remove('active');
    displayCustomers();
    refreshFab();
}

// Удаление клиента прямо из его карточки (то же окно подтверждения, что и из списка)
function deleteCurrentCustomer() {
    const idx = customers.findIndex(c => c.id === currentCustomerId);
    if (idx === -1) return;
    const cust = customers[idx];
    openDeleteModal(idx, 'customer', `клиента «${cust.name || '(без имени)'}»`);
}

async function saveCdHeader() {
    const cust = customers.find(c => c.id === currentCustomerId);
    if (!cust) return;
    const name     = document.getElementById('cdName').value.trim();
    const contact  = document.getElementById('cdContact').value.trim();
    const discount = parseFloat(document.getElementById('cdDiscount').value) || 0;
    const vatExempt = document.getElementById('cdVatExempt').checked;
    if (!name || !contact) { showInfo('Заполните имя и контакты!'); return; }
    const oldName = cust.name;
    showLoading();
    try {
        const { error } = await db.from('customers').update({ name, contact, discount: parseFloat(discount.toFixed(2)), vat_exempt: vatExempt }).eq('id', cust.id);
        if (error) throw error;
        cust.name = name; cust.contact = contact; cust.discount = parseFloat(discount.toFixed(2)); cust.vat_exempt = vatExempt;
        // Обновить имя клиента в кэше заказов
        orders.forEach(o => { if (o.customer_id === cust.id) o.customer = name; });
        logActivity('customer', `Изменён клиент «${oldName}»${oldName !== name ? ` → «${name}»` : ''}`);
        renderCustomerStats(cust);
        renderCustomerOrders();
    } catch (e) { console.error(e); showInfo('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// Мини-итоги "за всё время" — не зависят от фильтра по дате под ними
function renderCustomerStats(cust) {
    const custOrders = orders.filter(o => o.customer_id === cust.id);
    const totalSum = custOrders.reduce((s, o) => s + orderGrandTotal(o), 0);
    const lastDate = custOrders.reduce((latest, o) => (!latest || o.date > latest) ? o.date : latest, null);
    document.getElementById('cdOrderCount').textContent = custOrders.length;
    document.getElementById('cdTotalSum').textContent = totalSum.toFixed(2) + ' €';
    document.getElementById('cdLastOrderDate').textContent = lastDate ? formatDateDMY(lastDate) : '—';
}

// Список заказов клиента с фильтром по периоду (Весь период/Неделя/Месяц/Год)
function renderCustomerOrders() {
    const cust = customers.find(c => c.id === currentCustomerId);
    const container = document.getElementById('cdOrdersList');
    if (!cust || !container) return;

    const range = document.getElementById('cdDateRange').value;
    let custOrders = orders.filter(o => o.customer_id === cust.id);

    if (range === 'week' || range === 'month' || range === 'year') {
        const today = new Date();
        let start;
        if (range === 'week') {
            start = new Date(today);
            start.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        } else if (range === 'year') {
            start = new Date(today.getFullYear(), 0, 1);
        } else {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        custOrders = custOrders.filter(o => new Date(o.date) >= start);
    }

    custOrders.sort((a, b) => b.date.localeCompare(a.date));

    if (!custOrders.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">Нет заказов за этот период</p>';
        return;
    }

    const statusFlag = { 'принят': 'flag-red', 'в работе': 'flag-yellow', 'выполнен': 'flag-green' };
    let html = '<table class="w-full stats-table" style="table-layout:fixed;"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left" style="width:30%;">Дата</th><th class="p-0.5 text-right" style="width:35%;">Сумма (€)</th><th class="p-0.5 text-center" style="width:35%;">Статус</th></tr></thead><tbody>';
    custOrders.forEach(o => {
        html += `<tr class="border-b order-row" onclick="goToOrderFromCustomer(${o.id})">
            <td class="p-0.5">${formatDateDMY(o.date)}</td>
            <td class="p-0.5 text-right stats-num">${orderGrandTotal(o).toFixed(2)}</td>
            <td class="p-0.5 text-center"><span class="flag ${statusFlag[o.status] || ''}"></span> ${escapeHtml(o.status)}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}
