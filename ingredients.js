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
function openAddIngredientModal() {
    document.getElementById('ingredientName').value = '';
    document.getElementById('ingredientPackagePrice').value = '';
    document.getElementById('ingredientPackageSize').value = '';
    document.getElementById('ingredientUnit').value = 'g';
    document.getElementById('addIngredientModal').style.display = 'flex';
}

async function addIngredient() {
    const name = document.getElementById('ingredientName').value.trim();
    const packagePrice = parseFloat(document.getElementById('ingredientPackagePrice').value);
    const packageSize  = parseFloat(document.getElementById('ingredientPackageSize').value);
    const unit = document.getElementById('ingredientUnit').value;
    if (!name || isNaN(packagePrice) || isNaN(packageSize) || packageSize <= 0) {
        alert('Заполните все поля корректно!'); return;
    }
    showLoading();
    try {
        const { data, error } = await db.from('ingredients').insert({
            name, package_price: parseFloat(packagePrice.toFixed(2)), package_size: packageSize, unit
        }).select().single();
        if (error) throw error;
        ingredients.push({ id: data.id, name: data.name, package_price: Number(data.package_price), package_size: Number(data.package_size), unit: data.unit });
        displayIngredients();
        closeModal();
        logActivity('ingredient', `Добавлен ингредиент «${name}»`);
        document.getElementById('ingredientName').value = '';
        document.getElementById('ingredientPackagePrice').value = '';
        document.getElementById('ingredientPackageSize').value = '';
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
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
    refreshFab();
}

function closeIngredientDetail() {
    currentIngredientId = null;
    document.getElementById('ingredientsList').classList.remove('hidden');
    document.getElementById('ingredientDetail').classList.remove('active');
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
        alert('Заполните все поля корректно!'); return;
    }
    showLoading();
    try {
        const { error } = await db.from('ingredients').update({
            name, package_price: parseFloat(packagePrice.toFixed(2)), package_size: packageSize, unit
        }).eq('id', ing.id);
        if (error) throw error;
        ing.name = name; ing.package_price = parseFloat(packagePrice.toFixed(2));
        ing.package_size = packageSize; ing.unit = unit;
        renderIngredientUnitPrice(ing);
        logActivity('ingredient', `Изменён ингредиент «${name}»`);
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}

// Удаление ингредиента прямо из его карточки
function deleteCurrentIngredient() {
    const idx = ingredients.findIndex(i => i.id === currentIngredientId);
    if (idx === -1) return;
    const ing = ingredients[idx];
    openDeleteModal(idx, 'ingredient', `ингредиент «${ing.name}»`);
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
        alert('Заполните все поля корректно!'); return;
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
    } catch (e) { console.error(e); alert('Ошибка сохранения. Проверьте подключение.'); }
    finally { hideLoading(); }
}
