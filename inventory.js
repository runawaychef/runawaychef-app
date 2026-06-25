// ==================== СКЛАД ====================
// Учёт остатков ингредиентов: приход (ручной), расход (автоматически из заказов).
// Зависит от: db, ingredients, orders, semiFinished, products, UNIT_LABELS,
//             showLoading, hideLoading, showInfo, showConfirm, closeModal, logActivity.

const STOCK_LOW_DAYS = 7; // порог «критически мало» — менее N дней запаса

// Дата начала учёта склада — списание только для заказов начиная с этой даты
let _inventoryStartDate = localStorage.getItem('inventoryStartDate') || '2026-06-26';

function saveInventoryStartDate() {
    const val = document.getElementById('inventoryStartDate').value;
    if (!val) { showInfo('Выберите дату!'); return; }
    _inventoryStartDate = val;
    localStorage.setItem('inventoryStartDate', val);
    showInfo(`Учёт склада ведётся с ${formatDateDMY(val)}`);
}

function openSettingsModal() {
    document.getElementById('settingsCurrentEmployee').textContent = currentEmployee ? currentEmployee.name : '—';
    document.getElementById('inventoryStartDate').value = _inventoryStartDate;
    document.getElementById('settingsModal').style.display = 'flex';
}

// Кэш данных склада: { ingredient_id: { total_in, total_out, balance } }
let _inventoryCache = {};

// ── Загрузка и расчёт остатков ──────────────────────────────────────────────

async function loadInventory() {
    try {
        const { data, error } = await db
            .from('inventory')
            .select('ingredient_id, type, quantity')
            .limit(50000);
        if (error) throw error;

        // Считаем баланс по каждому ингредиенту
        const cache = {};
        (data || []).forEach(row => {
            if (!cache[row.ingredient_id]) cache[row.ingredient_id] = { in: 0, out: 0 };
            if (row.type === 'приход') cache[row.ingredient_id].in  += Number(row.quantity);
            if (row.type === 'расход') cache[row.ingredient_id].out += Number(row.quantity);
            if (row.type === 'сторно') cache[row.ingredient_id].out -= Number(row.quantity); // возврат
        });
        _inventoryCache = cache;
        updateInventoryAlertDot();
    } catch (e) { console.error('Ошибка загрузки склада:', e); }
}

// Возвращает текущий остаток ингредиента
function getIngredientBalance(ingId) {
    const c = _inventoryCache[ingId];
    if (!c) return null; // нет данных
    return parseFloat((c.in - c.out).toFixed(4));
}

// Средний расход ингредиента в день за последние 30 дней из выполненных заказов
function avgDailyUsage(ingId) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let totalUsed = 0;
    orders.forEach(o => {
        if (o.date < cutoffStr) return;
        (o.items || []).forEach(item => {
            const prod = products.find(p => p.id === item.product_id);
            if (!prod || !prod.ingredients) return;
            prod.ingredients.forEach(ri => {
                if (ri.ingredient_id === ingId && !ri.semi_finished_id) {
                    totalUsed += (Number(ri.quantity) / Number(prod.batch_size || 1)) * Number(item.quantity);
                }
                // Полуфабрикаты
                if (ri.semi_finished_id) {
                    const sf = semiFinished.find(s => s.id === ri.semi_finished_id);
                    if (!sf || !sf.ingredients) return;
                    sf.ingredients.forEach(sfi => {
                        if (sfi.ingredient_id === ingId) {
                            const sfFactor = Number(ri.quantity) / Number(sf.batch_size || 1);
                            totalUsed += (Number(sfi.quantity) * sfFactor / Number(prod.batch_size || 1)) * Number(item.quantity);
                        }
                    });
                }
            });
        });
    });

    return totalUsed / 30; // в день
}

