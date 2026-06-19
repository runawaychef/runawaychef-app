// ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
// Заполнение выпадающих списков (изделия/клиенты) и SVG-иконки действий
// (редактировать/удалить/копировать), используемые во всех модулях.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: products/customers (главный скрипт).

// Экранирование пользовательских строк перед вставкой через innerHTML
// (защита от XSS, если в имя клиента/товара/заметку попадут HTML-теги).
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function updateProductSelects() {
    // Для строки добавления позиции в детальном виде
    fillNewItemProductSelect();
    fillEditItemProductList();
}

function fillNewItemProductSelect() {
    const list = document.getElementById('newItemProductList');
    if (!list) return;
    list.innerHTML = '';
    products.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        list.appendChild(opt);
    });
}

function fillEditItemProductList() {
    const list = document.getElementById('editItemProductList');
    if (!list) return;
    list.innerHTML = '';
    products.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        list.appendChild(opt);
    });
}

function updateCustomerSelects() {
    fillDetailCustomerSelect('');
    updateCustomerSelectInModal('editOrderCustomer', '');
}

function fillDetailCustomerSelect(selected) {
    const sel = document.getElementById('detailCustomer');
    if (!sel) return;
    sel.innerHTML = '<option value="">Выберите клиента</option>';
    customers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name; opt.textContent = c.name;
        if (c.name === selected) opt.selected = true;
        sel.appendChild(opt);
    });

    // Для формы нового заказа
    const sel2 = document.getElementById('orderCustomer');
    if (sel2) {
        const prev = sel2.value;
        sel2.innerHTML = '<option value="">Выберите клиента</option>';
        customers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name; opt.textContent = c.name;
            if (c.name === prev) opt.selected = true;
            sel2.appendChild(opt);
        });
    }
}

function updateCustomerSelectInModal(selId, selected) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Выберите клиента</option>';
    customers.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name; opt.textContent = c.name;
        if (c.name === selected) opt.selected = true;
        sel.appendChild(opt);
    });
}

// SVG-иконки
function svgEdit(onclick) {
    return `<svg class="w-4 h-4 text-blue-500 hover:text-blue-700 inline mr-0.5 cursor-pointer" title="Редактировать" fill="none" stroke="currentColor" viewBox="0 0 24 24" onclick="${onclick}"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z"/></svg>`;
}
function svgDelete(onclick) {
    return `<svg class="w-4 h-4 text-red-500 hover:text-red-700 inline mr-0.5 cursor-pointer" title="Удалить" fill="none" stroke="currentColor" viewBox="0 0 24 24" onclick="${onclick}"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0h4m-7 4h10"/></svg>`;
}
function svgCopy(onclick) {
    return `<svg class="w-4 h-4 text-green-500 hover:text-green-700 inline mr-0.5 cursor-pointer" title="Копировать" fill="none" stroke="currentColor" viewBox="0 0 24 24" onclick="${onclick}"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`;
}
