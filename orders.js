// ==================== ЗАКАЗЫ ====================
// Список заказов: отображение, группировка по неделям/месяцам, фильтры,
// создание и копирование заказа.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), orders/customers/products/employees (главный скрипт),
// orderGrandTotal (money.js), formatDateDMY/getMondayOf/MONTH_NAMES_RU (dates.js),
// showLoading/hideLoading, logActivity (employees.js), currentEmployee (employees.js),
// svgEdit/svgDelete/svgCopy, openOrderDetail, updateTotals (главный скрипт).

// ---- Список заказов ----

function displayOrders() {
    const filteredOrders = getFilteredOrdersForList();
    const sorted = [...filteredOrders].sort((a, b) => new Date(b.date) - new Date(a.date));
    const tbody = document.getElementById('orderTableBody');
    tbody.innerHTML = '';

    let currentMonthKey = null; // 'YYYY-MM'
    let currentWeekKey  = null; // ISO date понедельника недели

    function appendWeekSummary(weekKey) {
        const monday = new Date(weekKey);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        const weekTotals = calcGroupTotals(sorted, o => {
            const om = getMondayOf(new Date(o.date)).toISOString().slice(0,10);
            return om === weekKey;
        });
        const weekLabel = `${formatDateDMY(monday.toISOString().slice(0,10))} – ${formatDateDMY(sunday.toISOString().slice(0,10))}`;
        const weekRow = document.createElement('tr');
        weekRow.innerHTML = `<td colspan="6" class="bg-gray-200 text-gray-700 text-xs font-medium p-1">
            Неделя ${weekLabel} — ${weekTotals.qty} шт., ${weekTotals.sum.toFixed(2)} €
        </td>`;
        tbody.appendChild(weekRow);
    }

    function appendMonthSummary(monthKey) {
        const [y, m] = monthKey.split('-').map(Number);
        // Месяц объединяет все недели, чей понедельник попадает в этот месяц
        const monthTotals = calcGroupTotals(sorted, o => {
            const monday = getMondayOf(new Date(o.date));
            return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}` === monthKey;
        });
        const monthLabel = `${MONTH_NAMES_RU[m - 1]} ${y}`;
        const monthRow = document.createElement('tr');
        monthRow.innerHTML = `<td colspan="6" class="bg-gray-700 text-white text-xs font-semibold p-1.5">
            Итого за ${monthLabel} — ${monthTotals.qty} шт., ${monthTotals.sum.toFixed(2)} €
        </td>`;
        tbody.appendChild(monthRow);
    }

    function appendSpacer() {
        const spacerRow = document.createElement('tr');
        spacerRow.innerHTML = `<td colspan="6" class="p-1.5 border-b border-gray-300"></td>`;
        tbody.appendChild(spacerRow);
    }

    sorted.forEach((order, idx) => {
        const orderDate = new Date(order.date);
        const monday = getMondayOf(orderDate);
        const weekKey  = monday.toISOString().slice(0, 10);
        // Месяц группы определяется по месяцу понедельника недели — недели не разбиваются
        const monthKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}`;

        const monthChanged = currentMonthKey !== null && monthKey !== currentMonthKey;
        const weekChanged  = currentWeekKey  !== null && weekKey  !== currentWeekKey;

        if (monthChanged || weekChanged) {
            // Закрываем текущую неделю
            appendWeekSummary(currentWeekKey);
            // Если поменялся месяц — закрываем и его, со спейсером
            if (monthChanged) {
                appendMonthSummary(currentMonthKey);
            }
            appendSpacer();
        }

        currentMonthKey = monthKey;
        currentWeekKey  = weekKey;

        const realIdx = orders.indexOf(order);
        const total = orderGrandTotal(order).toFixed(2);
        const itemsCount = order.items ? order.items.length : 0;
        let flagClass = 'flag';
        if (order.status === 'принят')    flagClass += ' flag-red';
        else if (order.status === 'в работе') flagClass += ' flag-yellow';
        else if (order.status === 'выполнен') flagClass += ' flag-green';

        const row = document.createElement('tr');
        row.className = 'order-row';
        row.innerHTML = `
            <td class="border p-0.5 text-xs whitespace-nowrap" onclick="openOrderDetail(${order.id})">${formatDateDMY(order.date)}</td>
            <td class="border p-0.5 text-xs" onclick="openOrderDetail(${order.id})">${escapeHtml(order.customer)}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openOrderDetail(${order.id})">${itemsCount}</td>
            <td class="border p-0.5 text-xs font-medium" onclick="openOrderDetail(${order.id})">${total}</td>
            <td class="border p-0.5 text-center" onclick="openOrderDetail(${order.id})"><span class="${flagClass}"></span></td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditOrderModal(${realIdx})`)}
                ${svgDelete(`openDeleteModal(${realIdx},'order','заказ клиента «${order.customer}»')`)}
                ${svgCopy(`copyOrder(${realIdx})`)}
            </td>`;
        tbody.appendChild(row);
    });

    // Закрываем последнюю неделю и месяц
    if (currentWeekKey !== null) {
        appendWeekSummary(currentWeekKey);
        appendMonthSummary(currentMonthKey);
    }

    updateTotals(filteredOrders);
}

// Считает сумму (с НДС) и общее кол-во изделий по подмножеству заказов, отобранных predicate
function calcGroupTotals(allOrders, predicate) {
    let sum = 0, qty = 0;
    allOrders.forEach(o => {
        if (predicate(o)) {
            sum += orderGrandTotal(o);
            qty += (o.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
        }
    });
    return { sum, qty };
}

// ---- Фильтры списка заказов ----

let selectedOrderCustomers = []; // пусто = все клиенты

function getFilteredOrdersForList() {
    const dateRange = document.getElementById('orderDateRangeFilter') ? document.getElementById('orderDateRangeFilter').value : 'all';
    const dateFrom  = document.getElementById('orderDateFrom') ? document.getElementById('orderDateFrom').value : '';
    const dateTo    = document.getElementById('orderDateTo')   ? document.getElementById('orderDateTo').value   : '';
    const employeeFilter = document.getElementById('orderEmployeeFilter') ? document.getElementById('orderEmployeeFilter').value : '';
    let filtered = [...orders];
    if (selectedOrderCustomers.length > 0) filtered = filtered.filter(o => selectedOrderCustomers.includes(o.customer));
    if (employeeFilter) filtered = filtered.filter(o => String(o.employee_id) === employeeFilter);
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

function updateOrderCustomerFilter() {
    const list = document.getElementById('orderFilterList');
    if (!list) return;
    list.innerHTML = '';
    customers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
        const checked = selectedOrderCustomers.includes(c.name) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 px-1 py-1 text-xs hover:bg-gray-50 rounded';
        label.innerHTML = `<input type="checkbox" value="${c.name}" onchange="onOrderCustomerFilterChange(this)" ${checked}> ${c.name}`;
        list.appendChild(label);
    });
    updateOrderFilterLabel();
}

function updateOrderEmployeeFilter() {
    const sel = document.getElementById('orderEmployeeFilter');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Все исполнители</option>';
    employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.textContent = e.name;
        if (String(e.id) === prev) opt.selected = true;
        sel.appendChild(opt);
    });
}

function toggleOrderFilterDropdown() {
    document.getElementById('orderFilterDropdown').classList.toggle('hidden');
}

function toggleAllOrderCustomersFilter(checkbox) {
    if (checkbox.checked) {
        selectedOrderCustomers = [];
        document.querySelectorAll('#orderFilterList input[type=checkbox]').forEach(cb => cb.checked = false);
    }
    updateOrderFilterLabel();
    displayOrders();
}

function onOrderCustomerFilterChange(checkbox) {
    if (checkbox.checked) {
        if (!selectedOrderCustomers.includes(checkbox.value)) selectedOrderCustomers.push(checkbox.value);
    } else {
        selectedOrderCustomers = selectedOrderCustomers.filter(n => n !== checkbox.value);
    }
    document.getElementById('orderFilterAll').checked = selectedOrderCustomers.length === 0;
    updateOrderFilterLabel();
    displayOrders();
}

function updateOrderFilterLabel() {
    const label = document.getElementById('orderFilterLabel');
    if (!label) return;
    if (selectedOrderCustomers.length === 0) {
        label.textContent = 'Все клиенты';
    } else if (selectedOrderCustomers.length === 1) {
        label.textContent = selectedOrderCustomers[0];
    } else {
        label.textContent = `Выбрано клиентов: ${selectedOrderCustomers.length}`;
    }
}

function toggleOrderDateRange() {
    const range = document.getElementById('orderDateRangeFilter').value;
    document.getElementById('orderCustomDateRange').classList.toggle('hidden', range !== 'custom');
}

function applyOrderFilter() {
    displayOrders();
}

// Закрытие выпадающего списка фильтра заказов по клику снаружи
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('orderFilterDropdown');
    const btn = document.getElementById('orderFilterBtn');
    if (!dropdown || dropdown.classList.contains('hidden')) return;
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// ---- Создание и копирование заказа ----

async function createNewOrder() {
    const customerName = document.getElementById('orderCustomer').value;
    const date     = document.getElementById('orderDate').value;
    const status   = document.getElementById('orderStatus').value;
    if (!customerName || !date) { alert('Выберите клиента и укажите дату!'); return; }
    const cust = customers.find(c => c.name === customerName);
    if (!cust) { alert('Клиент не найден!'); return; }
    const discount = cust.discount || 0;
    const vatExempt = !!cust.vat_exempt;
    const employeeId = currentEmployee ? currentEmployee.id : null;
    showLoading();
    try {
        const { data, error } = await db.from('orders').insert({
            customer_id: cust.id, order_date: date, status, discount, vat_exempt: vatExempt, employee_id: employeeId
        }).select().single();
        if (error) throw error;
        const emp = employees.find(e => e.id === data.employee_id);
        const newOrder = {
            id: data.id, customer_id: cust.id, customer: cust.name,
            date: data.order_date, status: data.status, discount: Number(data.discount || 0),
            vat_exempt: !!data.vat_exempt,
            employee_id: data.employee_id || null, employee: emp ? emp.name : '',
            notes: '',
            items: []
        };
        orders.push(newOrder);
        displayOrders();
        openOrderDetail(newOrder.id);
        logActivity('order', `Создан заказ №${newOrder.id} для клиента «${cust.name}»`, newOrder.id);
        // сбросить форму
        document.getElementById('orderCustomer').value = '';
        document.getElementById('orderDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('orderStatus').value = 'принят';
    } catch (e) { console.error(e); alert('Ошибка создания заказа. Проверьте подключение.'); }
    finally { hideLoading(); }
}

async function copyOrder(i) {
    const o = orders[i];
    const employeeId = currentEmployee ? currentEmployee.id : null;
    showLoading();
    try {
        const { data, error } = await db.from('orders').insert({
            customer_id: o.customer_id,
            order_date: new Date().toISOString().split('T')[0],
            status: 'принят',
            discount: o.discount || 0,
            vat_exempt: !!o.vat_exempt,
            employee_id: employeeId
        }).select().single();
        if (error) throw error;

        const emp = employees.find(e => e.id === data.employee_id);
        const copy = {
            id: data.id, customer_id: o.customer_id, customer: o.customer,
            date: data.order_date, status: data.status, discount: Number(data.discount || 0),
            vat_exempt: !!data.vat_exempt,
            employee_id: data.employee_id || null, employee: emp ? emp.name : '',
            items: []
        };

        // Копируем позиции
        if (o.items.length) {
            const rows = o.items.map(it => ({
                order_id: copy.id, product_id: it.product_id, quantity: it.quantity, price: it.price
            }));
            const { data: itemsData, error: itemsErr } = await db.from('order_items').insert(rows).select();
            if (itemsErr) throw itemsErr;
            copy.items = (itemsData || []).map(it => {
                const prod = products.find(p => p.id === it.product_id);
                return { id: it.id, product_id: it.product_id, product: prod ? prod.name : it.product_id, quantity: Number(it.quantity), price: Number(it.price) };
            });
        }

        orders.push(copy);
        displayOrders();
        openOrderDetail(copy.id);
        logActivity('order', `Скопирован заказ №${o.id} → новый заказ №${copy.id} (клиент «${o.customer}»)`, copy.id);
    } catch (e) { console.error(e); alert('Ошибка копирования заказа. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// ==================== ЗАКАЗЫ — ДЕТАЛЬНЫЙ ВИД ====================
// Открытие/закрытие детального вида заказа, позиции, сохранение шапки.
// Зависит от: db, orders/customers/products/employees, currentOrderId/currentEmployee,
// orderTotal/orderDiscountAmount/orderVatAmount/orderGrandTotal (money.js),
// formatDateDMY (dates.js), showLoading/hideLoading, logActivity (employees.js),
// svgEdit/svgDelete, fillDetailCustomerSelect, updateProductSelects,
// updateCustomerSelects, openDeleteModal, closeModal, editIndex/editItemIdx (главный скрипт).

function openOrderDetail(orderId) {
    currentOrderId = orderId;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Скрыть список, показать детальный вид
    document.getElementById('ordersList').classList.add('hidden');
    document.getElementById('orderDetail').classList.add('active');

    document.getElementById('detailOrderId').textContent = `Заказ #${orderId}`;

    // Заполнить шапку
    fillDetailCustomerSelect(order.customer);
    document.getElementById('detailDate').value     = order.date;
    document.getElementById('detailStatus').value   = order.status;
    document.getElementById('detailDiscount').value = (order.discount || 0);
    document.getElementById('detailVatExempt').checked = !!order.vat_exempt;
    document.getElementById('detailNotes').value = order.notes || '';
    fillDetailEmployeeSelect(order.employee_id);

    renderDetailItems(order);
    updateProductSelects();
}