// Показывает/скрывает пульсирующую точку на иконке корзины
function updateInventoryAlertDot() {
    const dot = document.getElementById('inventoryAlertDot');
    if (!dot) return;

    // 1. Проверяем изделия с галочкой track_stock — постоянный мониторинг
    const trackedIngIds = new Set();
    (products || []).filter(p => p.track_stock).forEach(prod => {
        (prod.ingredients || []).forEach(ri => {
            if (ri.ingredient_id) trackedIngIds.add(ri.ingredient_id);
        });
    });
    const hasLowTracked = [...trackedIngIds].some(ingId => {
        const balance = getIngredientBalance(ingId);
        if (balance === null || balance <= 0) return false;
        const daily = avgDailyUsage(ingId);
        if (!daily) return false;
        return (balance / daily) < STOCK_LOW_DAYS;
    });

    // 2. Проверяем принятые заказы — хватит ли ингредиентов
    const today = getLocalDateStr(0);
    const pendingOrders = (orders || []).filter(o => o.status !== 'выполнен' && o.date >= today);
    let hasShortage = false;
    if (!hasLowTracked) {
        const needed = {}; // ingredient_id -> нужно
        pendingOrders.forEach(o => {
            (o.items || []).forEach(item => {
                const prod = products.find(p => p.id === item.product_id);
                if (!prod || !prod.ingredients) return;
                const factor = 1 / Number(prod.batch_size || 1);
                prod.ingredients.forEach(ri => {
                    if (!ri.ingredient_id) return;
                    const qty = Number(ri.quantity) * Number(item.quantity) * factor;
                    needed[ri.ingredient_id] = (needed[ri.ingredient_id] || 0) + qty;
                });
            });
        });
        hasShortage = Object.entries(needed).some(([ingId, qty]) => {
            const balance = getIngredientBalance(Number(ingId));
            return balance !== null && balance < qty;
        });
    }

    dot.classList.toggle('hidden', !hasLowTracked && !hasShortage);
}

// ── Открытие окна склада ─────────────────────────────────────────────────────

async function openInventoryModal() {
    showLoading('Загружаю склад...');
    await loadInventory();
    hideLoading();

    const UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };

    // Считаем нехватку для принятых заказов
    const today = getLocalDateStr(0);
    const neededForOrders = {};
    (orders || []).filter(o => o.status !== 'выполнен' && o.date >= today).forEach(o => {
        (o.items || []).forEach(item => {
            const prod = products.find(p => p.id === item.product_id);
            if (!prod || !prod.ingredients) return;
            const factor = 1 / Number(prod.batch_size || 1);
            prod.ingredients.forEach(ri => {
                if (!ri.ingredient_id) return;
                neededForOrders[ri.ingredient_id] = (neededForOrders[ri.ingredient_id] || 0) +
                    Number(ri.quantity) * Number(item.quantity) * factor;
            });
        });
    });

    // Сортируем по алфавиту и разбиваем на три группы
    const sorted = ingredients.slice().sort((a, b) => (a.name||'').localeCompare(b.name||''));
    const red    = []; // < 3 дней или нехватка для заказа
    const yellow = []; // 3-7 дней
    const rest   = []; // всё остальное

    sorted.forEach(ing => {
        const balance  = getIngredientBalance(ing.id);
        const daily    = avgDailyUsage(ing.id);
        const daysLeft = (balance !== null && balance > 0 && daily > 0) ? Math.floor(balance / daily) : null;
        const shortage = neededForOrders[ing.id] > 0 && (balance === null || balance < neededForOrders[ing.id]);
        const unitLabel = UNIT_LABELS[ing.unit] || ing.unit;
        const item = { ing, balance, daysLeft, unitLabel, shortage };

        if (shortage || (balance !== null && balance <= 0) || (daysLeft !== null && daysLeft < 3)) {
            red.push(item);
        } else if (daysLeft !== null && daysLeft < 7) {
            yellow.push(item);
        } else {
            rest.push(item);
        }
    });

    function renderRow(item, bgClass, daysClass) {
        const { ing, balance, daysLeft, unitLabel, shortage } = item;
        const balanceStr = balance !== null ? `${Number(balance).toFixed(1)} ${unitLabel}` : '—';
        const daysStr    = shortage ? 'нехватка' : daysLeft !== null ? `~${daysLeft} дн.` : '—';
        return `<tr class="border-b ${bgClass}">
            <td class="p-1 text-xs">${escapeHtml(ing.name)}</td>
            <td class="p-1 text-xs text-right">${balanceStr}</td>
            <td class="p-1 text-xs text-right ${daysClass} font-semibold">${daysStr}</td>
        </tr>`;
    }

    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100 sticky top-0"><th class="p-1 text-left">Ингредиент</th><th class="p-1 text-right">Остаток</th><th class="p-1 text-right">Хватит</th></tr></thead><tbody>';

    if (red.length) {
        html += `<tr><td colspan="3" class="p-1 text-xs font-semibold text-red-600 bg-red-50">🔴 Критично</td></tr>`;
        red.forEach(item => { html += renderRow(item, 'bg-red-50', 'text-red-600'); });
    }
    if (yellow.length) {
        html += `<tr><td colspan="3" class="p-1 text-xs font-semibold text-yellow-700 bg-yellow-50">🟡 Заканчивается</td></tr>`;
        yellow.forEach(item => { html += renderRow(item, 'bg-yellow-50', 'text-yellow-700'); });
    }
    if (rest.length) {
        if (red.length || yellow.length) {
            html += `<tr><td colspan="3" class="p-1 text-xs font-semibold text-gray-500 bg-gray-50">Остальные</td></tr>`;
        }
        rest.forEach(item => { html += renderRow(item, '', 'text-gray-500'); });
    }

    html += '</tbody></table>';
    document.getElementById('inventoryContent').innerHTML = html;
    document.getElementById('inventoryModal').style.display = 'flex';
}

