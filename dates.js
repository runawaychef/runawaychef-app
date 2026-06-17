// ==================== УТИЛИТЫ: ДАТЫ ====================
// Чистые функции для работы с датами. Ни от чего не зависят.
// Обычный скрипт (без модулей) — функции доступны глобально, как раньше.

// Форматирование даты ГГГГ-ММ-ДД -> ДД.MM.ГГГГ
function formatDateDMY(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
}

// Понедельник недели, содержащей дату d
function getMondayOf(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

const MONTH_NAMES_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