function fillDetailEmployeeSelect(selectedId) {
    const sel = document.getElementById('detailEmployee');
    if (!sel) return;
    sel.innerHTML = '<option value="">—</option>';
    employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.textContent = e.name;
        if (selectedId && String(e.id) === String(selectedId)) opt.selected = true;
        sel.appendChild(opt);
    });
}

function onDetailCustomerChange() {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    const customerName = document.getElementById('detailCustomer').value;
    const cust = customers.find(c => c.name === customerName);
    // Подставить скидку и НДС-статус клиента (но всегда редактируемо)
    if (cust) {
        document.getElementById('detailDiscount').value = cust.discount || 0;
        document.getElementById('detailVatExempt').checked = !!cust.vat_exempt;
    }
    saveDetailHeader();
}

function closeOrderDetail() {
    currentOrderId = null;
    document.getElementById('ordersList').classList.remove('hidden');
    document.getElementById('orderDetail').classList.remove('active');
    displayOrders();
}

async function saveDetailHeader() {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    const customerName = document.getElementById('detailCustomer').value.trim();
    const date     = document.getElementById('detailDate').value;
    const status   = document.getElementById('detailStatus').value;
    const discount = parseFloat(document.getElementById('detailDiscount').value) || 0;
    const vatExempt = document.getElementById('detailVatExempt').checked;
    const notes = document.getElementById('detailNotes').value;
    const employeeIdRaw = document.getElementById('detailEmployee').value;
    const employeeId = employeeIdRaw ? Number(employeeIdRaw) : null;

    // Клиента переподбираем только если поле реально изменилось (а не на каждое
    // сохранение любого другого поля) — иначе правка статуса/НДС/скидки ломалась бы,
    // если по любой причине (например, пустое имя клиента в базе) поле "Клиент"
    // не совпадает 1-в-1 с текущим списком клиентов.
    let custId = order.customer_id;
    let custName = order.customer;
    if (customerName !== (order.customer || '')) {
        const cust = customers.find(c => c.name === customerName);
        if (!cust) {
            alert(`Клиент «${customerName}» не найден в списке. Выберите клиента из выпадающего списка.`);
            document.getElementById('detailCustomer').value = order.customer || ''; // откатываем поле
            return;
        }
        custId = cust.id;
        custName = cust.name;
    }

    // Запоминаем прежние значения для журнала
    const old = { customer: order.customer, date: order.date, status: order.status, discount: order.discount, employee: order.employee, notes: order.notes || '' };

    showLoading();
    try {
        const { error } = await db.from('orders').update({
            customer_id: custId, order_date: date, status, discount, vat_exempt: vatExempt, employee_id: employeeId, notes
        }).eq('id', order.id);
        if (error) throw error;
        const emp = employees.find(e => e.id === employeeId);
        order.customer_id = custId;
        order.customer    = custName;
        order.date        = date;
        order.status      = status;
        order.discount    = discount;
        order.vat_exempt  = vatExempt;
        order.employee_id = employeeId;
        order.employee    = emp ? emp.name : '';
        order.notes       = notes;
        renderDetailItems(order);

        // Журнал: фиксируем только реально изменившиеся поля
        const changes = [];
        if (old.customer !== order.customer) changes.push(`клиент «${old.customer}» → «${order.customer}»`);
        if (old.date !== order.date) changes.push(`дата ${formatDateDMY(old.date)} → ${formatDateDMY(order.date)}`);
        if (old.status !== order.status) changes.push(`статус «${old.status}» → «${order.status}»`);
        if (old.discount !== order.discount) changes.push(`скидка ${old.discount}% → ${order.discount}%`);
        if ((old.employee || '') !== (order.employee || '')) changes.push(`исполнитель «${old.employee || '—'}» → «${order.employee || '—'}»`);
        if (old.notes !== order.notes) changes.push(`комментарий изменён`);
        if (changes.length) logActivity('order', `Изменён заказ №${order.id}: ${changes.join(', ')}`, order.id);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function renderDetailItems(order) {
    const tbody = document.getElementById('detailItemsBody');
    tbody.innerHTML = '';
    if (!order.items || !order.items.length) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" class="text-center text-xs text-gray-400 py-2">Нет позиций. Добавьте изделие ниже.</td>`;
        tbody.appendChild(row);
    } else {
        order.items.forEach((item, i) => {
            const total = (item.quantity * item.price).toFixed(2);
            const prod = products.find(p => p.id === item.product_id);
            const unitLabel = prod && prod.unit ? (UNIT_PRODUCT_LABELS[prod.unit] || '') : '';
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-0.5 text-xs">${escapeHtml(item.product)}</td>
                <td class="p-0.5 text-xs text-center">${item.quantity}${unitLabel ? ' ' + unitLabel : ''}</td>
                <td class="p-0.5 text-xs text-center">${item.price.toFixed(2)}</td>
                <td class="p-0.5 text-xs text-center font-medium">${total}</td>
                <td class="p-0.5 text-center">
                    ${svgEdit(`openEditItemModal(${i})`)}
                    ${svgDelete(`deleteItem(${i})`)}
                </td>`;
            tbody.appendChild(row);
        });
    }
    // Итого
    const totQty    = (order.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
    const subtotal  = orderTotal(order);
    const discPct   = order.discount || 0;
    const discAmt   = orderDiscountAmount(order);
    const vatAmt    = orderVatAmount(order);
    const grand     = orderGrandTotal(order);

    document.getElementById('detailItemsCount').textContent   = totQty;
    document.getElementById('detailSubtotal').textContent     = subtotal.toFixed(2) + ' €';
    document.getElementById('detailDiscountPct').textContent  = discPct;
    document.getElementById('detailDiscountAmount').textContent = '-' + discAmt.toFixed(2) + ' €';
    document.getElementById('detailVatAmount').textContent    = vatAmt.toFixed(2) + ' €';
    document.getElementById('detailTotal').textContent        = grand.toFixed(2) + ' €';

    // Скрыть строку скидки если скидки нет
    document.getElementById('detailDiscountRow').style.display = discPct > 0 ? '' : 'none';

    // Себестоимость и прибыль (от суммы после скидки, без НДС)
    const cost   = orderCost(order);
    const profit = orderProfit(order);
    const afterDiscount = orderAfterDiscount(order);
    const profitPct = afterDiscount > 0 ? (profit / afterDiscount * 100) : 0;

    const costEl = document.getElementById('detailCost');
    const profitEl = document.getElementById('detailProfit');
    const profitPctEl = document.getElementById('detailProfitPct');
    if (costEl) costEl.textContent = cost.toFixed(2) + ' €';
    if (profitEl) {
        profitEl.textContent = profit.toFixed(2) + ' €';
        profitEl.className = profit >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-600';
    }
    if (profitPctEl) profitPctEl.textContent = profitPct.toFixed(1);
}

async function addItemToOrder() {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    const productName = document.getElementById('newItemProduct').value;
    const quantity = parseFloat(document.getElementById('newItemQty').value);
    const price    = parseFloat(document.getElementById('newItemPrice').value);
    if (!productName || isNaN(quantity) || quantity <= 0 || isNaN(price)) {
        alert('Заполните изделие, количество и цену!'); return;
    }
    const prod = products.find(p => p.name === productName);
    if (!prod) { alert('Изделие не найдено!'); return; }

    showLoading();
    try {
        const { data, error } = await db.from('order_items').insert({
            order_id: order.id, product_id: prod.id, quantity, price: parseFloat(price.toFixed(2))
        }).select().single();
        if (error) throw error;
        order.items.push({ id: data.id, product_id: prod.id, product: prod.name, quantity: Number(data.quantity), price: Number(data.price) });
        renderDetailItems(order);
        logActivity('item', `Добавлена позиция в заказ №${order.id}: «${prod.name}» × ${quantity}`, order.id);
        // Сбросить поля
        document.getElementById('newItemProduct').value = '';
        document.getElementById('newItemQty').value    = '';
        document.getElementById('newItemPrice').value  = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function autoFillNewItemPrice() {
    const name = document.getElementById('newItemProduct').value;
    const p = products.find(pr => pr.name === name);
    if (p) {
        document.getElementById('newItemPrice').value = p.price.toFixed(2);
        const qtyField = document.getElementById('newItemQty');
        if (p.unit === 'kg') qtyField.placeholder = 'кг, напр. 1.4';
        else if (p.unit === 'pcs') qtyField.placeholder = 'шт';
        else qtyField.placeholder = '1';
    }
}

function openEditItemModal(itemIdx) {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    editItemIdx = itemIdx;
    const item = order.items[itemIdx];

    // Подставить текущее значение в поле поиска изделия
    const sel = document.getElementById('editItemProduct');
    updateProductSelects();
    sel.value = item.product;
    document.getElementById('editItemQty').value   = item.quantity;
    document.getElementById('editItemPrice').value = item.price.toFixed(2);
    document.getElementById('editItemModal').style.display = 'flex';
}

function autoFillEditItemPrice() {
    const name = document.getElementById('editItemProduct').value;
    const p = products.find(pr => pr.name === name);
    if (p) document.getElementById('editItemPrice').value = p.price.toFixed(2);
}

async function saveItemEdit() {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order || editItemIdx === null) return;
    const productName = document.getElementById('editItemProduct').value;
    const quantity = parseFloat(document.getElementById('editItemQty').value);
    const price    = parseFloat(document.getElementById('editItemPrice').value);
    if (!productName || isNaN(quantity) || quantity <= 0 || isNaN(price)) {
        alert('Заполните все поля корректно!'); return;
    }
    const prod = products.find(p => p.name === productName);
    if (!prod) { alert('Изделие не найдено!'); return; }
    const item = order.items[editItemIdx];
    const oldDesc = `«${item.product}» × ${item.quantity}`;

    showLoading();
    try {
        const { error } = await db.from('order_items').update({
            product_id: prod.id, quantity, price: parseFloat(price.toFixed(2))
        }).eq('id', item.id);
        if (error) throw error;
        order.items[editItemIdx] = { id: item.id, product_id: prod.id, product: prod.name, quantity, price: parseFloat(price.toFixed(2)) };
        renderDetailItems(order);
        closeModal();
        logActivity('item', `Изменена позиция в заказе №${order.id}: ${oldDesc} → «${prod.name}» × ${quantity}`, order.id);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function deleteItem(itemIdx) {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    const item = order.items[itemIdx];
    openDeleteModal(itemIdx, 'item', `позицию «${item.product}»`);
}

// ==================== МОДАЛЬНЫЕ ОКНА ЗАКАЗА (из списка) ====================
function openEditOrderModal(i) {
    editIndex = i;
    const o = orders[i];
    document.getElementById('editOrderCustomer').value = o.customer;
    document.getElementById('editOrderDate').value   = o.date;
    document.getElementById('editOrderStatus').value = o.status;
    document.getElementById('editOrderModal').style.display = 'flex';
}

async function saveOrderEdit() {
    const customerName = document.getElementById('editOrderCustomer').value;
    const date     = document.getElementById('editOrderDate').value;
    const status   = document.getElementById('editOrderStatus').value;
    if (!customerName || !date) { alert('Заполните все поля!'); return; }
    const cust = customers.find(c => c.name === customerName);
    if (!cust) { alert('Клиент не найден!'); return; }
    const order = orders[editIndex];
    const old = { customer: order.customer, date: order.date, status: order.status };

    showLoading();
    try {
        const { error } = await db.from('orders').update({
            customer_id: cust.id, order_date: date, status
        }).eq('id', order.id);
        if (error) throw error;
        order.customer_id = cust.id;
        order.customer    = cust.name;
        order.date        = date;
        order.status      = status;
        displayOrders(); closeModal();
        const changes = [];
        if (old.customer !== order.customer) changes.push(`клиент «${old.customer}» → «${order.customer}»`);
        if (old.date !== order.date) changes.push(`дата ${formatDateDMY(old.date)} → ${formatDateDMY(order.date)}`);
        if (old.status !== order.status) changes.push(`статус «${old.status}» → «${order.status}»`);
        if (changes.length) logActivity('order', `Изменён заказ №${order.id}: ${changes.join(', ')}`, order.id);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}
