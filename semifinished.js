// ==================== ПОЛУФАБРИКАТЫ ====================
// Промежуточные составы (крем, конфитюр, тесто и т.п.), используемые в рецептах изделий.
// Состоят только из обычных ингредиентов (без вложенности других полуфабрикатов).
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), ingredients (ingredients.js), ingredientUnitPrice (money.js),
// showLoading/hideLoading, logActivity (employees.js), svgEdit/svgDelete (helpers.js),
// openDeleteModal, closeModal (modals.js), editIndex (главный скрипт).

let semiFinished = []; // [{id, name, batch_size, unit, other_costs, ingredients:[{id, ingredient_id, quantity}]}]

const SF_UNIT_LABELS = { g: 'г', kg: 'кг', ml: 'мл', l: 'л' };

// Себестоимость партии полуфабриката
function semiFinishedBatchCost(sf) {
    const ingredientsCost = (sf.ingredients || []).reduce((sum, ri) => {
        const ing = ingredients.find(i => i.id === ri.ingredient_id);
        if (!ing) return sum;
        return sum + ingredientUnitPrice(ing) * ri.quantity;
    }, 0);
    return ingredientsCost + (sf.other_costs || 0);
}

// Себестоимость за единицу полуфабриката (€/г, €/кг, €/мл, €/л — в зависимости от sf.unit)
function semiFinishedUnitCost(sf) {
    const batchSize = sf.batch_size || 1;
    if (batchSize <= 0) return 0;
    return semiFinishedBatchCost(sf) / batchSize;
}

