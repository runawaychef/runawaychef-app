// ==================== УТИЛИТЫ: ДЕНЬГИ / РАСЧЁТЫ ПО ЗАКАЗУ ====================
// Чистые функции расчёта сумм, скидок и НДС. Зависят только от объекта order.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.

const VAT_RATE = 0.21; // НДС 21% (Литва)

// Сумма позиций без скидки и НДС
function orderTotal(order) {
    if (!order.items || !order.items.length) return 0;
    return order.items.reduce((s, it) => s + (it.quantity * it.price || 0), 0);
}

function orderDiscountAmount(order) {
    const subtotal = orderTotal(order);
    const pct = order.discount || 0;
    return subtotal * (pct / 100);
}

function orderAfterDiscount(order) {
    return orderTotal(order) - orderDiscountAmount(order);
}

function orderVatAmount(order) {
    if (order.vat_exempt) return 0;
    return orderAfterDiscount(order) * VAT_RATE;
}

function orderGrandTotal(order) {
    return orderAfterDiscount(order) + orderVatAmount(order);
}
