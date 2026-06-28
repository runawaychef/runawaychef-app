// ==================== СОТРУДНИКИ / ВХОД-ВЫХОД ====================
// Логика экрана выбора сотрудника и хранение текущего вошедшего сотрудника.
// Обычный скрипт (без модулей) — переменные и функции доступны глобально, как раньше.
// Зависит от: db (supabaseClient.js), loadAllData() и logActivity() (определены в основном скрипте).

let employees = [];   // [{id, name}]
let currentEmployee = null; // {id, name}

// Записывает действие в журнал (activity_log). Ошибки логирования не должны мешать основной работе.
async function logActivity(actionType, description, orderId = null) {
    try {
        await db.from('activity_log').insert({
            employee_id: currentEmployee ? currentEmployee.id : null,
            employee_name: currentEmployee ? currentEmployee.name : '—',
            action_type: actionType,
            description: description,
            order_id: orderId
        });
    } catch (e) {
        console.error('Activity log error:', e);
    }
}

async function initLogin() {
    try {
        const { data, error } = await db.from('employees').select('id, name').order('name');
        if (error) throw error;
        employees = data || [];
        const list = document.getElementById('employeeList');
        list.innerHTML = '';
        employees.forEach(emp => {
            const btn = document.createElement('button');
            btn.className = 'btn bg-gray-500 text-white p-2 rounded-md hover:bg-gray-600 text-sm';
            btn.textContent = emp.name;
            btn.onclick = () => selectEmployee(emp);
            list.appendChild(btn);
        });
    } catch (e) {
        console.error(e);
        document.getElementById('loginError').classList.remove('hidden');
    }
}

async function selectEmployee(emp) {
    currentEmployee = emp;
    localStorage.setItem('currentEmployee', JSON.stringify(emp));
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContent').classList.remove('app-locked');
    document.getElementById('settingsBtn').classList.remove('hidden');
    document.getElementById('statsBtn').classList.remove('hidden');
    document.getElementById('inventoryBtn').classList.remove('hidden');
    await loadAllData();
    await loadInventory();
    initRealtime();
    refreshFab();
    setTimeout(refreshFab, 150);
    logActivity('auth', `Вход: ${emp.name}`);

    // Обновляем информационный блок каждую минуту.
    // Если дата изменилась (перевалило за полночь) — перезагружаем все данные.
    let _lastKnownDate = new Date().toISOString().slice(0, 10);
    setInterval(() => {
        const currentDate = new Date().toISOString().slice(0, 10);
        if (currentDate !== _lastKnownDate) {
            _lastKnownDate = currentDate;
            loadAllData(); // дата изменилась — обновляем данные полностью
        } else {
            displayOrders(); // дата та же — просто перерисовываем блок
        }
    }, 60000);
}

async function logoutEmployee() {
    if (!(await showConfirm('Сменить сотрудника?'))) return;
    closeModal(); // если вызвано из панели настроек — закрыть её
    logActivity('auth', `Выход: ${currentEmployee ? currentEmployee.name : ''}`);
    currentEmployee = null;
    localStorage.removeItem('currentEmployee');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appContent').classList.add('app-locked');
    document.getElementById('settingsBtn').classList.add('hidden');
    document.getElementById('statsBtn').classList.add('hidden');
    document.getElementById('inventoryBtn').classList.add('hidden');
}

// Панель настроек (шестерёнка) — служебные функции, доступна из любого раздела
// Фиксирует item_cost для всех позиций заказов, у которых он ещё не зафиксирован.
// Запускается один раз из настроек чтобы «заморозить» себестоимость старых заказов
// по текущим ценам ингредиентов — после этого изменение цен не будет влиять на историю.
async function fixateAllItemCosts() {
    const ok = await showConfirm(
        'Зафиксировать себестоимость всех существующих заказов по текущим ценам ингредиентов?\n\nПосле этого изменение цен не будет пересчитывать старые заказы.\n\nЭто действие необратимо.'
    );
    if (!ok) return;
    closeModal();

    // Собираем все позиции без зафиксированной себестоимости
    const toFix = [];
    orders.forEach(o => {
        (o.items || []).forEach(it => {
            if (it.item_cost == null) {
                const prod = products.find(p => p.id === it.product_id);
                if (prod) {
                    const cost = parseFloat((productUnitCost(prod) * it.quantity).toFixed(4));
                    toFix.push({ id: it.id, item_cost: cost, item: it });
                }
            }
        });
    });

    if (!toFix.length) {
        await showInfo('Все позиции уже зафиксированы — ничего делать не нужно.');
        return;
    }

    showLoading('Фиксирую себестоимость... Это может занять несколько секунд.');
    let fixed = 0;
    try {
        // Обновляем батчами по 50 записей
        for (let i = 0; i < toFix.length; i += 50) {
            const batch = toFix.slice(i, i + 50);
            for (const rec of batch) {
                const { error } = await db.from('order_items').update({ item_cost: rec.item_cost }).eq('id', rec.id);
                if (!error) { rec.item.item_cost = rec.item_cost; fixed++; }
            }
        }
        logActivity('system', `Зафиксирована себестоимость ${fixed} позиций заказов`);
        await showInfo(`Готово: зафиксировано ${fixed} позиций из ${toFix.length}.`);
    } catch (e) {
        console.error(e);
        await showInfo(`Ошибка: зафиксировано ${fixed} из ${toFix.length}. Попробуйте ещё раз.`);
    } finally { hideLoading(); }
}

