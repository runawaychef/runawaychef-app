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

// SVG-иконки (глянцевые кружки с градиентом, 18x18, впишутся в прежние размеры w-4 h-4)
let _svgIconUid = 0;
function svgEdit(onclick) {
    const uid = 'gradEdit' + (_svgIconUid++);
    return `<svg class="inline mr-0.5 cursor-pointer" width="18" height="18" viewBox="0 0 22 22" title="Редактировать" onclick="${onclick}"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><circle cx="11" cy="11" r="11" fill="url(#${uid})"/><path fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M8 14l.7-2.6 4.3-4.3 1.9 1.9-4.3 4.3z"/></svg>`;
}
function svgDelete(onclick) {
    const uid = 'gradDelete' + (_svgIconUid++);
    return `<svg class="inline mr-0.5 cursor-pointer" width="18" height="18" viewBox="0 0 22 22" title="Удалить" onclick="${onclick}"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f87171"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><circle cx="11" cy="11" r="11" fill="url(#${uid})"/><path fill="none" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M7 8h8M9.3 8V6.8a1 1 0 011-1h1.4a1 1 0 011 1V8M8 8l.5 6.3a1 1 0 001 .9h3a1 1 0 001-.9L14 8"/></svg>`;
}
function svgCopy(onclick) {
    const uid = 'gradCopy' + (_svgIconUid++);
    return `<svg class="inline mr-0.5 cursor-pointer" width="18" height="18" viewBox="0 0 22 22" title="Копировать" onclick="${onclick}"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ade80"/><stop offset="100%" stop-color="#16a34a"/></linearGradient></defs><circle cx="11" cy="11" r="11" fill="url(#${uid})"/><path fill="none" stroke="white" stroke-width="1.4" d="M8.5 8.5h5v5h-5z"/><path fill="none" stroke="white" stroke-width="1.4" stroke-linecap="round" d="M7 7H6.8a1 1 0 00-1 1v5"/></svg>`;
}
