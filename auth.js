// ==================== АУТЕНТИФИКАЦИЯ (Supabase Auth) ====================
// Закрывает доступ к приложению целиком (включая экран выбора сотрудника),
// пока человек не войдёт по email + паролю, выданным в Supabase.
//
// Это ОТДЕЛЬНЫЙ уровень от "выбора сотрудника" (employees.js):
// - этот экран (authScreen) защищает данные от посторонних людей —
//   без входа сюда ни один запрос к базе не пройдёт, если на стороне
//   Supabase включены правила доступа (RLS), см. supabase-rls-setup.sql;
// - "выбор сотрудника" остаётся только для удобства — чтобы в журнале
//   действий было видно, кто из своих что сделал.
//
// Обычный скрипт (без модулей) — функции доступны глобально.
// Зависит от: db (supabaseClient.js), initLogin/selectEmployee (employees.js).

async function initAuth() {
    document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);

    let session = null;
    try {
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        session = data.session;
    } catch (e) {
        console.error('Auth check error:', e);
    }

    if (session) {
        await showAuthedApp();
    } else {
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContent').classList.add('app-locked');
    document.getElementById('settingsBtn').classList.add('hidden');
    document.getElementById('statsBtn').classList.add('hidden');
}

async function showAuthedApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    await initLogin();

    // Если сотрудник уже выбирался ранее на этом устройстве — авто-вход
    const saved = localStorage.getItem('currentEmployee');
    if (saved) {
        try {
            const emp = JSON.parse(saved);
            if (emp && emp.id && emp.name) await selectEmployee(emp);
        } catch (e) { /* ignore */ }
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    const btn = document.getElementById('authSubmitBtn');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Вход...';
    try {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        document.getElementById('authPassword').value = '';
        await showAuthedApp();
    } catch (err) {
        console.error(err);
        errEl.textContent = 'Неверный email или пароль.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
    }
}

// Полный выход из аккаунта (не путать со сменой сотрудника на экране выбора).
async function signOutAccount() {
    if (!(await showConfirm('Выйти из приложения полностью? Потребуется снова ввести email и пароль.'))) return;
    closeModal(); // если вызвано из панели настроек — закрыть её
    try { await db.auth.signOut(); } catch (e) { console.error(e); }
    localStorage.removeItem('currentEmployee');
    currentEmployee = null;
    document.getElementById('settingsBtn').classList.add('hidden');
    document.getElementById('statsBtn').classList.add('hidden');
    showAuthScreen();
}