// ==================== TELEGRAM УВЕДОМЛЕНИЯ ====================

const TELEGRAM_CHAT_IDS = {
    'Sergey': 371171905,
    'Mark':   658689940
};

let _telegramBotToken = null;

async function getTelegramToken() {
    if (_telegramBotToken) return _telegramBotToken;
    try {
        const { data, error } = await db.from('app_settings').select('value').eq('key', 'telegram_bot_token').single();
        if (error) throw error;
        _telegramBotToken = data.value;
    } catch (e) { console.error('Ошибка загрузки Telegram токена:', e); }
    return _telegramBotToken;
}

// Отправляет сообщение всем кроме текущего сотрудника
async function sendTelegramNotification(text) {
    const token = await getTelegramToken();
    if (!token) return;
    const senderName = currentEmployee ? currentEmployee.name : null;
    const recipients = Object.entries(TELEGRAM_CHAT_IDS).filter(([name]) => name !== senderName);
    for (const [, chatId] of recipients) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
            });
        } catch (e) { console.error('Telegram error:', e); }
    }
}

// Отправка уведомления о заказе по кнопке из карточки заказа
async function notifyOrderToTelegram() {
    const order = orders.find(o => o.id === currentOrderId);
    if (!order) return;
    if (!order.customer) { await showInfo('Сначала выберите клиента!'); return; }

    const senderName = currentEmployee ? currentEmployee.name : '—';
    const items = (order.items || []).map(it => `• ${it.product} × ${it.quantity}`).join('\n');
    const text = `🆕 Новый заказ\n👤 ${order.customer} · 📅 ${formatDateDMY(order.date)}${items ? '\n' + items : ''}\n👨‍🍳 ${senderName}`;

    showLoading('Отправляю...');
    try {
        await sendTelegramNotification(text);
        await showInfo('Уведомление отправлено!');
    } catch(e) { console.error(e); showInfo('Ошибка отправки.'); }
    finally { hideLoading(); }
}

// Отправка списка покупок в Telegram
async function sendShoppingListToTelegram(shoppingList) {
    if (!shoppingList.length) { await showInfo('Список покупок пуст.'); return; }
    const UL = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
    const senderName = currentEmployee ? currentEmployee.name : '—';

    const lines = shoppingList.filter(r => !r.is_bought).map(r => {
        let name = '—', unit = '';
        if (r.ingredient_id) {
            const ing = (ingredients || []).find(i => i.id === r.ingredient_id);
            if (ing) { name = ing.name; unit = UL[ing.unit] || ing.unit; }
        } else if (r.semi_finished_id) {
            const sf = (semiFinished || []).find(s => s.id === r.semi_finished_id);
            if (sf) { name = sf.name; unit = UL[sf.unit] || sf.unit; }
        }
        return `• ${name} — ${Number(r.quantity_to_buy).toFixed(1)} ${unit}`;
    });

    if (!lines.length) { await showInfo('Все позиции уже отмечены как купленные.'); return; }

    const text = `🛒 Список покупок\n\n${lines.join('\n')}\n\n👨‍🍳 ${senderName}`;

    const token = await getTelegramToken();
    if (!token) { await showInfo('Не удалось загрузить токен бота.'); return; }
    const recipients = Object.values(TELEGRAM_CHAT_IDS);
    showLoading('Отправляю в Telegram...');
    try {
        for (const chatId of recipients) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text })
            });
        }
        await showInfo('Список отправлен в Telegram!');
    } catch (e) { console.error(e); showInfo('Ошибка отправки.'); }
    finally { hideLoading(); }
}
