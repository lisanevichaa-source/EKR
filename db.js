const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const columnsModule = require('./columns');
const {
  COLUMNS, SOURCE_FIELDS, SELECT_DEFAULTS, INITIAL_EMPLOYEE_POOL,
  sanitizePermissions, blankPermissions, seedRoles, blankActions, sanitizeActions,
  DEMO_DEV_TRACKS, DEV_TRACKS_VARIANTS, parseLegacyDevTracks,
  POSITION_CATEGORIES_SEED, getEligiblePotentialPositions, sanitizePositionCategory,
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
const DB_FILE = path.join(DATA_DIR, 'db.sqlite');
// Старый формат хранения (плоский JSON) — держим путь только для одноразовой миграции
// уже накопленных на сервере данных при первом запуске новой версии.
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'db.json');

// Сколько строк создавать при первом запуске (создании новой базы с нуля).
// По умолчанию 10 — это куратированное демо (как было). Если поставить больше 10 —
// первые 10 строк остаются теми же куратированными, а сверху дописываются ещё
// (SEED_ROW_COUNT - 10) случайно сгенерированных строк — удобно для стресс-теста
// интерфейса на больших объёмах (например, SEED_ROW_COUNT=5000).
const SEED_ROW_COUNT = parseInt(process.env.SEED_ROW_COUNT, 10) || 10;

// Диапазон дат для случайной генерации (стресс-тест): 01.01.2025 — 01.08.2026.
const SEED_DATE_RANGE_START = Date.UTC(2025, 0, 1);
const SEED_DATE_RANGE_END = Date.UTC(2026, 7, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
// Минимальный разрыв между "Дата зачисления КР" и "Дата назначения" в стресс-тестовых
// данных — чтобы назначение всегда было реалистично позже зачисления, а не случайно
// раньше него (что портило бы виджет "Средний срок пребывания в КР").
const MIN_KR_TO_ASSIGN_GAP_DAYS = 14;

function randomDateISO(){
  const t = SEED_DATE_RANGE_START + Math.random() * (SEED_DATE_RANGE_END - SEED_DATE_RANGE_START);
  return new Date(t).toISOString().slice(0, 10); // YYYY-MM-DD
}
function randomDateISOInRange(startMs, endMs){
  const t = startMs + Math.random() * (endMs - startMs);
  return new Date(t).toISOString().slice(0, 10);
}
/** Генерирует связанную пару "Дата зачисления КР" / "Дата назначения" — назначение всегда
 *  минимум на MIN_KR_TO_ASSIGN_GAP_DAYS дней позже зачисления, обе даты остаются в общем
 *  диапазоне стресс-теста (без этого дата назначения могла случайно оказаться раньше даты
 *  зачисления — виджет "Средний срок пребывания в КР" считал бы бессмысленные, иногда
 *  отрицательные промежутки, а в среднем по многим строкам разница уходила в районе нуля). */
function randomKrAndAssignDates(){
  const krMaxMs = Math.max(SEED_DATE_RANGE_START, SEED_DATE_RANGE_END - MIN_KR_TO_ASSIGN_GAP_DAYS * DAY_MS);
  const krDate = randomDateISOInRange(SEED_DATE_RANGE_START, krMaxMs);
  const krMs = new Date(krDate).getTime();
  const assignDate = randomDateISOInRange(krMs + MIN_KR_TO_ASSIGN_GAP_DAYS * DAY_MS, SEED_DATE_RANGE_END);
  return { krDate, assignDate };
}
function isoToRuDisplay(iso){
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}
/** Из массива записей истории (devTracks) выбирает должность записи с наибольшим процентом —
 *  используется как "активная" потенциальная должность по умолчанию при генерации демо-данных,
 *  чтобы совпадать с тем, что раньше показывалось как основное/сводное значение. */
function pickTopDevTrackPosition(tracks){
  if (!Array.isArray(tracks) || tracks.length === 0) return '';
  const top = tracks.reduce((best, t) => ((Number(t.percent) || 0) > (Number(best.percent) || 0) ? t : best), tracks[0]);
  return top.position || '';
}

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
    if (col.type === 'positionSelect') return; // задаём явно ниже, вместе с devTracks
    values[col.key] = col.value !== undefined ? col.value : '';
  });
  values[DEV_TRACKS_KEY] = DEMO_DEV_TRACKS.map(t => ({ ...t }));
  values.potPos = DEMO_DEV_TRACKS[0] ? DEMO_DEV_TRACKS[0].position : '';
  return { id: 'row' + rowIdCounter, values };
}

