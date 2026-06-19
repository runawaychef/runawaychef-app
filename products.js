// ==================== ИЗДЕЛИЯ ====================
// Список изделий: отображение, добавление, редактирование, копирование.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), products/orders (главный скрипт),
// showLoading/hideLoading, logActivity (employees.js),
// svgEdit/svgDelete/svgCopy, updateProductSelects, openDeleteModal, closeModal (главный скрипт).

const UNIT_PRODUCT_LABELS = { pcs: 'шт', kg: 'кг' };

function displayProducts() {
    products.sort((a, b) => a.name.localeCompare(b.name));
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';
    let missingUnitCount = 0;
    products.forEach((p, i) => {
        const hasUnit = !!p.unit;
        if (!hasUnit) missingUnitCount++;
        const unitLabel = hasUnit ? UNIT_PRODUCT_LABELS[p.unit] : '⚠';
        const row = document.createElement('tr');
        row.className = 'order-row' + (hasUnit ? '' : ' bg-red-50');
        row.innerHTML = `
            <td class="border p-0.5 text-xs" onclick="openProductDetail(${p.id})">${escapeHtml(p.name)}</td>
            <td class="border p-0.5 text-xs text-center ${hasUnit ? '' : 'text-red-600 font-semibold'}" onclick="openProductDetail(${p.id})">${unitLabel}</td>
            <td class="border p-0.5 text-xs" onclick="openProductDetail(${p.id})">${p.price.toFixed(2)}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditProductModal(${i})`)}
                ${svgDelete(`openDeleteModal(${i},'product','изделие «${p.name}»')`)}
                ${svgCopy(`copyProduct(${i})`)}
            </td>`;
        tbody.appendChild(row);
    });
    const warningEl = document.getElementById('productsUnitWarning');
    if (warningEl) warningEl.classList.toggle('hidden', missingUnitCount === 0);
    updateProductSelects();
}

async function addProduct() {
    const name  = document.getElementById('productName').value.trim();
    const unit  = document.getElementById('productUnit').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    if (!name || isNaN(price)) { alert('Заполните все поля корректно!'); return; }
    showLoading();
    try {
        const { data, error } = await db.from('products').insert({ name, price: parseFloat(price.toFixed(2)), unit }).select().single();
        if (error) throw error;
        products.push({ id: data.id, name: data.name, price: Number(data.price), batch_size: Number(data.batch_size || 1), other_costs: Number(data.other_costs || 0), unit: data.unit || '', ingredients: [] });
        displayProducts();
        logActivity('product', `Добавлено изделие «${name}» (${price.toFixed(2)} € за ${UNIT_PRODUCT_LABELS[unit] || unit})`);
        document.getElementById('productName').value = '';
        document.getElementById('productPrice').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function openEditProductModal(i) {
    editIndex = i;
    document.getElementById('editProductName').value  = products[i].name;
    document.getElementById('editProductPrice').value = products[i].price.toFixed(2);
    document.getElementById('editProductModal').style.display = 'flex';
}

async function saveProductEdit() {
    const name  = document.getElementById('editProductName').value.trim();
    const price = parseFloat(document.getElementById('editProductPrice').value);
    if (!name || isNaN(price)) { alert('Заполните все поля корректно!'); return; }
    const prod = products[editIndex];
    const oldName = prod.name, oldPrice = prod.price;
    showLoading();
    try {
        const { error } = await db.from('products').update({ name, price: parseFloat(price.toFixed(2)) }).eq('id', prod.id);
        if (error) throw error;
        prod.name = name; prod.price = parseFloat(price.toFixed(2));
        // Обновить название изделия в позициях заказов (в кэше)
        orders.forEach(o => o.items.forEach(it => { if (it.product_id === prod.id) it.product = name; }));
        displayProducts(); closeModal();
        logActivity('product', `Изменено изделие «${oldName}» (${oldPrice.toFixed(2)} €) → «${name}» (${price.toFixed(2)} €)`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function copyProduct(i) {
    document.getElementById('productName').value  = products[i].name;
    document.getElementById('productUnit').value  = products[i].unit || 'pcs';
    document.getElementById('productPrice').value = products[i].price.toFixed(2);
    document.getElementById('productName').focus();
}

// ==================== ДЕТАЛЬНЫЙ ВИД ИЗДЕЛИЯ / РЕЦЕПТУРА ====================
// Зависит дополнительно от: ingredients (ingredients.js), ingredientUnitPrice (money.js),
// productBatchCost/productUnitCost/productProfit (money.js).
// currentProductId объявлен в index.html (общее состояние).

let editRecipeItemIdx = null;

function openProductDetail(productId) {
    currentProductId = productId;
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    document.getElementById('productsList').classList.add('hidden');
    document.getElementById('productDetail').classList.add('active');

    document.getElementById('pdName').value = prod.name;
    document.getElementById('pdUnit').value = prod.unit || '';
    document.getElementById('pdPrice').value = prod.price.toFixed(2);
    document.getElementById('pdBatchSize').value = prod.batch_size || 1;
    document.getElementById('pdOtherCosts').value = (prod.other_costs || 0).toFixed(2);

    updatePdUnitUI(prod.unit);
    renderProductRecipe(prod);
    fillNewRecipeIngredientSelect();
    setupCopyRecipeControl(prod);
}

function updatePdUnitUI(unit) {
    const warning = document.getElementById('pdUnitWarning');
    const hint = document.getElementById('pdPriceUnitHint');
    if (warning) warning.classList.toggle('hidden', !!unit);
    if (hint) hint.textContent = unit ? `(за ${UNIT_PRODUCT_LABELS[unit]})` : '';
}

function closeProductDetail() {
    currentProductId = null;
    document.getElementById('productsList').classList.remove('hidden');
    document.getElementById('productDetail').classList.remove('active');
    displayProducts();
}

async function savePdHeader() {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    const name = document.getElementById('pdName').value.trim();
    const unit = document.getElementById('pdUnit').value;
    const price = parseFloat(document.getElementById('pdPrice').value);
    const batchSize = parseFloat(document.getElementById('pdBatchSize').value) || 1;
    const otherCosts = parseFloat(document.getElementById('pdOtherCosts').value) || 0;
    if (!name || isNaN(price)) { alert('Заполните название и цену корректно!'); return; }

    showLoading();
    try {
        const { error } = await db.from('products').update({
            name, price: parseFloat(price.toFixed(2)), batch_size: batchSize, other_costs: parseFloat(otherCosts.toFixed(2)), unit
        }).eq('id', prod.id);
        if (error) throw error;
        const unitChanged = prod.unit !== unit;
        prod.name = name; prod.price = parseFloat(price.toFixed(2));
        prod.batch_size = batchSize; prod.other_costs = parseFloat(otherCosts.toFixed(2));
        prod.unit = unit;
        orders.forEach(o => o.items.forEach(it => { if (it.product_id === prod.id) it.product = name; }));
        updatePdUnitUI(unit);
        renderProductRecipe(prod);
        logActivity('product', `Изменено изделие «${prod.name}»${unitChanged ? ` (единица: ${UNIT_PRODUCT_LABELS[unit] || '—'})` : ''}`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function fillNewRecipeIngredientSelect() {
    setupSearchDropdown('newRecipeIngredient', 'newRecipeIngredientDropdown', () => {
        const names = ingredients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i => i.name);
        const sfNames = (typeof semiFinished !== 'undefined')
            ? semiFinished.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s => s.name + ' (п/ф)')
            : [];
        return names.concat(sfNames);
    });
}

// Находит ингредиент/полуфабрикат по тексту, введённому в поле поиска.
// Возвращает { type: 'ing'|'sf', id } или null, если совпадения нет.
function resolveRecipeIngredientInput(text) {
    const raw = text.trim();
    if (!raw) return null;
    if (raw.endsWith(' (п/ф)')) {
        const name = raw.slice(0, -' (п/ф)'.length);
        const sf = (typeof semiFinished !== 'undefined') ? semiFinished.find(s => s.name === name) : null;
        return sf ? { type: 'sf', id: sf.id } : null;
    }
    const ing = ingredients.find(i => i.name === raw);
    if (ing) return { type: 'ing', id: ing.id };
    // На случай если ввели название п/ф без суффикса
    const sf = (typeof semiFinished !== 'undefined') ? semiFinished.find(s => s.name === raw) : null;
    return sf ? { type: 'sf', id: sf.id } : null;
}

function renderProductRecipe(prod) {
    const tbody = document.getElementById('recipeItemsBody');
    tbody.innerHTML = '';
    const list = prod.ingredients || [];
    if (!list.length) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" class="text-center text-xs text-gray-400 py-2">Нет ингредиентов. Добавьте ниже.</td>`;
        tbody.appendChild(row);
    } else {
        list.forEach((ri, i) => {
            let displayName, unitLabel, unitPrice;
            if (ri.semi_finished_id) {
                const sf = (typeof semiFinished !== 'undefined') ? semiFinished.find(s => s.id === ri.semi_finished_id) : null;
                displayName = sf ? sf.name + ' (п/ф)' : '(удалён п/ф)';
                unitLabel = sf ? (SF_UNIT_LABELS[sf.unit] || sf.unit) : '';
                unitPrice = sf ? semiFinishedUnitCost(sf) : 0;
            } else {
                const ing = ingredients.find(x => x.id === ri.ingredient_id);
                displayName = ing ? ing.name : '(удалён)';
                unitLabel = ing ? (UNIT_LABELS[ing.unit] || ing.unit) : '';
                unitPrice = ing ? ingredientUnitPrice(ing) : 0;
            }
            const lineCost = unitPrice * ri.quantity;
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-0.5 text-xs">${escapeHtml(displayName)}</td>
                <td class="p-0.5 text-xs text-center">${ri.quantity} ${unitLabel}</td>
                <td class="p-0.5 text-xs text-center font-medium">${lineCost.toFixed(2)} €</td>
                <td class="p-0.5 text-center">
                    ${svgEdit(`openEditRecipeItemModal(${i})`)}
                    ${svgDelete(`deleteRecipeItem(${i})`)}
                </td>`;
            tbody.appendChild(row);
        });
    }

    const batchCost = productBatchCost(prod);
    const unitCost  = productUnitCost(prod);
    const profit    = productProfit(prod);
    const profitPct = prod.price > 0 ? (profit / prod.price * 100) : 0;

    document.getElementById('pdBatchCost').textContent = batchCost.toFixed(2) + ' €';
    document.getElementById('pdUnitCost').textContent  = unitCost.toFixed(2) + ' €';
    document.getElementById('pdProfit').textContent    = profit.toFixed(2) + ' €';
    document.getElementById('pdProfitPct').textContent = profitPct.toFixed(1) + '%';
}

async function addIngredientToRecipe() {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    const inputEl = document.getElementById('newRecipeIngredient');
    const quantity = parseFloat(document.getElementById('newRecipeQty').value);
    const resolved = resolveRecipeIngredientInput(inputEl.value);
    if (!resolved || isNaN(quantity) || quantity <= 0) {
        alert('Выберите ингредиент/полуфабрикат из списка и укажите количество!'); return;
    }
    const type = resolved.type, selectedId = resolved.id;
    const insertRow = type === 'sf'
        ? { product_id: prod.id, semi_finished_id: selectedId, ingredient_id: null, quantity }
        : { product_id: prod.id, ingredient_id: selectedId, semi_finished_id: null, quantity };

    showLoading();
    try {
        const { data, error } = await db.from('product_ingredients').insert(insertRow).select().single();
        if (error) throw error;
        if (!prod.ingredients) prod.ingredients = [];
        prod.ingredients.push({ id: data.id, ingredient_id: data.ingredient_id, semi_finished_id: data.semi_finished_id, quantity: Number(data.quantity) });
        renderProductRecipe(prod);
        let itemName = '';
        if (type === 'sf') {
            const sf = semiFinished.find(s => s.id === selectedId);
            itemName = sf ? sf.name + ' (п/ф)' : '';
        } else {
            const ing = ingredients.find(i => i.id === selectedId);
            itemName = ing ? ing.name : '';
        }
        logActivity('product', `В рецепт «${prod.name}» добавлен «${itemName}» (${quantity})`);
        inputEl.value = '';
        document.getElementById('newRecipeQty').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function openEditRecipeItemModal(i) {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    editRecipeItemIdx = i;
    const ri = prod.ingredients[i];
    const currentValue = ri.semi_finished_id ? ('sf-' + ri.semi_finished_id) : ('ing-' + ri.ingredient_id);

    const sel = document.getElementById('editRecipeIngredient');
    sel.innerHTML = '<option value="">Выберите ингредиент / полуфабрикат</option>';
    if (ingredients.length) {
        const grpIng = document.createElement('optgroup');
        grpIng.label = 'Ингредиенты';
        ingredients.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ing => {
            const opt = document.createElement('option');
            opt.value = 'ing-' + ing.id; opt.textContent = ing.name;
            if (opt.value === currentValue) opt.selected = true;
            grpIng.appendChild(opt);
        });
        sel.appendChild(grpIng);
    }
    if (typeof semiFinished !== 'undefined' && semiFinished.length) {
        const grpSf = document.createElement('optgroup');
        grpSf.label = 'Полуфабрикаты';
        semiFinished.sort((a,b)=>a.name.localeCompare(b.name)).forEach(sf => {
            const opt = document.createElement('option');
            opt.value = 'sf-' + sf.id; opt.textContent = sf.name;
            if (opt.value === currentValue) opt.selected = true;
            grpSf.appendChild(opt);
        });
        sel.appendChild(grpSf);
    }
    document.getElementById('editRecipeQty').value = ri.quantity;
    document.getElementById('editRecipeItemModal').style.display = 'flex';
}

async function saveRecipeItemEdit() {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod || editRecipeItemIdx === null) return;
    const selectedRaw = document.getElementById('editRecipeIngredient').value;
    const quantity = parseFloat(document.getElementById('editRecipeQty').value);
    if (!selectedRaw || isNaN(quantity) || quantity <= 0) {
        alert('Заполните все поля корректно!'); return;
    }
    const [type, idStr] = selectedRaw.split('-');
    const selectedId = Number(idStr);
    const ri = prod.ingredients[editRecipeItemIdx];
    const updateRow = type === 'sf'
        ? { ingredient_id: null, semi_finished_id: selectedId, quantity }
        : { ingredient_id: selectedId, semi_finished_id: null, quantity };

    showLoading();
    try {
        const { error } = await db.from('product_ingredients').update(updateRow).eq('id', ri.id);
        if (error) throw error;
        prod.ingredients[editRecipeItemIdx] = {
            id: ri.id,
            ingredient_id: type === 'sf' ? null : selectedId,
            semi_finished_id: type === 'sf' ? selectedId : null,
            quantity
        };
        renderProductRecipe(prod);
        closeModal();
        logActivity('product', `Изменён ингредиент в рецепте «${prod.name}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function deleteRecipeItem(i) {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    const ri = prod.ingredients[i];
    let itemName = '';
    if (ri.semi_finished_id) {
        const sf = semiFinished.find(x => x.id === ri.semi_finished_id);
        itemName = sf ? sf.name + ' (п/ф)' : '';
    } else {
        const ing = ingredients.find(x => x.id === ri.ingredient_id);
        itemName = ing ? ing.name : '';
    }
    openDeleteModal(i, 'recipeItem', `«${itemName}» из рецепта`);
}

// ==================== КОПИРОВАНИЕ РЕЦЕПТА ИЗ ДРУГОГО ИЗДЕЛИЯ ====================
// Позволяет быстро перенести список ингредиентов/полуфабрикатов из похожего
// изделия, не вводя их заново. Позиции, которые уже есть в текущем рецепте
// (тот же ингредиент/п-ф), пропускаются, чтобы не задваивать строки.
// Перед записью в базу — подтверждение (аналог кнопки "Сохранить"), т.к. это
// массовое действие, в отличие от добавления одной позиции.
function setupCopyRecipeControl(prod) {
    setupSearchDropdown('copyRecipeFromInput', 'copyRecipeFromDropdown',
        () => products
            .filter(p => p.id !== currentProductId && (p.ingredients || []).length)
            .sort((a,b) => a.name.localeCompare(b.name))
            .map(p => p.name),
        (name) => {
            document.getElementById('copyRecipeFromInput').value = '';
            copyRecipeFromProductByName(name);
        });
}

async function copyRecipeFromProductByName(sourceName) {
    const prod = products.find(p => p.id === currentProductId);
    const src = products.find(p => p.name === sourceName);
    if (!prod || !src) return;
    const srcItems = src.ingredients || [];
    if (!srcItems.length) { alert('У выбранного изделия нет рецепта.'); return; }

    const existingIngIds = new Set((prod.ingredients || []).filter(i => i.ingredient_id).map(i => i.ingredient_id));
    const existingSfIds  = new Set((prod.ingredients || []).filter(i => i.semi_finished_id).map(i => i.semi_finished_id));
    const toCopy = srcItems.filter(ri => ri.semi_finished_id ? !existingSfIds.has(ri.semi_finished_id) : !existingIngIds.has(ri.ingredient_id));
    const skipped = srcItems.length - toCopy.length;

    if (!toCopy.length) { alert(`Все позиции из рецепта «${sourceName}» уже есть в этом рецепте.`); return; }

    let msg = `Скопировать ${toCopy.length} ${toCopy.length === 1 ? 'позицию' : 'позиций'} из рецепта «${sourceName}» в «${prod.name}»?`;
    if (skipped) msg += `\n(${skipped} уже есть в текущем рецепте — будут пропущены)`;
    if (!confirm(msg)) return;

    showLoading();
    try {
        const rows = toCopy.map(ri => ri.semi_finished_id
            ? { product_id: prod.id, semi_finished_id: ri.semi_finished_id, ingredient_id: null, quantity: ri.quantity }
            : { product_id: prod.id, ingredient_id: ri.ingredient_id, semi_finished_id: null, quantity: ri.quantity });
        const { data, error } = await db.from('product_ingredients').insert(rows).select();
        if (error) throw error;
        if (!prod.ingredients) prod.ingredients = [];
        data.forEach(d => prod.ingredients.push({ id: d.id, ingredient_id: d.ingredient_id, semi_finished_id: d.semi_finished_id, quantity: Number(d.quantity) }));
        renderProductRecipe(prod);
        logActivity('product', `В рецепт «${prod.name}» скопировано ${toCopy.length} поз. из рецепта «${sourceName}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}
