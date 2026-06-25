// ==================== СКЛАД ====================
// Учёт остатков ингредиентов: приход (ручной), расход (автоматически из заказов).
// Зависит от: db, ingredients, orders, semiFinished, products, UNIT_LABELS,
//             showLoading, hideLoading, showInfo, showConfirm, closeModal, logActivity.

const STOCK_LOW_DAYS = 7; // порог «критически мало» — менее N дней запаса

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
    const hasLow = ingredients.some(ing => {
        const balance = getIngredientBalance(ing.id);
        if (balance === null || balance <= 0) return false;
        const daily = avgDailyUsage(ing.id);
        if (!daily) return false;
        return (balance / daily) < STOCK_LOW_DAYS;
    });
    dot.classList.toggle('hidden', !hasLow);
}

// ── Открытие окна склада ─────────────────────────────────────────────────────

async function openInventoryModal() {
    showLoading('Загружаю склад...');
    await loadInventory();
    hideLoading();

    const UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };

    // Разделяем на критические и обычные
    const critical = [];
    const normal   = [];

    ingredients.forEach(ing => {
        const balance = getIngredientBalance(ing.id);
        const daily   = avgDailyUsage(ing.id);
        const daysLeft = (balance !== null && balance > 0 && daily > 0)
            ? Math.floor(balance / daily) : null;
        const unitLabel = UNIT_LABELS[ing.unit] || ing.unit;

        const item = { ing, balance, daily, daysLeft, unitLabel };
        if (balance !== null && balance > 0 && daysLeft !== null && daysLeft < STOCK_LOW_DAYS) {
            critical.push(item);
        } else {
            normal.push(item);
        }
    });

    function renderRow(item, isCritical) {
        const { ing, balance, daysLeft, unitLabel } = item;
        const balanceStr = balance !== null ? `${Number(balance).toFixed(2)} ${unitLabel}` : '—';
        const daysStr    = daysLeft !== null ? `~${daysLeft} дн.` : 'нет данных';
        const rowClass   = isCritical ? 'bg-red-50' : '';
        const daysClass  = isCritical ? 'text-red-600 font-semibold' : 'text-gray-500';
        return `<tr class="border-b ${rowClass}">
            <td class="p-1 text-xs">${escapeHtml(ing.name)}</td>
            <td class="p-1 text-xs text-right">${balanceStr}</td>
            <td class="p-1 text-xs text-right ${daysClass}">${daysStr}</td>
            <td class="p-1 text-center">
                <button onclick="openInventoryAddModal(${ing.id})" class="text-indigo-500 hover:text-indigo-700 text-xs">+</button>
            </td>
        </tr>`;
    }

    let html = '';

    if (critical.length) {
        html += `<p class="text-xs font-semibold text-red-600 mb-1">⚠ Заканчивается (менее ${STOCK_LOW_DAYS} дней)</p>`;
        html += '<table class="w-full mb-3"><thead><tr class="bg-red-100"><th class="p-1 text-xs text-left">Ингредиент</th><th class="p-1 text-xs text-right">Остаток</th><th class="p-1 text-xs text-right">Хватит</th><th class="p-1 w-8"></th></tr></thead><tbody>';
        critical.forEach(item => { html += renderRow(item, true); });
        html += '</tbody></table>';
    }

    html += '<p class="text-xs font-semibold text-gray-600 mb-1">Все ингредиенты</p>';
    html += '<table class="w-full"><thead><tr class="bg-gray-100"><th class="p-1 text-xs text-left">Ингредиент</th><th class="p-1 text-xs text-right">Остаток</th><th class="p-1 text-xs text-right">Хватит</th><th class="p-1 w-8"></th></tr></thead><tbody>';
    [...critical, ...normal].forEach(item => { html += renderRow(item, false); });
    html += '</tbody></table>';

    document.getElementById('inventoryContent').innerHTML = html;
    document.getElementById('inventoryModal').style.display = 'flex';
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