// Варианты для полей, которым по ТЗ стресс-теста нужна вариативность, хотя они и
// нередактируемые (обычно у них всегда одно и то же значение — см. col.value в columns.js).
const STRESS_MOTIVATION_OPTIONS = ['Бригадная', 'Личная'];
const STRESS_CUR_POS_OPTIONS = ['Продавец', 'Продавец К2', 'Продавец-кассир', 'Продавец-эксперт', 'Кассир', 'Кладовщик', 'Старший кассир', 'Начальник отдела'];

/** Случайно сгенерированная строка для стресс-теста интерфейса на больших объёмах.
 *  Даты — в диапазоне 01.01.2025–01.08.2026, выпадающие списки — случайно из options,
 *  часть нередактируемых полей — из отдельных списков вариантов выше. Остальные
 *  нередактируемые поля (ФИО, почта, телефон, регион и т.д.) — как в обычном демо,
 *  одинаковые у всех строк, чтобы не плодить лишний объём работы там, где вариативность
 *  не запрашивалась. */
function makeRandomRow(rowIdCounter, index, managerOptions, shopOptions, shopCodeOptions){
  const values = {};
  const { krDate, assignDate } = randomKrAndAssignDates();
  COLUMNS.forEach(col => {
    if (col.type === 'devRecords') return; // хранится отдельно, под DEV_TRACKS_KEY
    if (col.type === 'positionSelect') return; // задаём явно ниже, вместе с devTracks

    if (col.key === 'krDate'){
      values[col.key] = krDate;
    } else if (col.key === 'assignDate'){
      values[col.key] = assignDate;
    } else if (col.key === 'motivation'){
      values[col.key] = pickRandom(STRESS_MOTIVATION_OPTIONS);
    } else if (col.key === 'curPos'){
      values[col.key] = pickRandom(STRESS_CUR_POS_OPTIONS);
    } else if (col.key === 'shop'){
      values[col.key] = pickRandom(shopCodeOptions);
    } else if (col.type === 'select'){
      values[col.key] = pickRandom(col.options);
    } else if (col.type === 'date'){
      values[col.key] = randomDateISO();
    } else if (col.type === 'autoDate'){
      values[col.key] = isoToRuDisplay(randomDateISO());
    } else {
      // всё остальное нередактируемое — как в обычном демо, без вариативности
      values[col.key] = col.value !== undefined ? col.value : '';
    }
  });

  // История развития (Потенциальная должность / Обучение в КР / Дата HARD) — циклично
  // используем уже существующие заготовленные наборы, а не придумываем новые (связанная
  // логика — трогать нежелательно). "Активной" потенциальной должностью (potPos) становится
  // первая запись набора — остальные остаются в истории и станут видны, если сотруднику
  // (в реальности через личный кабинет, в демо — вручную в интерфейсе) сменят выбор.
  const devVariant = DEV_TRACKS_VARIANTS[index % DEV_TRACKS_VARIANTS.length];
  values[DEV_TRACKS_KEY] = devVariant.map(t => ({ ...t }));
  values.potPos = pickTopDevTrackPosition(devVariant);

  // "Автоматически редактируемые" поля-снимки — тоже циклично, как и в куратированном демо
  values.managerAtEntry = managerOptions[index % managerOptions.length];
  values.shopAtEntry = shopOptions[index % shopOptions.length];

  return { id: 'row' + rowIdCounter, values };
}