// ── Инвентаризация ───────────────────────────────────────────────────────────

function openInventarizationModal() {
    const UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
    const sorted = ingredients.slice().sort((a, b) => (a.name||'').localeCompare(b.name||''));
    const today  = getLocalDateStr(0);

    let html = '<table class="w-full text-xs">';
    html += '<thead><tr class="bg-gray-100"><th class="p-1 text-left">Ингредиент</th><th class="p-1 text-right">Текущий остаток</th><th class="p-1 text-right">Фактически</th></tr></thead><tbody>';
    sorted.forEach(ing => {
        const unitLabel = UNIT_LABELS[ing.unit] || ing.unit;
        const balance   = getIngredientBalance(ing.id);
        const balStr    = balance !== null ? `${Number(balance).toFixed(2)} ${unitLabel}` : '—';
        html += `<tr class="border-b">
            <td class="p-1">${escapeHtml(ing.name)}</td>
            <td class="p-1 text-right text-gray-500">${balStr}</td>
            <td class="p-1 text-right">
                <input type="number" inputmode="decimal" step="0.01" min="0"
                    data-ing-id="${ing.id}" data-unit="${unitLabel}"
                    class="inv-qty-input border p-0.5 rounded text-xs w-24 text-right"
                    placeholder="${unitLabel}">
            </td>
        </tr>`;
    });
    html += '</tbody></table>';

    document.getElementById('inventarizationContent').innerHTML = html;
    document.getElementById('inventarizationModal').style.display = 'flex';
}

async function saveInventarization() {
    const inputs = document.querySelectorAll('.inv-qty-input');
    const today  = getLocalDateStr(0);
    const rows   = [];

    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (isNaN(val) || input.value === '') return; // пропускаем пустые
        const ingId   = Number(input.dataset.ingId);
        const balance = getIngredientBalance(ingId) || 0;
        const diff    = parseFloat((val - balance).toFixed(4));
        if (Math.abs(diff) < 0.0001) return; // разницы нет — пропускаем
        rows.push({
            ingredient_id: ingId,
            type:     diff > 0 ? 'приход' : 'расход',
            quantity: Math.abs(diff),
            notes:    `Инвентаризация ${today}`
        });
    });

    if (!rows.length) {
        await showInfo('Нет изменений — все фактические остатки совпадают с текущими.');
        return;
    }

    const ok = await showConfirm(`Записать ${rows.length} корректировок по результатам инвентаризации?`);
    if (!ok) return;

    showLoading('Сохраняю инвентаризацию...');
    try {
        const { error } = await db.from('inventory').insert(rows);
        if (error) throw error;
        await loadInventory();
        closeModal();
        displayIngredients();
        logActivity('inventory', `Инвентаризация ${today}: скорректировано ${rows.length} позиций`);
        await showInfo(`Инвентаризация сохранена. Скорректировано: ${rows.length} позиций.`);
    } catch(e) { console.error(e); showInfo('Ошибка сохранения.'); }
    finally { hideLoading(); }
}

