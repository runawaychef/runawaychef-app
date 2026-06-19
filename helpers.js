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

// ==================== ПОИСКОВЫЙ ВЫПАДАЮЩИЙ СПИСОК ====================
// Заменяет нативный <select>/<datalist> своим вертикальным списком
// (на iOS Safari datalist либо не работает, либо рисуется горизонтальной лентой).
// inputId      — id текстового поля ввода
// dropdownId   — id пустого <div class="search-dropdown hidden"> рядом с полем
// getItems()   — функция, возвращающая актуальный массив строк (названий) на момент открытия
// onPick(name) — необязательный колбэк, вызывается после выбора варианта из списка
function setupSearchDropdown(inputId, dropdownId, getItems, onPick) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    if (input.dataset.searchInit === '1') return; // уже инициализировано — не дублируем обработчики
    input.dataset.searchInit = '1';

    function render(filterText) {
        const items = getItems() || [];
        const q = (filterText || '').trim().toLowerCase();
        const filtered = q ? items.filter(name => name.toLowerCase().includes(q)) : items;
        dropdown.innerHTML = '';
        if (!filtered.length) { dropdown.classList.add('hidden'); return; }
        filtered.forEach(name => {
            const row = document.createElement('div');
            row.className = 'search-dropdown-item';
            row.textContent = name;
            // mousedown (а не click) — срабатывает раньше blur, иначе список успевает скрыться
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = name;
                dropdown.classList.add('hidden');
                if (onPick) onPick(name);
            });
            dropdown.appendChild(row);
        });
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => render(''));      // по клику — полный список, как раньше
    input.addEventListener('input', () => render(input.value)); // по вводу — фильтрация
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 150));
}

function updateProductSelects() {
    // Для строки добавления / редактирования позиции в детальном виде заказа
    setupSearchDropdown('newItemProduct', 'newItemProductDropdown',
        () => products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p => p.name),
        () => autoFillNewItemPrice());
    setupSearchDropdown('editItemProduct', 'editItemProductDropdown',
        () => products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p => p.name),
        () => autoFillEditItemPrice());
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
