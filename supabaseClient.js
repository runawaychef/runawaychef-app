// ==================== ПОДКЛЮЧЕНИЕ К SUPABASE ====================
// Создаёт единый клиент базы данных (db), используемый во всём приложении.
// Обычный скрипт (без модулей) — переменная db доступна глобально, как раньше.
// Подключать после SDK Supabase (cdn.jsdelivr.net/npm/@supabase/supabase-js),
// но до основного скрипта программы.

const SUPABASE_URL = 'https://eyzusdlyghahdcvrglhe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wKZLhyoTOKqovf1_YptOJw_wXkSUAFv';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