// ── Пополнение склада ────────────────────────────────────────────────────────

function openInventoryAddModal(ingId) {
    const ing = ingredients.find(i => i.id === ingId);
    if (!ing) return;
    const UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
    document.getElementById('inventoryAddTitle').textContent = `Пополнить: ${ing.name}`;
    document.getElementById('inventoryAddIngId').value = ingId;
    document.getElementById('inventoryAddUnit').textContent = UNIT_LABELS[ing.unit] || ing.unit;
    document.getElementById('inventoryAddQty').value = '';
    document.getElementById('inventoryAddNotes').value = '';
    document.getElementById('inventoryAddModal').style.display = 'flex';
}

async function saveInventoryAdd() {
    const ingId = Number(document.getElementById('inventoryAddIngId').value);
    const qty   = parseFloat(document.getElementById('inventoryAddQty').value);
    const notes = document.getElementById('inventoryAddNotes').value.trim();
    if (!ingId || isNaN(qty) || qty <= 0) { showInfo('Введите корректное количество!'); return; }
    showLoading();
    try {
        const { error } = await db.from('inventory').insert({
            ingredient_id: ingId,
            type: 'приход',
            quantity: parseFloat(qty.toFixed(4)),
            notes: notes || null
        });
        if (error) throw error;
        closeModal();
        const ing = ingredients.find(i => i.id === ingId);
        logActivity('inventory', `Пополнен склад: «${ing ? ing.name : ingId}» +${qty}`);
        await loadInventory();
        // Обновляем окно склада
        await openInventoryModal();
    } catch (e) { console.error(e); showInfo('Ошибка сохранения.'); }
    finally { hideLoading(); }
}

// ── Списание при создании заказа ─────────────────────────────────────────────

// Вызывается при добавлении позиции в заказ
async function writeOffInventoryForItem(prod, itemQty, orderId) {
    // Списываем только для заказов начиная с даты начала учёта склада
    const order = orders.find(o => o.id === orderId);
    if (!order || order.date < _inventoryStartDate) return;
    if (!prod || !prod.ingredients || !prod.ingredients.length) return;
    const rows = [];
    const qtyFactor = 1 / Number(prod.batch_size || 1);

    function collectForWriteOff(recipeItems, factor) {
        recipeItems.forEach(ri => {
            if (ri.semi_finished_id) {
                const sf = semiFinished.find(s => s.id === ri.semi_finished_id);
                if (!sf || !sf.ingredients) return;
                const sfFactor = Number(ri.quantity) / Number(sf.batch_size || 1);
                collectForWriteOff(sf.ingredients, factor * sfFactor);
            } else if (ri.ingredient_id) {
                const totalQty = Number(ri.quantity) * itemQty * factor;
                const existing = rows.find(r => r.ingredient_id === ri.ingredient_id);
                if (existing) { existing.quantity += totalQty; }
                else { rows.push({ ingredient_id: ri.ingredient_id, quantity: totalQty }); }
            }
        });
    }

    collectForWriteOff(prod.ingredients, qtyFactor);
    if (!rows.length) return;

    try {
        await db.from('inventory').insert(rows.map(r => ({
            ingredient_id: r.ingredient_id,
            type: 'расход',
            quantity: parseFloat(r.quantity.toFixed(4)),
            order_id: orderId,
            notes: `Заказ #${orderId}`
        })));
        await loadInventory();
    } catch (e) { console.error('Ошибка списания со склада:', e); }
}

// Сторнирование при удалении позиции или заказа
async function reverseInventoryForOrder(orderId) {
    try {
        // Получаем все расходы по этому заказу
        const { data, error } = await db.from('inventory')
            .select('id, ingredient_id, quantity')
            .eq('order_id', orderId)
            .eq('type', 'расход');
        if (error || !data || !data.length) return;

        // Создаём сторно-записи
        await db.from('inventory').insert(data.map(r => ({
            ingredient_id: r.ingredient_id,
            type: 'сторно',
            quantity: r.quantity,
            order_id: orderId,
            notes: `Сторно заказа #${orderId}`
        })));
        await loadInventory();
    } catch (e) { console.error('Ошибка сторнирования:', e); }
}
