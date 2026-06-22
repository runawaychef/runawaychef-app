// ==================== ИНГРЕДИЕНТЫ ====================
// Справочник ингредиентов: название, цена за упаковку, размер упаковки, единица измерения.
// Цена за единицу считается автоматически.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), showLoading/hideLoading,
// logActivity (employees.js), svgEdit/svgDelete (helpers.js),
// openDeleteModal, closeModal (modals.js).

let ingredients = []; // [{id, name, package_price, package_size, unit}]

const UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };

function ingredientUnitPrice(ing) {
    if (!ing.package_size) return 0;
    return ing.package_price / ing.package_size;
}

function displayIngredients() {
    ingredients.sort((a, b) => (a.name||"").localeCompare(b.name||""));
    const tbody = document.getElementById('ingredientTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    ingredients.forEach((ing, i) => {
        const unitPrice = ingredientUnitPrice(ing);
        const unitLabel = UNIT_LABELS[ing.unit] || ing.unit;
        const row = document.createElement('tr');
        row.className = 'order-row';
        row.innerHTML = `
            <td class="border p-0.5 text-xs" onclick="openIngredientDetail(${ing.id})">${escapeHtml(ing.name)}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openIngredientDetail(${ing.id})">${ing.package_price.toFixed(2)} €</td>
            <td class="border p-0.5 text-xs text-center" onclick="openIngredientDetail(${ing.id})">${ing.package_size} ${unitLabel}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openIngredientDetail(${ing.id})">${unitPrice.toFixed(4)} €/${unitLabel}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openIngredientDetail(${ing.id})`)}
                ${svgDelete(`openDeleteModal(${i},'ingredient','ингредиент «${ing.name}»')`)}
            </td>`;
        tbody.appendChild(row);
    });
}

// Кнопка "+": попап для создания нового ингредиента
// Кнопка "+": сразу создаёт черновик ингредиента и открывает его карточку
let _draftIngredientIds = new Set();

async function createDraftIngredientAndOpen() {
    showLoading();
    try {
        const { data, error } = await db.from('ingredients').insert({
            name: '', package_price: 0, package_size: 1, unit: 'g'
        }).select().single();
        if (error) throw error;
        const newIng = { id: data.id, name: '', package_price: 0, package_size: 1, unit: 'g' };
        ingredients.push(newIng);
        _draftIngredientIds.add(newIng.id);
        displayIngredients();
        openIngredientDetail(newIng.id);
        logActivity('ingredient', `Создан черновик ингредиента №${newIng.id}`);
    } catch (e) { console.error(e); showInfo('Ошибка создания ингредиента. Проверьте подключение.'); }
    finally { hideLoading(); }
}

async function cleanupIngredientDraftIfEmpty(ingId) {
    if (!_draftIngredientIds.has(ingId)) return;
    _draftIngredientIds.delete(ingId);
    const idx = ingredients.findIndex(i => i.id === ingId);
    if (idx === -1) return;
    if (ingredients[idx].name && ingredients[idx].name.trim()) return; // название вписали — уже не пустой черновик
    try {
        await db.from('ingredients').delete().eq('id', ingId);
        ingredients.splice(idx, 1);
    } catch (e) { console.error('Не удалось удалить пустой черновик ингредиента:', e); }
}

// ==================== КАРТОЧКА ИНГРЕДИЕНТА ====================
function openIngredientDetail(ingId) {
    currentIngredientId = ingId;
    const ing = ingredients.find(i => i.id === ingId);
    if (!ing) return;

    document.getElementById('ingredientsList').classList.add('hidden');
    document.getElementById('ingredientDetail').classList.add('active');

    document.getElementById('idName').value = ing.name;
    document.getElementById('idPackagePrice').value = ing.package_price.toFixed(2);
    document.getElementById('idPackageSize').value = ing.package_size;
    document.getElementById('idUnit').value = ing.unit;
    renderIngredientUnitPrice(ing);
    loadIngredientPriceHistory(ingId); // загружаем историю цен асинхронно
    refreshFab();
}

async function closeIngredientDetail() {
    const leavingId = currentIngredientId;
    currentIngredientId = null;
    document.getElementById('ingredientsList').classList.remove('hidden');
    document.getElementById('ingredientDetail').classList.remove('active');
    if (leavingId !== null) await cleanupIngredientDraftIfEmpty(leavingId);
    displayIngredients();
    refreshFab();
}

function renderIngredientUnitPrice(ing) {
    const unitLabel = UNIT_LABELS[ing.unit] || ing.unit;
    document.getElementById('idUnitPrice').textContent = `${ingredientUnitPrice(ing).toFixed(4)} €/${unitLabel}`;
}

async function saveIdHeader() {
    const ing = ingredients.find(i => i.id === currentIngredientId);
    if (!ing) return;
    const name = document.getElementById('idName').value.trim();
    const packagePrice = parseFloat(document.getElementById('idPackagePrice').value);
    const packageSize  = parseFloat(document.getElementById('idPackageSize').value);
    const unit = document.getElementById('idUnit').value;
    if (!name || isNaN(packagePrice) || isNaN(packageSize) || packageSize <= 0) {
        showInfo('Заполните все поля корректно!'); return;
    }
    const priceChanged = parseFloat(packagePrice.toFixed(2)) !== parseFloat(ing.package_price.toFixed(2)) || parseFloat(packageSize.toFixed(4)) !== parseFloat(ing.package_size.toFixed(4));
    showLoading();
    try {
        const { error } = await db.from('ingredients').update({
            name, package_price: parseFloat(packagePrice.toFixed(2)), package_size: packageSize, unit
        }).eq('id', ing.id);
        if (error) throw error;

        // Если цена или размер упаковки изменились — добавляем запись в историю цен.
        // Если за сегодня уже есть запись (upsert по ingredient_id + valid_from) — обновляем её.
        if (priceChanged) {
            const today = new Date().toISOString().slice(0, 10);
            await db.from('ingredient_price_history').upsert({
                ingredient_id: ing.id,
                package_price: parseFloat(packagePrice.toFixed(2)),
                package_size: packageSize,
                valid_from: today
            }, { onConflict: 'ingredient_id,valid_from' });
            await loadIngredientPriceHistory(ing.id);
        }

        ing.name = name; ing.package_price = parseFloat(packagePrice.toFixed(2));
        ing.package_size = packageSize; ing.unit = unit;
        renderIngredientUnitPrice(ing);
        logActivity('ingredient', `Изменён ингредиент «${name}»${priceChanged ? ' (новая цена)' : ''}`);
    } catch (e) { console.error(e); showInfo('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// Удаление ингредиента прямо из его карточки
function deleteCurrentIngredient() {
    const idx = ingredients.findIndex(i => i.id === currentIngredientId);
    if (idx === -1) return;
    const ing = ingredients[idx];
    openDeleteModal(idx, 'ingredient', `ингредиент «${ing.name}»`);
}

// ==================== ИСТОРИЯ ЦЕН ИНГРЕДИЕНТА ====================
let _ingredientPriceHistory = {}; // { ingredient_id: [{package_price, package_size, valid_from}] }

async function loadIngredientPriceHistory(ingredientId) {
    try {
        const { data, error } = await db.from('ingredient_price_history')
            .select('package_price, package_size, valid_from')
            .eq('ingredient_id', ingredientId)
            .order('valid_from', { ascending: false });
        if (error) throw error;
        _ingredientPriceHistory[ingredientId] = data || [];
        renderIngredientPriceHistory(ingredientId);
    } catch (e) { console.error('Ошибка загрузки истории цен:', e); }
}

function renderIngredientPriceHistory(ingredientId) {
    const container = document.getElementById('idPriceHistory');
    if (!container) return;
    const history = _ingredientPriceHistory[ingredientId] || [];
    if (!history.length) { container.innerHTML = '<p class="text-xs text-gray-400">История цен недоступна</p>'; return; }
    const ing = ingredients.find(i => i.id === ingredientId);
    const unitLabel = ing ? (UNIT_LABELS[ing.unit] || ing.unit) : '';
    let html = '<table class="w-full text-xs"><thead><tr class="bg-gray-100"><th class="p-0.5 text-left">С даты</th><th class="p-0.5 text-right">Цена упак.</th><th class="p-0.5 text-right">Цена за ед.</th></tr></thead><tbody>';
    history.forEach((h, i) => {
        const unitPrice = h.package_size ? (h.package_price / h.package_size).toFixed(4) : '—';
        const isCurrent = i === 0;
        html += `<tr class="${isCurrent ? 'bg-indigo-50 font-semibold' : 'border-b'}">
            <td class="p-0.5">${formatDateDMY(h.valid_from)}${isCurrent ? ' <span class="text-indigo-600">(текущая)</span>' : ''}</td>
            <td class="p-0.5 text-right">${Number(h.package_price).toFixed(2)} €</td>
            <td class="p-0.5 text-right">${unitPrice} €/${unitLabel}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ==================== БЫСТРОЕ СОЗДАНИЕ ИЗ КАРТОЧКИ РЕЦЕПТА ====================