function seedState(){
  let rowIdCounter = 0;
  const reserveRows = [];

  // для двух "автоматически редактируемых" полей-снимков используем разные вымышленные
  // значения по кругу, чтобы демо-строки не были однообразными
  const managerCol = COLUMNS.find(c => c.key === 'managerAtEntry');
  const shopCol = COLUMNS.find(c => c.key === 'shopAtEntry');
  const assignPlaceCol = COLUMNS.find(c => c.key === 'assignPlace');
  const managerOptions = managerCol.options.filter(o => o !== '—');
  const shopOptions = shopCol.options.filter(o => o !== '—');
  const shopCodeOptions = assignPlaceCol.options.filter(o => o !== '—'); // для столбца "Магазин" при стресс-тесте

  // 10 демо-строк — у каждой свой вариант потенциальной должности (см. DEV_TRACKS_VARIANTS),
  // чтобы фильтры по "Потенциальной должности"/"Обучению"/"Дате HARD" реально что-то отсеивали.
  // "Активной" становится запись с наибольшим процентом — та же логика, что и в makeRandomRow.
  for (let i = 0; i < 10; i++){
    rowIdCounter++;
    const row = makeDefaultRow(rowIdCounter);
    row.values.managerAtEntry = managerOptions[i % managerOptions.length];
    row.values.shopAtEntry = shopOptions[i % shopOptions.length];
    const variant = DEV_TRACKS_VARIANTS[i % DEV_TRACKS_VARIANTS.length];
    row.values.devTracks = variant.map(t => ({ ...t }));
    row.values.potPos = pickTopDevTrackPosition(variant);
    reserveRows.push(row);
  }

  // если SEED_ROW_COUNT больше 10 — довешиваем ещё случайно сгенерированных строк сверху
  // (стресс-тест интерфейса на большом объёме данных), не трогая куратированные первые 10
  const extraCount = Math.max(0, SEED_ROW_COUNT - 10);
  if (extraCount > 0){
    console.log(`[db] SEED_ROW_COUNT=${SEED_ROW_COUNT} — довешиваю ${extraCount} случайно сгенерированных строк сверх 10 куратированных`);
  }
  for (let i = 0; i < extraCount; i++){
    rowIdCounter++;
    reserveRows.push(makeRandomRow(rowIdCounter, i, managerOptions, shopOptions, shopCodeOptions));
  }

  return {
    reserveRows,
    employeePool: INITIAL_EMPLOYEE_POOL.map(p => ({ ...p })),
    rowIdCounter,
    roles: seedRoles(),
    roleIdCounter: 100,
    positionCategories: POSITION_CATEGORIES_SEED.map((cat, i) => ({ id: 'poscat_' + (i + 1), ...cat })),
    positionCategoryIdCounter: POSITION_CATEGORIES_SEED.length,
  };
}

/** Дополняет values строки недостающими (новыми) полями разумными значениями по умолчанию
 *  и убирает значения для полей, которых больше нет в текущей схеме COLUMNS. Нужно, чтобы
 *  старые строки (с прошлой версией набора столбцов) не ломали рендер после обновления схемы. */
