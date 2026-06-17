// ==================== ИЗДЕЛИЯ ====================
// Список изделий: отображение, добавление, редактирование, копирование.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), products/orders (главный скрипт),
// showLoading/hideLoading, logActivity (employees.js),
// svgEdit/svgDelete/svgCopy, updateProductSelects, openDeleteModal, closeModal (главный скрипт).

function displayProducts() {
    products.sort((a, b) => a.name.localeCompare(b.name));
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';
    products.forEach((p, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="border p-0.5 text-xs">${p.name}</td>
            <td class="border p-0.5 text-xs">${p.price.toFixed(2)}</td>
            <td class="border p-0.5 text-center">
                ${svgEdit(`openEditProductModal(${i})`)}
                ${svgDelete(`openDeleteModal(${i},'product','изделие «${p.name}»')`)}
                ${svgCopy(`copyProduct(${i})`)}
            </td>`;
        tbody.appendChild(row);
    });
    updateProductSelects();
}

async function addProduct() {
    const name  = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    if (!name || isNaN(price)) { alert('Заполните все поля корректно!'); return; }
    showLoading();
    try {
        const { data, error } = await db.from('products').insert({ name, price: parseFloat(price.toFixed(2)) }).select().single();
        if (error) throw error;
        products.push({ id: data.id, name: data.name, price: Number(data.price) });
        displayProducts();
        logActivity('product', `Добавлено изделие «${name}» (${price.toFixed(2)} €)`);
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
    document.getElementById('productPrice').value = products[i].price.toFixed(2);
    document.getElementById('productName').focus();
}