// Если при вводе в поле "Добавить в рецепт" нужного ингредиента ещё нет в базе,
// в выпадающем списке показывается пункт "+ Создать «...»" (см. setupSearchDropdown
// в helpers.js). Этот модал спрашивает только цену/размер упаковки/единицу — название
// уже известно (введено пользователем) — и после создания возвращает в то же поле рецепта.
let _quickAddIngredientContext = null; // 'product' | 'semiFinished' — куда вернуться после создания

function openQuickAddIngredientModal(name, context) {
    _quickAddIngredientContext = context;
    document.getElementById('qaiName').value = name;
    document.getElementById('qaiPrice').value = '';
    document.getElementById('qaiSize').value = '';
    document.getElementById('qaiUnit').value = 'g';
    document.getElementById('quickAddIngredientModal').style.display = 'flex';
}

async function confirmQuickAddIngredient() {
    const name = document.getElementById('qaiName').value.trim();
    const packagePrice = parseFloat(document.getElementById('qaiPrice').value);
    const packageSize  = parseFloat(document.getElementById('qaiSize').value);
    const unit = document.getElementById('qaiUnit').value;
    if (!name || isNaN(packagePrice) || isNaN(packageSize) || packageSize <= 0) {
        showInfo('Заполните все поля корректно!'); return;
    }
    showLoading();
    try {
        const { data, error } = await db.from('ingredients').insert({
            name, package_price: parseFloat(packagePrice.toFixed(2)), package_size: packageSize, unit
        }).select().single();
        if (error) throw error;
        const newIng = { id: data.id, name: data.name, package_price: Number(data.package_price), package_size: Number(data.package_size), unit: data.unit };
        ingredients.push(newIng);
        displayIngredients();
        logActivity('ingredient', `Добавлен ингредиент «${name}» (из карточки рецепта)`);
        closeModal();

        // Подставляем созданный ингредиент обратно в поле поиска того рецепта,
        // откуда вызвали создание — остаётся только нажать "Добавить".
        const inputId = _quickAddIngredientContext === 'semiFinished' ? 'newSfRecipeIngredient' : 'newRecipeIngredient';
        const input = document.getElementById(inputId);
        if (input) input.value = newIng.name;
    } catch (e) { console.error(e); showInfo('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}
