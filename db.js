const fs = require('fs');
const path = require('path');
const columnsModule = require('./columns');
const {
  COLUMNS, SOURCE_FIELDS, SELECT_DEFAULTS, INITIAL_EMPLOYEE_POOL,
  sanitizePermissions, blankPermissions, seedRoles,
  DEMO_DEV_TRACKS, DEV_TRACKS_VARIANTS, parseLegacyDevTracks,
} = columnsModule;
// Защита от рассинхрона версий файлов при ручном деплое (если columns.js вдруг окажется
// старее db.js и ещё не экспортирует эту константу) — без неё values[undefined] тихо
// записал бы мусорный ключ "undefined" вместо devTracks прямо в базу.
const DEV_TRACKS_KEY = columnsModule.DEV_TRACKS_KEY || 'devTracks';
if (!columnsModule.DEV_TRACKS_KEY){
  console.error('[db] ВНИМАНИЕ: columns.js не экспортирует DEV_TRACKS_KEY — похоже, файлы columns.js и db.js из разных версий. Используется резервное значение "devTracks", но стоит перезалить оба файла одним пакетом.');
}

// DATA_DIR можно переопределить переменной окружения — на Railway это будет
// точка монтирования постоянного Volume (например, /data), локально — папка ./data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function todayFormatted(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function todayISO(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeDefaultRow(rowIdCounter){
  const values = {};
  COLUMNS.forEach(col => {
    if (col.type === 'devRecords') return; // хранится отдельно, под DEV_TRACKS_KEY
    values[col.key] = col.value !== undefined ? col.value : '';
  });
  values[DEV_TRACKS_KEY] = DEMO_DEV_TRACKS.map(t => ({ ...t }));
  return { id: 'row' + rowIdCounter, values };
}

function seedState(){
  let rowIdCounter = 0;
  const reserveRows = [];

  // для двух "автоматически редактируемых" полей-снимков используем разные вымышленные
  // значения по кругу, чтобы демо-строки не были однообразными
  const managerCol = COLUMNS.find(c => c.key === 'managerAtEntry');
  const shopCol = COLUMNS.find(c => c.key === 'shopAtEntry');
  const managerOptions = managerCol.options.filter(o => o !== '—');
  const shopOptions = shopCol.options.filter(o => o !== '—');

  // 10 демо-строк — у каждой свой набор потенциальных должностей (см. DEV_TRACKS_VARIANTS),
  // чтобы фильтры по "Потенциальной должности"/"Обучению"/"Дате HARD" реально что-то отсеивали
  for (let i = 0; i < 10; i++){
    rowIdCounter++;
    const row = makeDefaultRow(rowIdCounter);
    row.values.managerAtEntry = managerOptions[i % managerOptions.length];
    row.values.shopAtEntry = shopOptions[i % shopOptions.length];
    const variant = DEV_TRACKS_VARIANTS[i % DEV_TRACKS_VARIANTS.length];
    row.values.devTracks = variant.map(t => ({ ...t }));
    reserveRows.push(row);
  }
  return {
    reserveRows,
    employeePool: INITIAL_EMPLOYEE_POOL.map(p => ({ ...p })),
    rowIdCounter,
    roles: seedRoles(),
    roleIdCounter: 100,
  };
}

let state;

