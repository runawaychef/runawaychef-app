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
            <td class="border p-0.5 text-xs" onclick="openProductDetail(${p.id})">${p.name}</td>
            <td class="border p-0.5 text-xs text-center ${hasUnit ? '' : 'text-red-600 font-semibold'}" onclick="openProductDetail(${p.id})">${unitLabel}</td>
            <td class="border p-0.5 text-xs" onclick="openProductDetail(${p.id})">${p.price.toFixed(2)}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditProductModal(${i})`)}
                ${svgDelete(`openDeleteModal(${i},'product','изделие «${p.name}»')`)}
                ${svgCopy(`copyProduct(${i})`)}
                <svg class="w-4 h-4 text-indigo-500 hover:text-indigo-700 inline cursor-pointer" title="Открыть" fill="none" stroke="currentColor" viewBox="0 0 24 24" onclick="openProductDetail(${p.id})"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
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
    const sel = document.getElementById('newRecipeIngredient');
    if (!sel) return;
    sel.innerHTML = '<option value="">— ингредиент —</option>';
    ingredients.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ing => {
        const opt = document.createElement('option');
        opt.value = ing.id; opt.textContent = ing.name;
        sel.appendChild(opt);
    });
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
            const ing = ingredients.find(x => x.id === ri.ingredient_id);
            const unitPrice = ing ? ingredientUnitPrice(ing) : 0;
            const lineCost = unitPrice * ri.quantity;
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-0.5 text-xs">${ing ? ing.name : '(удалён)'}</td>
                <td class="p-0.5 text-xs text-center">${ri.quantity} ${ing ? ing.unit : ''}</td>
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

function autoFillNewRecipeQtyHint() {
    // Заглушка на случай будущих автоподсказок — пока не требуется
}

async function addIngredientToRecipe() {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    const ingredientIdRaw = document.getElementById('newRecipeIngredient').value;
    const quantity = parseFloat(document.getElementById('newRecipeQty').value);
    if (!ingredientIdRaw || isNaN(quantity) || quantity <= 0) {
        alert('Выберите ингредиент и укажите количество!'); return;
    }
    const ingredientId = Number(ingredientIdRaw);

    showLoading();
    try {
        const { data, error } = await db.from('product_ingredients').insert({
            product_id: prod.id, ingredient_id: ingredientId, quantity
        }).select().single();
        if (error) throw error;
        if (!prod.ingredients) prod.ingredients = [];
        prod.ingredients.push({ id: data.id, ingredient_id: ingredientId, quantity: Number(data.quantity) });
        renderProductRecipe(prod);
        const ing = ingredients.find(i => i.id === ingredientId);
        logActivity('product', `В рецепт «${prod.name}» добавлен ингредиент «${ing ? ing.name : ''}» (${quantity})`);
        document.getElementById('newRecipeIngredient').value = '';
        document.getElementById('newRecipeQty').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

function openEditRecipeItemModal(i) {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod) return;
    editRecipeItemIdx = i;
    const ri = prod.ingredients[i];

    const sel = document.getElementById('editRecipeIngredient');
    sel.innerHTML = '<option value="">Выберите ингредиент</option>';
    ingredients.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ing => {
        const opt = document.createElement('option');
        opt.value = ing.id; opt.textContent = ing.name;
        if (ing.id === ri.ingredient_id) opt.selected = true;
        sel.appendChild(opt);
    });
    document.getElementById('editRecipeQty').value = ri.quantity;
    document.getElementById('editRecipeItemModal').style.display = 'flex';
}

async function saveRecipeItemEdit() {
    const prod = products.find(p => p.id === currentProductId);
    if (!prod || editRecipeItemIdx === null) return;
    const ingredientIdRaw = document.getElementById('editRecipeIngredient').value;
    const quantity = parseFloat(document.getElementById('editRecipeQty').value);
    if (!ingredientIdRaw || isNaN(quantity) || quantity <= 0) {
        alert('Заполните все поля корректно!'); return;
    }
    const ingredientId = Number(ingredientIdRaw);
    const ri = prod.ingredients[editRecipeItemIdx];

    showLoading();
    try {
        const { error } = await db.from('product_ingredients').update({
            ingredient_id: ingredientId, quantity
        }).eq('id', ri.id);
        if (error) throw error;
        prod.ingredients[editRecipeItemIdx] = { id: ri.id, ingredient_id: ingredientId, quantity };
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
    const ing = ingredients.find(x => x.id === ri.ingredient_id);
    openDeleteModal(i, 'recipeItem', `ингредиент «${ing ? ing.name : ''}» из рецепта`);
}
