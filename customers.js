// ==================== КЛИЕНТЫ ====================
// Список клиентов: отображение, добавление, редактирование (скидка, флажок «Без НДС»).
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), customers/orders (главный скрипт),
// showLoading/hideLoading, logActivity (employees.js),
// svgEdit/svgDelete, updateCustomerSelects, updateStatsCustomerFilter,
// updateOrderCustomerFilter, openDeleteModal, closeModal (главный скрипт).

function displayCustomers() {
    customers.sort((a, b) => a.name.localeCompare(b.name));
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';
    customers.forEach((c, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="border p-0.5 text-xs">${escapeHtml(c.name)}</td>
            <td class="border p-0.5 text-xs">${escapeHtml(c.contact)}</td>
            <td class="border p-0.5 text-xs">${c.discount.toFixed(2)}</td>
            <td class="border p-0.5 text-xs text-center">${c.vat_exempt ? '✓' : ''}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditCustomerModal(${i})`)}
                ${svgDelete(`openDeleteModal(${i},'customer','клиента «${c.name}»')`)}
            </td>`;
        tbody.appendChild(row);
    });
    updateCustomerSelects();
    updateStatsCustomerFilter();
    updateOrderCustomerFilter();
}

async function addCustomer() {
    const name     = document.getElementById('customerName').value.trim();
    const contact  = document.getElementById('customerContact').value.trim();
    const discount = parseFloat(document.getElementById('customerDiscount').value) || 0;
    const vatExempt = document.getElementById('customerVatExempt').checked;
    if (!name || !contact) { alert('Заполните все поля корректно!'); return; }
    showLoading();
    try {
        const { data, error } = await db.from('customers').insert({ name, contact, discount: parseFloat(discount.toFixed(2)), vat_exempt: vatExempt }).select().single();
        if (error) throw error;
        customers.push({ id: data.id, name: data.name, contact: data.contact || '', discount: Number(data.discount || 0), vat_exempt: !!data.vat_exempt });
        displayCustomers();
        logActivity('customer', `Добавлен клиент «${name}»`);
        document.getElementById('customerName').value    = '';
        document.getElementById('customerContact').value = '';
        document.getElementById('customerDiscount').value = '';
        document.getElementById('customerVatExempt').checked = false;
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function openEditCustomerModal(i) {
    editIndex = i;
    document.getElementById('editCustomerName').value     = customers[i].name;
    document.getElementById('editCustomerContact').value  = customers[i].contact;
    document.getElementById('editCustomerDiscount').value = customers[i].discount.toFixed(2);
    document.getElementById('editCustomerVatExempt').checked = !!customers[i].vat_exempt;
    document.getElementById('editCustomerModal').style.display = 'flex';
}

async function saveCustomerEdit() {
    const name     = document.getElementById('editCustomerName').value.trim();
    const contact  = document.getElementById('editCustomerContact').value.trim();
    const discount = parseFloat(document.getElementById('editCustomerDiscount').value) || 0;
    const vatExempt = document.getElementById('editCustomerVatExempt').checked;
    if (!name || !contact) { alert('Заполните все поля корректно!'); return; }
    const cust = customers[editIndex];
    const oldName = cust.name;
    showLoading();
    try {
        const { error } = await db.from('customers').update({ name, contact, discount: parseFloat(discount.toFixed(2)), vat_exempt: vatExempt }).eq('id', cust.id);
        if (error) throw error;
        cust.name = name; cust.contact = contact; cust.discount = parseFloat(discount.toFixed(2)); cust.vat_exempt = vatExempt;
        // Обновить имя клиента в кэше заказов
        orders.forEach(o => { if (o.customer_id === cust.id) o.customer = name; });
        displayCustomers(); closeModal();
        logActivity('customer', `Изменён клиент «${oldName}»${oldName !== name ? ` → «${name}»` : ''}`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}
