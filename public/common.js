/* ============================================================
   common.js — общие функции для index.html и roles.html.
   Работа с API, индикатор сохранения, мелкие хелперы форматирования.
   Каждая страница держит свои данные (COLUMNS/ROLES/...) сама —
   этот файл ничего не хранит, только переиспользуемую логику.
   ============================================================ */

function setSaveStatus(kind, text){
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.className = 'save-status' + (kind === 'error' ? ' error' : kind === 'saving' ? ' saving' : '');
  el.querySelector('.save-status-text').textContent = text;
}

async function fetchMeta(){
  const res = await fetch('/api/meta');
  if (!res.ok) throw new Error('Сервер вернул ошибку при загрузке структуры данных');
  return res.json();
}

async function fetchState(){
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Сервер вернул ошибку при загрузке данных');
  return res.json();
}

/** Выполнить изменяющий запрос к API (POST/PATCH/DELETE) и показать статус сохранения.
 *  Возвращает распарсенный ответ сервера — актуальное состояние — вызывающая сторона
 *  сама решает, что из него забрать (у каждой страницы свой набор нужных полей). */
async function mutate(url, options){
  setSaveStatus('saving', 'Сохранение…');
  try{
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса к серверу');
    setSaveStatus('ok', 'Сохранено');
    return data;
  } catch(err){
    console.error(err);
    setSaveStatus('error', 'Не сохранено: ' + err.message);
    throw err;
  }
}

/** Может ли поле такого типа в принципе редактироваться (независимо от роли).
 *  auto/autoDate/empty — поля приходят из смежных систем (Pub3 -> СМскилл) либо ещё не определены,
 *  их нельзя редактировать никогда. autoEditable заполняется автоматически, но роль с правом
 *  edit может значение поменять — по возможности редактирования он ведёт себя как select/free/date. */
function isEditableType(type){
  return type === 'select' || type === 'free' || type === 'date' || type === 'autoEditable' || type === 'positionSelect';
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatIsoToRu(iso){
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