function ensureDir(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function persist(){
  ensureDir();
  // запись во временный файл + переименование — чтобы не словить битый JSON при падении процесса
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

/** Дополняет values строки недостающими (новыми) полями разумными значениями по умолчанию
 *  и убирает значения для полей, которых больше нет в текущей схеме COLUMNS. Нужно, чтобы
 *  старые файлы базы (с прошлой версией набора столбцов) не ломали рендер после обновления схемы. */
function reshapeRowValues(values){
  const next = {};
  COLUMNS.forEach(col => {
    if (col.type === 'devRecords') return; // обрабатывается отдельно ниже, через devTracks
    if (values[col.key] !== undefined){
      next[col.key] = values[col.key];
      return;
    }
    if (col.type === 'select'){
      next[col.key] = SELECT_DEFAULTS[col.key] || col.options[0];
    } else if (col.type === 'auto' || col.type === 'autoDate' || col.type === 'autoEditable'){
      next[col.key] = '—';
    } else {
      next[col.key] = '';
    }
  });

  // devTracks — общее хранилище для потенциальных должностей/программ обучения/дат HARD
  const legacyPotPos = typeof values.potPos === 'string' ? values.potPos.trim() : '';
  const looksLikeRealLegacyData = legacyPotPos !== '' && legacyPotPos !== '—';
  if (Array.isArray(values[DEV_TRACKS_KEY])){
    next[DEV_TRACKS_KEY] = values[DEV_TRACKS_KEY];
  } else if (looksLikeRealLegacyData){
    // старый плоский формат (три склеенных через запятую текстовых поля) — восстанавливаем
    // структуру приблизительно, по порядку значений в списке. "—"/пусто — это не легаси-данные,
    // а служебная заглушка (например, из-за рассинхрона файлов при деплое), из неё восстанавливать нечего
    next[DEV_TRACKS_KEY] = parseLegacyDevTracks(values.potPos, values.training, values.hardDate);
  } else {
    next[DEV_TRACKS_KEY] = [];
  }

  return next;
}

function load(){
  try{
    ensureDir();
    if (fs.existsSync(DATA_FILE)){
      state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      let migrated = false;

      if (!Array.isArray(state.roles)){
        state.roles = seedRoles();
        state.roleIdCounter = state.roleIdCounter || 100;
        migrated = true;
      }

      // логика "уволенных сотрудников" убрана из продукта — если в старом файле базы
      // остались строки в dismissedRows, возвращаем их в общий резерв, чтобы не потерять данные
      if (Array.isArray(state.dismissedRows) && state.dismissedRows.length > 0){
        state.dismissedRows.forEach(row => {
          delete row.dismissedAt;
          delete row.lastActiveStatus;
          state.reserveRows.push(row);
        });
        console.log(`[db] Раздел "уволенные" убран — ${state.dismissedRows.length} строк(и) возвращены в резерв`);
        migrated = true;
      }
      delete state.dismissedRows;
      state.reserveRows.forEach(row => { delete row.lastActiveStatus; delete row.dismissedAt; });

      // схема столбцов могла обновиться (добавились/пропали поля) — приводим уже сохранённые
      // строки к актуальному набору ключей, ничего не сохранённого ранее не теряя
      let schemaChanged = false;
      state.reserveRows.forEach(row => {
        const beforeKeys = Object.keys(row.values).sort().join(',');
        row.values = reshapeRowValues(row.values);
        const afterKeys = Object.keys(row.values).sort().join(',');
        if (beforeKeys !== afterKeys) schemaChanged = true;
      });
      if (schemaChanged){
        console.log('[db] Схема столбцов обновлена — строки резерва приведены к актуальному набору полей');
        migrated = true;
      }

      // права ролей — тоже приводим к актуальному набору столбцов (sanitizePermissions
      // сама уберёт несуществующие ключи и добавит недостающие как view:false/edit:false)
      state.roles.forEach(role => {
        const before = JSON.stringify(role.permissions);
        role.permissions = sanitizePermissions(role.permissions);
        if (JSON.stringify(role.permissions) !== before) migrated = true;
      });

      console.log(`[db] Загружено из ${DATA_FILE}: ${state.reserveRows.length} в резерве, ${state.employeePool.length} в общем списке, ${state.roles.length} ролей`);
      if (migrated){
        persist();
      }
    } else {
      state = seedState();
      persist();
      console.log(`[db] Файл не найден, создана новая база с демо-данными: ${DATA_FILE}`);
    }
  } catch (err){
    console.error('[db] Не удалось прочитать базу, создаю новую взамен повреждённой:', err.message);
    state = seedState();
    persist();
  }
}

load();

function getState(){
  return {
    reserveRows: state.reserveRows,
    employeePool: state.employeePool,
    roles: state.roles,
  };
}

function findColumn(key){
  return COLUMNS.find(c => c.key === key);
}

/** Обновить значение одной ячейки. */
function updateCell(rowId, col, value){
  const row = state.reserveRows.find(r => r.id === rowId);
  if (!row) throw new Error('Строка резервиста не найдена');

  const colDef = findColumn(col);
  if (!colDef) throw new Error('Неизвестное поле: ' + col);
  if (colDef.type === 'auto' || colDef.type === 'autoDate' || colDef.type === 'devRecords' || colDef.type === 'empty'){
    throw new Error('Поле "' + colDef.label + '" недоступно для ручного редактирования');
  }

  row.values[col] = value;

  persist();
  return getState();
}

/** Добавить сотрудника из общего списка в резерв. */
function addToReserve(poolId){
  const idx = state.employeePool.findIndex(p => p.id === poolId);
  if (idx === -1) throw new Error('Сотрудник не найден в общем списке (возможно, уже добавлен)');
  const [poolEntry] = state.employeePool.splice(idx, 1);

  const values = {};
  COLUMNS.forEach(col => {
    if (col.type === 'devRecords') return; // хранится отдельно, под DEV_TRACKS_KEY
    if (SOURCE_FIELDS.includes(col.key)){
      values[col.key] = poolEntry[col.key] || '';
    } else if (col.type === 'select'){
      values[col.key] = SELECT_DEFAULTS[col.key] || col.options[0];
    } else if (col.type === 'auto'){
      values[col.key] = '—'; // ещё не пришло из смежных систем
    } else if (col.type === 'autoDate'){
      values[col.key] = col.key === 'reqDate' ? todayFormatted() : '—';
    } else if (col.type === 'autoEditable'){
      values[col.key] = '—'; // будет заполнено смежной системой при первом обновлении
    } else if (col.type === 'date'){
      values[col.key] = col.key === 'krDate' ? todayISO() : '';
    } else if (col.type === 'free'){
      values[col.key] = '';
    } else {
      values[col.key] = '';
    }
  });
  values[DEV_TRACKS_KEY] = []; // у нового кандидата ещё нет потенциальных должностей/обучения

  state.rowIdCounter++;
  const newRow = { id: 'row' + state.rowIdCounter, values };
  state.reserveRows.push(newRow);

  persist();
  return getState();
}

/** Убрать сотрудника из резерва (не увольнение) — возвращается в общий список. */
function removeFromReserve(rowId){
  const idx = state.reserveRows.findIndex(r => r.id === rowId);
  if (idx === -1) throw new Error('Строка резервиста не найдена');
  const [row] = state.reserveRows.splice(idx, 1);

  const poolEntry = { id: 'ret_' + row.id };
  SOURCE_FIELDS.forEach(f => { poolEntry[f] = row.values[f]; });
  state.employeePool.push(poolEntry);
  state.employeePool.sort((a, b) => a.fio.localeCompare(b.fio, 'ru'));

  persist();
  return getState();
}

/* ===================== РОЛИ И ДОСТУПЫ ===================== */

function createRole(name, positions){
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Название роли не может быть пустым');
  state.roleIdCounter = (state.roleIdCounter || 100) + 1;
  const role = {
    id: 'role_' + state.roleIdCounter,
    name: cleanName,
    positions: Array.isArray(positions) ? positions.filter(Boolean) : [],
    permissions: blankPermissions(),
  };
  state.roles.push(role);
  persist();
  return getState();
}

function updateRole(roleId, name, positions){
  const role = state.roles.find(r => r.id === roleId);
  if (!role) throw new Error('Роль не найдена');
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Название роли не может быть пустым');
  role.name = cleanName;
  role.positions = Array.isArray(positions) ? positions.filter(Boolean) : [];
  persist();
  return getState();
}

function updateRolePermissions(roleId, permissions){
  const role = state.roles.find(r => r.id === roleId);
  if (!role) throw new Error('Роль не найдена');
  // sanitizePermissions сама принудительно выставит edit:false для нередактируемых полей,
  // даже если с клиента пришло что-то другое — это защита не только для UI, но и для API.
  role.permissions = sanitizePermissions(permissions);
  persist();
  return getState();
}

function deleteRole(roleId){
  const idx = state.roles.findIndex(r => r.id === roleId);
  if (idx === -1) throw new Error('Роль не найдена');
  state.roles.splice(idx, 1);
  persist();
  return getState();
}

module.exports = {
  getState,
  updateCell,
  addToReserve,
  removeFromReserve,
  createRole,
  updateRole,
  updateRolePermissions,
  deleteRole,
  DATA_FILE,
};