function displaySemiFinished() {
    semiFinished.sort((a, b) => a.name.localeCompare(b.name));
    const tbody = document.getElementById('semiFinishedTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let warningCount = 0;
    semiFinished.forEach((sf, i) => {
        const unitLabel = SF_UNIT_LABELS[sf.unit] || sf.unit;
        const unitCost = semiFinishedUnitCost(sf);
        const needsAttention = !sf.recipe_confirmed;
        if (needsAttention) warningCount++;
        const row = document.createElement('tr');
        row.className = 'order-row' + (needsAttention ? ' bg-red-50' : '');
        row.innerHTML = `
            <td class="border p-0.5 text-xs" onclick="openSemiFinishedDetail(${sf.id})">${escapeHtml(sf.name)}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openSemiFinishedDetail(${sf.id})">${sf.batch_size} ${unitLabel}</td>
            <td class="border p-0.5 text-xs text-center" onclick="openSemiFinishedDetail(${sf.id})">${unitCost.toFixed(4)} €/${unitLabel}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditSemiFinishedModal(${i})`)}
                ${svgDelete(`openDeleteModal(${i},'semiFinished','полуфабрикат «${sf.name}»')`)}
            </td>`;
        tbody.appendChild(row);
    });
    const warningEl = document.getElementById('semiFinishedRecipeWarning');
    if (warningEl) warningEl.classList.toggle('hidden', warningCount === 0);
    updateSemiFinishedSelects();
}

async function addSemiFinished() {
    const name = document.getElementById('semiFinishedName').value.trim();
    const batchSize = parseFloat(document.getElementById('semiFinishedBatchSize').value);
    const unit = document.getElementById('semiFinishedUnit').value;
    if (!name || isNaN(batchSize) || batchSize <= 0) { alert('Заполните все поля корректно!'); return; }
    showLoading();
    try {
        const { data, error } = await db.from('semi_finished').insert({ name, batch_size: batchSize, unit, other_costs: 0 }).select().single();
        if (error) throw error;
        semiFinished.push({ id: data.id, name: data.name, batch_size: Number(data.batch_size), unit: data.unit, other_costs: Number(data.other_costs || 0), ingredients: [] });
        displaySemiFinished();
        logActivity('semiFinished', `Добавлен полуфабрикат «${name}»`);
        document.getElementById('semiFinishedName').value = '';
        document.getElementById('semiFinishedBatchSize').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function openEditSemiFinishedModal(i) {
    editIndex = i;
    const sf = semiFinished[i];
    document.getElementById('editSemiFinishedName').value = sf.name;
    document.getElementById('editSemiFinishedBatchSize').value = sf.batch_size;
    document.getElementById('editSemiFinishedUnit').value = sf.unit;
    document.getElementById('editSemiFinishedModal').style.display = 'flex';
}

async function saveSemiFinishedEdit() {
    const name = document.getElementById('editSemiFinishedName').value.trim();
    const batchSize = parseFloat(document.getElementById('editSemiFinishedBatchSize').value);
    const unit = document.getElementById('editSemiFinishedUnit').value;
    if (!name || isNaN(batchSize) || batchSize <= 0) { alert('Заполните все поля корректно!'); return; }
    const sf = semiFinished[editIndex];
    showLoading();
    try {
        const { error } = await db.from('semi_finished').update({ name, batch_size: batchSize, unit }).eq('id', sf.id);
        if (error) throw error;
        sf.name = name; sf.batch_size = batchSize; sf.unit = unit;
        displaySemiFinished(); closeModal();
        logActivity('semiFinished', `Изменён полуфабрикат «${name}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// ==================== ДЕТАЛЬНЫЙ ВИД ПОЛУФАБРИКАТА / РЕЦЕПТУРА ====================
// currentSemiFinishedId объявлен в index.html (общее состояние)

function openSemiFinishedDetail(sfId) {
    currentSemiFinishedId = sfId;
    const sf = semiFinished.find(s => s.id === sfId);
    if (!sf) return;

    document.getElementById('semiFinishedList').classList.add('hidden');
    document.getElementById('semiFinishedDetail').classList.add('active');

    document.getElementById('sfdName').value = sf.name;
    document.getElementById('sfdBatchSize').value = sf.batch_size;
    document.getElementById('sfdUnit').value = sf.unit;
    document.getElementById('sfdOtherCosts').value = (sf.other_costs || 0).toFixed(2);
    document.getElementById('sfdRecipeConfirmed').checked = !!sf.recipe_confirmed;

    renderSemiFinishedRecipe(sf);
    fillNewSfRecipeIngredientSelect();
    setupCopySfRecipeControl(sf);
}

function closeSemiFinishedDetail() {
    currentSemiFinishedId = null;
    document.getElementById('semiFinishedList').classList.remove('hidden');
    document.getElementById('semiFinishedDetail').classList.remove('active');
    displaySemiFinished();
}

async function saveSfdHeader() {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf) return;
    const name = document.getElementById('sfdName').value.trim();
    const batchSize = parseFloat(document.getElementById('sfdBatchSize').value);
    const unit = document.getElementById('sfdUnit').value;
    const otherCosts = parseFloat(document.getElementById('sfdOtherCosts').value) || 0;
    if (!name || isNaN(batchSize) || batchSize <= 0) { alert('Заполните название и размер партии корректно!'); return; }

    showLoading();
    try {
        const { error } = await db.from('semi_finished').update({
            name, batch_size: batchSize, unit, other_costs: parseFloat(otherCosts.toFixed(2))
        }).eq('id', sf.id);
        if (error) throw error;
        sf.name = name; sf.batch_size = batchSize; sf.unit = unit; sf.other_costs = parseFloat(otherCosts.toFixed(2));
        renderSemiFinishedRecipe(sf);
        logActivity('semiFinished', `Изменён полуфабрикат «${sf.name}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function fillNewSfRecipeIngredientSelect() {
    setupSearchDropdown('newSfRecipeIngredient', 'newSfRecipeIngredientDropdown',
        () => ingredients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i => i.name),
        null, (text) => openQuickAddIngredientModal(text, 'semiFinished'));
}

function renderSemiFinishedRecipe(sf) {
    const tbody = document.getElementById('sfRecipeItemsBody');
    tbody.innerHTML = '';
    const list = sf.ingredients || [];
    if (!list.length) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" class="text-center text-xs text-gray-400 py-2">Нет ингредиентов. Добавьте ниже.</td>`;
        tbody.appendChild(row);
    } else {
        list.forEach((ri, i) => {
            const ing = ingredients.find(x => x.id === ri.ingredient_id);
            const unitPrice = ing ? ingredientUnitPrice(ing) : 0;
            const lineCost = unitPrice * ri.quantity;
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-0.5 text-xs">${escapeHtml(ing ? ing.name : '(удалён)')}</td>
                <td class="p-0.5 text-xs text-center">${ri.quantity} ${ing ? UNIT_LABELS[ing.unit] : ''}</td>
                <td class="p-0.5 text-xs text-center font-medium">${lineCost.toFixed(2)} €</td>
                <td class="p-0.5 text-center">
                    ${svgEdit(`openEditSfRecipeItemModal(${i})`)}
                    ${svgDelete(`deleteSfRecipeItem(${i})`)}
                </td>`;
            tbody.appendChild(row);
        });
    }

    const batchCost = semiFinishedBatchCost(sf);
    const unitCost  = semiFinishedUnitCost(sf);
    const unitLabel = SF_UNIT_LABELS[sf.unit] || sf.unit;

    document.getElementById('sfdBatchCost').textContent = batchCost.toFixed(2) + ' €';
    document.getElementById('sfdUnitCost').textContent  = unitCost.toFixed(4) + ` €/${unitLabel}`;
}

async function addIngredientToSfRecipe() {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf) return;
    const inputEl = document.getElementById('newSfRecipeIngredient');
    const quantity = parseFloat(document.getElementById('newSfRecipeQty').value);
    const ing = ingredients.find(i => i.name === inputEl.value.trim());
    if (!ing || isNaN(quantity) || quantity <= 0) {
        alert('Выберите ингредиент из списка и укажите количество!'); return;
    }
    const ingredientId = ing.id;

    showLoading();
    try {
        const { data, error } = await db.from('semi_finished_ingredients').insert({
            semi_finished_id: sf.id, ingredient_id: ingredientId, quantity
        }).select().single();
        if (error) throw error;
        if (!sf.ingredients) sf.ingredients = [];
        sf.ingredients.push({ id: data.id, ingredient_id: ingredientId, quantity: Number(data.quantity) });
        renderSemiFinishedRecipe(sf);
        await resetSfRecipeConfirmed(sf);
        logActivity('semiFinished', `В рецепт «${sf.name}» добавлен ингредиент «${ing.name}» (${quantity})`);
        inputEl.value = '';
        document.getElementById('newSfRecipeQty').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

let editSfRecipeItemIdx = null;

function openEditSfRecipeItemModal(i) {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf) return;
    editSfRecipeItemIdx = i;
    const ri = sf.ingredients[i];

    const sel = document.getElementById('editSfRecipeIngredient');
    sel.innerHTML = '<option value="">Выберите ингредиент</option>';
    ingredients.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ing => {
        const opt = document.createElement('option');
        opt.value = ing.id; opt.textContent = ing.name;
        if (ing.id === ri.ingredient_id) opt.selected = true;
        sel.appendChild(opt);
    });
    document.getElementById('editSfRecipeQty').value = ri.quantity;
    document.getElementById('editSfRecipeItemModal').style.display = 'flex';
}

async function saveSfRecipeItemEdit() {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf || editSfRecipeItemIdx === null) return;
    const ingredientIdRaw = document.getElementById('editSfRecipeIngredient').value;
    const quantity = parseFloat(document.getElementById('editSfRecipeQty').value);
    if (!ingredientIdRaw || isNaN(quantity) || quantity <= 0) {
        alert('Заполните все поля корректно!'); return;
    }
    const ingredientId = Number(ingredientIdRaw);
    const ri = sf.ingredients[editSfRecipeItemIdx];

    showLoading();
    try {
        const { error } = await db.from('semi_finished_ingredients').update({
            ingredient_id: ingredientId, quantity
        }).eq('id', ri.id);
        if (error) throw error;
        sf.ingredients[editSfRecipeItemIdx] = { id: ri.id, ingredient_id: ingredientId, quantity };
        renderSemiFinishedRecipe(sf);
        await resetSfRecipeConfirmed(sf);
        closeModal();
        logActivity('semiFinished', `Изменён ингредиент в рецепте «${sf.name}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function deleteSfRecipeItem(i) {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf) return;
    const ri = sf.ingredients[i];
    const ing = ingredients.find(x => x.id === ri.ingredient_id);
    openDeleteModal(i, 'sfRecipeItem', `ингредиент «${ing ? ing.name : ''}» из рецепта полуфабриката`);
}

// ==================== ПОДТВЕРЖДЕНИЕ "РЕЦЕПТ ЗАПОЛНЕН ПОЛНОСТЬЮ" ====================
async function toggleSfRecipeConfirmed() {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    if (!sf) return;
    const checked = document.getElementById('sfdRecipeConfirmed').checked;
    showLoading();
    try {
        const { error } = await db.from('semi_finished').update({ recipe_confirmed: checked }).eq('id', sf.id);
        if (error) throw error;
        sf.recipe_confirmed = checked;
        logActivity('semiFinished', `Рецепт «${sf.name}» отмечен как ${checked ? 'заполненный полностью' : 'неполный'}`);
    } catch (e) {
        console.error(e); alert('Ошибка сохранения. Проверьте подключение.');
        document.getElementById('sfdRecipeConfirmed').checked = !checked;
    } finally { hideLoading(); }
}

async function resetSfRecipeConfirmed(sf) {
    if (!sf.recipe_confirmed) return;
    sf.recipe_confirmed = false;
    const checkbox = document.getElementById('sfdRecipeConfirmed');
    if (checkbox) checkbox.checked = false;
    try {
        await db.from('semi_finished').update({ recipe_confirmed: false }).eq('id', sf.id);
    } catch (e) { console.error('Не удалось сбросить recipe_confirmed:', e); }
}

// ==================== КОПИРОВАНИЕ РЕЦЕПТА ИЗ ДРУГОГО ПОЛУФАБРИКАТА ====================
function setupCopySfRecipeControl(sf) {
    setupSearchDropdown('copySfRecipeFromInput', 'copySfRecipeFromDropdown',
        () => semiFinished
            .filter(s => s.id !== currentSemiFinishedId && (s.ingredients || []).length)
            .sort((a,b) => a.name.localeCompare(b.name))
            .map(s => s.name),
        (name) => {
            document.getElementById('copySfRecipeFromInput').value = '';
            copySfRecipeFromByName(name);
        });
}

async function copySfRecipeFromByName(sourceName) {
    const sf = semiFinished.find(s => s.id === currentSemiFinishedId);
    const src = semiFinished.find(s => s.name === sourceName);
    if (!sf || !src) return;
    const srcItems = src.ingredients || [];
    if (!srcItems.length) { alert('У выбранного полуфабриката нет рецепта.'); return; }

    const existingIds = new Set((sf.ingredients || []).map(i => i.ingredient_id));
    const toCopy = srcItems.filter(ri => !existingIds.has(ri.ingredient_id));
    const skipped = srcItems.length - toCopy.length;

    if (!toCopy.length) { alert(`Все ингредиенты из рецепта «${sourceName}» уже есть в этом рецепте.`); return; }

    let msg = `Скопировать ${toCopy.length} ${toCopy.length === 1 ? 'позицию' : 'позиций'} из рецепта «${sourceName}» в «${sf.name}»?`;
    if (skipped) msg += `\n(${skipped} уже есть в текущем рецепте — будут пропущены)`;
    if (!(await showConfirm(msg))) return;

    showLoading();
    try {
        const rows = toCopy.map(ri => ({ semi_finished_id: sf.id, ingredient_id: ri.ingredient_id, quantity: ri.quantity }));
        const { data, error } = await db.from('semi_finished_ingredients').insert(rows).select();
        if (error) throw error;
        if (!sf.ingredients) sf.ingredients = [];
        data.forEach(d => sf.ingredients.push({ id: d.id, ingredient_id: d.ingredient_id, quantity: Number(d.quantity) }));
        renderSemiFinishedRecipe(sf);
        await resetSfRecipeConfirmed(sf);
        logActivity('semiFinished', `В рецепт «${sf.name}» скопировано ${toCopy.length} поз. из рецепта «${sourceName}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// Заполнение выпадающего списка полуфабрикатов (для использования в рецептах изделий)
function updateSemiFinishedSelects() {
    // Вызывается из displaySemiFinished; конкретное заполнение списка в рецепте изделия
    // происходит в products.js через fillNewRecipeIngredientSelect/openEditRecipeItemModal
}