function reshapeRowValues(values){
  const next = {};
  COLUMNS.forEach(col => {
    if (col.type === 'devRecords') return; // обрабатывается отдельно ниже, через devTracks
    if (col.type === 'positionSelect') return; // обрабатывается отдельно ниже, вместе с devTracks
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

  // devTracks — история прогресса по всем должностям, по которым он когда-либо был у
  // сотрудника (не только по текущей активной). Три варианта источника: современный формат
  // (уже массив) — используем как есть; самый старый плоский формат (три склеенных через
  // запятую текстовых поля, из времён ДО появления самого массива) — восстанавливаем
  // приблизительно; иначе — пусто.
  const rawLegacyPotPos = typeof values.potPos === 'string' ? values.potPos.trim() : '';
  const looksLikeOldFlatFormat = !Array.isArray(values[DEV_TRACKS_KEY]) && rawLegacyPotPos !== '' && rawLegacyPotPos !== '—';
  let devTracks;
  if (Array.isArray(values[DEV_TRACKS_KEY])){
    devTracks = values[DEV_TRACKS_KEY];
  } else if (looksLikeOldFlatFormat){
    devTracks = parseLegacyDevTracks(values.potPos, values.training, values.hardDate);
  } else {
    devTracks = [];
  }
  next[DEV_TRACKS_KEY] = devTracks;

  // potPos — "активная" потенциальная должность (та, что сейчас видна в столбце и по которой
  // подбираются Обучение/Дата HARD). Если это уже современный формат и potPos реально
  // сохранён как своё значение (не тот же текст, что распознан как легаси-формат выше) и
  // совпадает с одной из записей истории — доверяем ему. Иначе (миграция более старых
  // данных, где potPos как отдельное поле ещё не существовал вовсе) — берём должность
  // записи с наибольшим процентом, то же самое значение, что раньше показывалось как
  // основное/сводное — просто для непрерывности того, что видел пользователь.
  const looksLikeModernPotPos = !looksLikeOldFlatFormat && typeof values.potPos === 'string'
    && devTracks.some(t => t.position === values.potPos);
  next.potPos = looksLikeModernPotPos ? values.potPos : pickTopDevTrackPosition(devTracks);

  return next;
}

function ensureDir(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDir();

/* ===================== SQLITE: СХЕМА И ПОДГОТОВЛЕННЫЕ ЗАПРОСЫ ===================== */
// Хранилище устроено просто: одна строка сотрудника — одна строка в таблице reserve_rows,
// все её поля (включая devTracks) — единым JSON в столбце values_json. Это не "настоящая"
// нормализованная схема с 31 отдельной колонкой (такую пришлось бы вручную мигрировать при
// каждом изменении набора столбцов в columns.js) — но она даёт главное: правка одной ячейки
// теперь означает UPDATE ровно одной строки по первичному ключу, а не перезапись всего файла
// целиком, как было раньше с плоским db.json. Цена такой правки больше не растёт вместе
// с общим числом сотрудников.
const sqlite = new Database(DB_FILE);
// WAL-режим здесь намеренно НЕ используется: он опирается на shared memory между
// процессами и, по документации SQLite, не гарантированно работает на сетевых томах
// (а Railway Volume — это сетевое хранилище). Обычный журнал (DELETE, режим по
// умолчанию) немного медленнее при высокой конкурентной записи, зато безопасен
// и предсказуем на таком хранилище — при нашей нагрузке разница не критична.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reserve_rows (
    id TEXT PRIMARY KEY,
    values_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS employee_pool (
    id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS position_categories (
    id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL
  );
`);

const stmt = {
  selectRows: sqlite.prepare('SELECT id, values_json FROM reserve_rows'),
  insertRow: sqlite.prepare('INSERT INTO reserve_rows (id, values_json) VALUES (?, ?)'),
  updateRow: sqlite.prepare('UPDATE reserve_rows SET values_json = ? WHERE id = ?'),
  deleteRow: sqlite.prepare('DELETE FROM reserve_rows WHERE id = ?'),
  countRows: sqlite.prepare('SELECT COUNT(*) AS c FROM reserve_rows'),

  selectPool: sqlite.prepare('SELECT id, data_json FROM employee_pool'),
  insertPool: sqlite.prepare('INSERT INTO employee_pool (id, data_json) VALUES (?, ?)'),
  deletePool: sqlite.prepare('DELETE FROM employee_pool WHERE id = ?'),

  selectRoles: sqlite.prepare('SELECT id, data_json FROM roles'),
  insertRole: sqlite.prepare('INSERT INTO roles (id, data_json) VALUES (?, ?)'),
  updateRoleRow: sqlite.prepare('UPDATE roles SET data_json = ? WHERE id = ?'),
  deleteRoleRow: sqlite.prepare('DELETE FROM roles WHERE id = ?'),

  getMeta: sqlite.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: sqlite.prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),

  selectPositionCategories: sqlite.prepare('SELECT id, data_json FROM position_categories'),
  insertPositionCategory: sqlite.prepare('INSERT INTO position_categories (id, data_json) VALUES (?, ?)'),
  updatePositionCategoryRow: sqlite.prepare('UPDATE position_categories SET data_json = ? WHERE id = ?'),
  deletePositionCategoryRow: sqlite.prepare('DELETE FROM position_categories WHERE id = ?'),
};

/** Оборачивает синхронный вызов к SQLite и пишет предупреждение в лог, если он занял
 *  дольше разумного порога. better-sqlite3 полностью синхронна — она блокирует весь
 *  процесс Node.js на время выполнения, так что медленный диск (например, сетевой том)
 *  тормозит не только текущий запрос, но и все остальные, ожидающие своей очереди.
 *  Этот лог помогает отличить "сам диск медленный" от "просто много одновременных
 *  пользователей встали в очередь друг за другом". */
function timedSqlite(label, fn){
  const t0 = Date.now();
  const result = fn();
  const elapsed = Date.now() - t0;
  if (elapsed > 100){
    console.warn(`[db] Медленная операция SQLite (${label}): ${elapsed} мс`);
  }
  return result;
}

function roleToJson(role){
  return JSON.stringify({
    name: role.name, positions: role.positions, permissions: role.permissions, actions: role.actions,
  });
}

/** Единоразово вставляет весь state в пустые SQLite-таблицы — используется и при первом
 *  запуске "с нуля", и при переносе уже накопленных данных из старого db.json. */
function positionCategoryToJson(cat){
  return JSON.stringify({ name: cat.name, currentPositions: cat.currentPositions, potentialPositions: cat.potentialPositions });
}

function bulkInsertState(freshState){
  const tx = sqlite.transaction(() => {
    freshState.reserveRows.forEach(r => stmt.insertRow.run(r.id, JSON.stringify(r.values)));
    freshState.employeePool.forEach(p => stmt.insertPool.run(p.id, JSON.stringify(p)));
    freshState.roles.forEach(r => stmt.insertRole.run(r.id, roleToJson(r)));
    (freshState.positionCategories || []).forEach(c => stmt.insertPositionCategory.run(c.id, positionCategoryToJson(c)));
    stmt.setMeta.run('rowIdCounter', String(freshState.rowIdCounter));
    stmt.setMeta.run('roleIdCounter', String(freshState.roleIdCounter));
    stmt.setMeta.run('positionCategoryIdCounter', String(freshState.positionCategoryIdCounter || 0));
  });
  tx();
}

function loadStateFromSqlite(){
  const reserveRows = stmt.selectRows.all().map(r => ({ id: r.id, values: JSON.parse(r.values_json) }));
  const employeePool = stmt.selectPool.all().map(r => JSON.parse(r.data_json));
  const roles = stmt.selectRoles.all().map(r => {
    const data = JSON.parse(r.data_json);
    return { id: r.id, name: data.name, positions: data.positions, permissions: data.permissions, actions: data.actions };
  });
  const positionCategories = stmt.selectPositionCategories.all().map(r => {
    const data = JSON.parse(r.data_json);
    return { id: r.id, name: data.name, currentPositions: data.currentPositions, potentialPositions: data.potentialPositions };
  });
  const rowIdCounterRow = stmt.getMeta.get('rowIdCounter');
  const roleIdCounterRow = stmt.getMeta.get('roleIdCounter');
  const positionCategoryIdCounterRow = stmt.getMeta.get('positionCategoryIdCounter');
  return {
    reserveRows,
    employeePool,
    roles,
    positionCategories,
    rowIdCounter: rowIdCounterRow ? parseInt(rowIdCounterRow.value, 10) : reserveRows.length,
    roleIdCounter: roleIdCounterRow ? parseInt(roleIdCounterRow.value, 10) : 100,
    positionCategoryIdCounter: positionCategoryIdCounterRow ? parseInt(positionCategoryIdCounterRow.value, 10) : positionCategories.length,
  };
}

/** Читает и приводит к актуальному виду старый плоский db.json — переиспользует ровно ту же
 *  логику миграции, что раньше жила в load() (снятие раздела "уволенные", приведение схемы
 *  столбцов, санитайзинг прав ролей). Используется только один раз, при переезде на SQLite. */
function loadAndMigrateLegacyJson(){
  const legacyState = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8'));

  if (!Array.isArray(legacyState.roles)){
    legacyState.roles = seedRoles();
    legacyState.roleIdCounter = legacyState.roleIdCounter || 100;
  }

  // категорий должностей ещё не было в более старых версиях — заводим сид-набор
  if (!Array.isArray(legacyState.positionCategories) || legacyState.positionCategories.length === 0){
    legacyState.positionCategories = POSITION_CATEGORIES_SEED.map((cat, i) => ({ id: 'poscat_' + (i + 1), ...cat }));
    legacyState.positionCategoryIdCounter = POSITION_CATEGORIES_SEED.length;
  }

  // логика "уволенных сотрудников" убрана из продукта — если в старом файле остались
  // строки в dismissedRows, возвращаем их в общий резерв, чтобы не потерять данные
  if (Array.isArray(legacyState.dismissedRows) && legacyState.dismissedRows.length > 0){
    legacyState.dismissedRows.forEach(row => {
      delete row.dismissedAt;
      delete row.lastActiveStatus;
      legacyState.reserveRows.push(row);
    });
    console.log(`[db] Раздел "уволенные" убран — ${legacyState.dismissedRows.length} строк(и) возвращены в резерв`);
  }
  delete legacyState.dismissedRows;
  legacyState.reserveRows.forEach(row => { delete row.lastActiveStatus; delete row.dismissedAt; });

  // схема столбцов могла обновиться (добавились/пропали поля) — приводим к актуальному набору
  legacyState.reserveRows.forEach(row => { row.values = reshapeRowValues(row.values); });

  // права ролей — тоже приводим к актуальному набору столбцов и действий
  legacyState.roles.forEach(role => {
    role.permissions = sanitizePermissions(role.permissions);
    role.actions = sanitizeActions(role.actions);
  });

  if (!Array.isArray(legacyState.employeePool)) legacyState.employeePool = [];
  if (typeof legacyState.rowIdCounter !== 'number') legacyState.rowIdCounter = legacyState.reserveRows.length;
  if (typeof legacyState.roleIdCounter !== 'number') legacyState.roleIdCounter = 100;
  if (typeof legacyState.positionCategoryIdCounter !== 'number') legacyState.positionCategoryIdCounter = legacyState.positionCategories.length;

  return legacyState;
}

let state;

function load(){
  try{
    const existingRowCount = stmt.countRows.get().c;

    if (existingRowCount === 0){
      // SQLite ещё пустой — либо переносим данные из старого db.json (если он есть
      // на диске с прошлой версии), либо сеем демо-данные с нуля
      if (fs.existsSync(LEGACY_JSON_FILE)){
        console.log('[db] Обнаружен старый db.json — переношу данные в SQLite (один раз)...');
        state = loadAndMigrateLegacyJson();
        bulkInsertState(state);
        const backupPath = LEGACY_JSON_FILE + '.migrated.bak';
        try { fs.renameSync(LEGACY_JSON_FILE, backupPath); } catch (e){ /* не критично, если не удалось переименовать */ }
        console.log(`[db] Миграция в SQLite завершена: ${state.reserveRows.length} строк резерва, ${state.employeePool.length} в общем списке, ${state.roles.length} ролей. Старый файл сохранён как ${path.basename(backupPath)}`);
        return;
      }
      state = seedState();
      bulkInsertState(state);
      console.log(`[db] База не найдена, создана новая с демо-данными: ${DB_FILE}`);
      return;
    }

    // обычная загрузка из уже существующей SQLite-базы
    state = loadStateFromSqlite();

    // категорий должностей ещё может не быть, если база создана более ранней версией
    // приложения (таблица появилась только что, пустая) — заводим сид-набор один раз
    if (!Array.isArray(state.positionCategories) || state.positionCategories.length === 0){
      const seeded = POSITION_CATEGORIES_SEED.map((cat, i) => ({ id: 'poscat_' + (i + 1), ...cat }));
      seeded.forEach(c => stmt.insertPositionCategory.run(c.id, positionCategoryToJson(c)));
      stmt.setMeta.run('positionCategoryIdCounter', String(seeded.length));
      state.positionCategories = seeded;
      state.positionCategoryIdCounter = seeded.length;
      console.log(`[db] Категории должностей не найдены — добавлен сид-набор из ${seeded.length} категорий`);
    }

    // схема столбцов могла обновиться (например, "Потенциальная должность" стала отдельным
    // редактируемым полем вместо производного от истории) — приводим уже сохранённые строки
    // к актуальному виду, точечно перезаписывая в SQLite только те строки, что реально
    // изменились. Сравниваем по полному содержимому, а не только по набору ключей — иначе,
    // например, восстановление potPos из истории (набор ключей при этом не меняется) не
    // попало бы обратно в SQLite и оставалось бы неопределённым при каждой новой загрузке.
    let reshapedCount = 0;
    state.reserveRows.forEach(row => {
      const before = JSON.stringify(row.values);
      const reshaped = reshapeRowValues(row.values);
      const after = JSON.stringify(reshaped);
      row.values = reshaped;
      if (before !== after){
        stmt.updateRow.run(JSON.stringify(row.values), row.id);
        reshapedCount++;
      }
    });
    if (reshapedCount > 0){
      console.log(`[db] Данные приведены к актуальному виду — ${reshapedCount} строк(и) резерва обновлены`);
    }

    // права ролей — аналогично, точечно перезаписываем только изменившиеся роли
    state.roles.forEach(role => {
      const before = JSON.stringify({ permissions: role.permissions, actions: role.actions });
      role.permissions = sanitizePermissions(role.permissions);
      role.actions = sanitizeActions(role.actions);
      const after = JSON.stringify({ permissions: role.permissions, actions: role.actions });
      if (before !== after){
        stmt.updateRoleRow.run(roleToJson(role), role.id);
      }
    });

    console.log(`[db] Загружено из ${DB_FILE}: ${state.reserveRows.length} в резерве, ${state.employeePool.length} в общем списке, ${state.roles.length} ролей, ${state.positionCategories.length} категорий должностей`);
  } catch (err){
    console.error('[db] Не удалось прочитать базу, создаю новую взамен повреждённой:', err.message);
    sqlite.exec('DELETE FROM reserve_rows; DELETE FROM employee_pool; DELETE FROM roles; DELETE FROM position_categories; DELETE FROM meta;');
    state = seedState();
    bulkInsertState(state);
  }
}

load();

function getState(){
  return {
    reserveRows: state.reserveRows,
    employeePool: state.employeePool,
    roles: state.roles,
    positionCategories: state.positionCategories,
  };
}

function findColumn(key){
  return COLUMNS.find(c => c.key === key);
}

/** Обновить значение одной ячейки. Возвращает только изменённую строку, а не всё состояние
 *  целиком — правка одной ячейки не имеет побочных эффектов на другие строки. В SQLite это
 *  теперь ещё и означает UPDATE ровно одной строки таблицы reserve_rows по id, а не
 *  перезапись всего файла базы — стоимость правки больше не растёт вместе с числом строк. */
function updateCell(rowId, col, value){
  const row = state.reserveRows.find(r => r.id === rowId);
  if (!row) throw new Error('Строка резервиста не найдена');

  const colDef = findColumn(col);
  if (!colDef) throw new Error('Неизвестное поле: ' + col);
  if (colDef.type === 'auto' || colDef.type === 'autoDate' || colDef.type === 'devRecords' || colDef.type === 'empty'){
    throw new Error('Поле "' + colDef.label + '" недоступно для ручного редактирования');
  }
  if (colDef.type === 'positionSelect'){
    // у "Потенциальной должности" своя связанная логика (проверка допустимости по категории,
    // поиск/создание записи в истории) — редактируется только через updatePotentialPosition,
    // не через этот общий метод одного поля
    throw new Error('Поле "' + colDef.label + '" редактируется через отдельный запрос');
  }

  row.values[col] = value;
  timedSqlite(`updateCell rowId=${rowId}`, () => stmt.updateRow.run(JSON.stringify(row.values), rowId));
  return row;
}

/** Сменить "активную" потенциальную должность сотрудника. Проверяет, что новая должность
 *  реально доступна для его "Текущей должности" (по настроенным категориям — см.
 *  getEligiblePotentialPositions), затем либо переключается на уже существующую запись
 *  истории (её % и дата HARD подставляются как есть — прогресс никуда не делся), либо
 *  заводит новую запись с нуля (0%, без даты HARD), если по этой должности прогресса
 *  ещё не было. Прежние записи истории по другим должностям не теряются — к ним можно
 *  будет вернуться, просто снова переключившись. */
function updatePotentialPosition(rowId, newPosition){
  const row = state.reserveRows.find(r => r.id === rowId);
  if (!row) throw new Error('Строка резервиста не найдена');

  const pos = (newPosition || '').trim();
  if (!pos) throw new Error('Не указана потенциальная должность');

  const eligible = getEligiblePotentialPositions(row.values.curPos, state.positionCategories);
  if (!eligible.includes(pos)){
    throw new Error(`Должность "${pos}" недоступна для текущей должности "${row.values.curPos}"`);
  }

  row.values.potPos = pos;

  const tracks = Array.isArray(row.values.devTracks) ? row.values.devTracks : [];
  const existing = tracks.find(t => t.position === pos);
  if (!existing){
    tracks.push({ position: pos, program: `Кадровый резерв на должность ${pos}`, percent: 0, hardDate: '' });
    row.values.devTracks = tracks;
  }
  // если запись для этой должности уже есть в истории — не трогаем её,
  // % и дата HARD уже там, куда нужно

  timedSqlite(`updatePotentialPosition rowId=${rowId}`, () => stmt.updateRow.run(JSON.stringify(row.values), rowId));
  return row;
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

  const tx = sqlite.transaction(() => {
    stmt.insertRow.run(newRow.id, JSON.stringify(newRow.values));
    stmt.deletePool.run(poolId);
    stmt.setMeta.run('rowIdCounter', String(state.rowIdCounter));
  });
  tx();

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

  const tx = sqlite.transaction(() => {
    stmt.deleteRow.run(rowId);
    stmt.insertPool.run(poolEntry.id, JSON.stringify(poolEntry));
  });
  tx();

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
    actions: blankActions(),
  };
  state.roles.push(role);

  const tx = sqlite.transaction(() => {
    stmt.insertRole.run(role.id, roleToJson(role));
    stmt.setMeta.run('roleIdCounter', String(state.roleIdCounter));
  });
  tx();

  return getState();
}

function updateRole(roleId, name, positions){
  const role = state.roles.find(r => r.id === roleId);
  if (!role) throw new Error('Роль не найдена');
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Название роли не может быть пустым');
  role.name = cleanName;
  role.positions = Array.isArray(positions) ? positions.filter(Boolean) : [];

  stmt.updateRoleRow.run(roleToJson(role), roleId);
  return getState();
}

function updateRolePermissions(roleId, permissions, actions){
  const role = state.roles.find(r => r.id === roleId);
  if (!role) throw new Error('Роль не найдена');
  // sanitizePermissions/sanitizeActions сами принудительно приведут данные к безопасному
  // виду (например, edit:false для нередактируемых полей), даже если с клиента пришло
  // что-то другое — это защита не только для UI, но и для API.
  role.permissions = sanitizePermissions(permissions);
  role.actions = sanitizeActions(actions);

  stmt.updateRoleRow.run(roleToJson(role), roleId);
  return getState();
}

function deleteRole(roleId){
  const idx = state.roles.findIndex(r => r.id === roleId);
  if (idx === -1) throw new Error('Роль не найдена');
  state.roles.splice(idx, 1);

  stmt.deleteRoleRow.run(roleId);
  return getState();
}

/* ===================== КАТЕГОРИИ ДОЛЖНОСТЕЙ ===================== */
// Настраивают, какие "Потенциальные должности" доступны сотруднику в зависимости от его
// "Текущей должности" — см. positionSelect в columns.js и getEligiblePotentialPositions.

function createPositionCategory(rawCategory){
  const clean = sanitizePositionCategory(rawCategory);
  if (!clean.name) throw new Error('Название категории не может быть пустым');
  state.positionCategoryIdCounter = (state.positionCategoryIdCounter || 0) + 1;
  const category = { id: 'poscat_' + state.positionCategoryIdCounter, ...clean };
  state.positionCategories.push(category);

  const tx = sqlite.transaction(() => {
    stmt.insertPositionCategory.run(category.id, positionCategoryToJson(category));
    stmt.setMeta.run('positionCategoryIdCounter', String(state.positionCategoryIdCounter));
  });
  tx();

  return getState();
}

function updatePositionCategory(id, rawCategory){
  const category = state.positionCategories.find(c => c.id === id);
  if (!category) throw new Error('Категория не найдена');
  const clean = sanitizePositionCategory(rawCategory);
  if (!clean.name) throw new Error('Название категории не может быть пустым');
  category.name = clean.name;
  category.currentPositions = clean.currentPositions;
  category.potentialPositions = clean.potentialPositions;

  stmt.updatePositionCategoryRow.run(positionCategoryToJson(category), id);
  return getState();
}

function deletePositionCategory(id){
  const idx = state.positionCategories.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Категория не найдена');
  state.positionCategories.splice(idx, 1);

  stmt.deletePositionCategoryRow.run(id);
  return getState();
}

module.exports = {
  getState,
  updateCell,
  updatePotentialPosition,
  addToReserve,
  removeFromReserve,
  createRole,
  updateRole,
  updateRolePermissions,
  deleteRole,
  createPositionCategory,
  updatePositionCategory,
  deletePositionCategory,
  DATA_FILE: DB_FILE,
};
