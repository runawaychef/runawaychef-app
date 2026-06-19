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
    await loadAllData();
    logActivity('auth', `Вход: ${emp.name}`);
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
}

// Панель настроек (шестерёнка) — служебные функции, доступна из любого раздела
function openSettingsModal() {
    document.getElementById('settingsCurrentEmployee').textContent = currentEmployee ? currentEmployee.name : '—';
    document.getElementById('settingsModal').style.display = 'flex';
}
