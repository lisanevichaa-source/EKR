// Единое описание структуры реестра резервистов.
// Используется и сервером (для дефолтных значений при добавлении сотрудника),
// и фронтендом (для построения таблицы, фильтров и т.д.) — отдаётся через GET /api/meta.

const GROUPS = [
  { key:'personal',    label:'Персональные данные' },
  { key:'workData',    label:'Кадровые данные' },
  { key:'potential',   label:'Потенциал развития' },
  { key:'development', label:'Сведения о развитии' },
];

// Типы полей:
//   auto           — автоматически, никогда не редактируется (данные из СМскилл/Pub3)
//   autoDate       — то же самое, но по смыслу это дата (значение уже хранится в читаемом формате)
//   autoEditable   — изначально заполняется автоматически, но роль с правом edit может изменить значение
//   positionSelect — "Потенциальная должность". Реальное редактируемое значение (row.values.potPos),
//                    но список доступных вариантов не фиксированный, а зависит от "Текущей должности"
//                    сотрудника — см. POSITION_CATEGORIES и getEligiblePotentialPositions() ниже.
//   devRecords     — автоматически, никогда не редактируется напрямую. У сотрудника есть "история" —
//                    массив row.values.devTracks из записей { position, program, percent, hardDate },
//                    по одной на каждую должность, по которой когда-либо был прогресс. Столбцы этого
//                    типа (Обучение / Дата HARD) показывают запись из devTracks, У КОТОРОЙ position
//                    совпадает с текущим значением row.values.potPos — то есть "активную" в данный
//                    момент. При смене потенциальной должности (см. updatePotentialPosition в db.js):
//                    если по новой должности запись в истории уже есть — подставляются её % и дата HARD
//                    как есть (прогресс никуда не делся); если записи ещё нет — создаётся новая, с 0%
//                    и пустой датой HARD. Так переключение между уже пройденными программами показывает
//                    настоящий прогресс, а не просто последнее выбранное значение.
//                    Если задан summaryField — в самой ячейке показывается именно он (например, процент
//                    прохождения программы), а recordField всё равно используется для фильтра по столбцу
//                    (например, фильтровать по названию программы, даже если в ячейке виден только %).
//   select         — выпадающий список
//   free           — свободный ввод текстом
//   date           — свободный ввод через календарь
//   empty          — источник ещё не определён, поле всегда пустое и нередактируемое
const COLUMNS = [
  // ---------- Персональные данные ----------
  { key:'fio',             label:'ФИО',                                   group:'personal',   type:'auto',  value:'Анисенко Никита Владимирович' },
  { key:'status',          label:'Статус',                                group:'personal',   type:'select',
    options:['Назначен','В КР','Аннулировано','Развиваем на ТД','Тест Soft','Сессия ОС'],
    value:'Назначен' },
  { key:'reqDate',         label:'Дата заявки',                           group:'personal',   type:'autoDate', value:'13.04.2023' },
  { key:'employeeComment', label:'Комментарий сотрудника',                group:'personal',   type:'auto',  value:'Передумал' },
  { key:'email',           label:'Почта кандидата',                       group:'personal',   type:'auto',  value:'primer_1@yandex.ru' },
  { key:'phone',           label:'Номер телефона',                        group:'personal',   type:'auto',  value:'+7 911 111 11 11' },

  // ---------- Кадровые данные ----------
  { key:'region',          label:'Регион',                                group:'workData',   type:'auto',  value:'Поволжский регион' },
  { key:'depart',          label:'Отделение',                             group:'workData',   type:'auto',  value:'Казанское отделение' },
  { key:'city',            label:'Город проживания',                      group:'workData',   type:'auto',  value:'Казань' },
  { key:'shop',            label:'Магазин',                               group:'workData',   type:'auto',  value:'12345' },
  { key:'managerFio',      label:'ФИО действующего руководителя',         group:'workData',   type:'auto',  value:'Иванов Иван Директорович' },
  { key:'grade',           label:'Грейд магазина',                        group:'workData',   type:'auto',  value:'401' },
  { key:'motivation',      label:'Мотивация',                             group:'workData',   type:'auto',  value:'Бригадная' },

  // ---------- Потенциал развития ----------
  { key:'curPos',          label:'Текущая должность',                     group:'potential',  type:'auto',  value:'Продавец' },
  { key:'potPos',          label:'Потенциальная должность',               group:'potential',  type:'positionSelect' },
  { key:'ipr',             label:'Наличие ИПР',                           group:'potential',  type:'auto',  value:'Да' },
  { key:'training',        label:'Обучение в кадровый резерв',            group:'potential',  type:'devRecords', recordField:'program', summaryField:'percent' },
  { key:'hardDate',        label:'Дата HARD',                             group:'potential',  type:'devRecords', recordField:'hardDate' },
  { key:'soft',            label:'Оценка SOFT',                           group:'potential',  type:'select',
    options:['Успешно пройдено','Тест направлен','Не пройдено','Пройдено не успешно','Опционально'],
    value:'Тест направлен' },
  { key:'softDate',        label:'Дата SOFT',                             group:'potential',  type:'autoDate', value:'23.06.2021' },
  { key:'relocReady',      label:'Готовность к релокации',                group:'potential',  type:'select',
    options:['Готов по всей сети','Готов в рамках региона','Готов в рамках отделения','Готов в определённые города','Не готов'],
    value:'Не готов' },

  // ---------- Сведения о развитии ----------
  { key:'krStatus',        label:'Статус по КР',                         group:'development', type:'select',
    options:['Да','Нет'], value:'Да' },
  { key:'krDate',          label:'Дата зачисления КР',                    group:'development', type:'date',  value:'2025-01-01' },
  { key:'assignment',      label:'Тип назначения',                        group:'development', type:'select',
    options:['Временное','Постоянное'], value:'Временное' },
  { key:'assignDate',      label:'Дата назначения',                       group:'development', type:'date',  value:'2026-01-01' },
  { key:'tempEndDate',     label:'Дата окончания временного назначения',  group:'development', type:'date',  value:'2026-03-01' },
  { key:'assignPlace',     label:'Место назначения',                      group:'development', type:'select',
    options:['СМ_1234','СМ_20144','СМ_20531','СМ_20812','СМ_20933','СМ_21044','СМ_21102','СМ_21255'],
    value:'СМ_1234' },
  { key:'managerComment',  label:'Комментарий менеджера по оценке',       group:'development', type:'free',  value:'Молодец, берем' },
  { key:'managerAtEntry',  label:'Руководитель в момент вступления в КР', group:'development', type:'autoEditable',
    options:['—','Иванов Руководитель Петрович','Петров Руководитель Петрович','Сидоров Руководитель Петрович',
             'Кузнецов Руководитель Петрович','Смирнов Руководитель Петрович','Волков Руководитель Петрович',
             'Морозов Руководитель Петрович','Соколов Руководитель Петрович','Лебедев Руководитель Петрович',
             'Захаров Руководитель Петрович'],
    value:'Иванов Руководитель Петрович' },
  { key:'shopAtEntry',     label:'Магазин в момент вступления в КР',      group:'development', type:'autoEditable',
    options:['—','СМ_1234','СМ_5678','СМ_9012','СМ_3456','СМ_7890','СМ_2345','СМ_6789','СМ_0123','СМ_4567','СМ_8901'],
    value:'СМ_1234' },
];

// Поля, которые физически приходят из HR-системы по сотруднику —
// используются и в общем списке (пул), и как "автоматические" поля резервиста.
const SOURCE_FIELDS = ['fio','email','phone','region','depart','city','shop','curPos'];

// Разумные значения по умолчанию для выпадающих списков при добавлении сотрудника в резерв.
const SELECT_DEFAULTS = {
  status:'Назначен',
  soft:'Опционально',
  krStatus:'Да',
  assignment:'Временное',
  relocReady:'Не готов',
};

const INITIAL_EMPLOYEE_POOL = [
  { id:'p1',  fio:'Смирнова Ольга Павловна',      email:'o.smirnova@company.ru',   phone:'+7 916 220 14 02', region:'Центральный регион',     depart:'Тверское отделение',         city:'Тверь',            shop:'20144', curPos:'Продавец-консультант' },
  { id:'p2',  fio:'Кузнецов Артём Сергеевич',     email:'a.kuznetsov@company.ru',  phone:'+7 921 340 55 19', region:'Северо-Западный регион',  depart:'Невское отделение',          city:'Санкт-Петербург',  shop:'20531', curPos:'Кассир' },
  { id:'p3',  fio:'Волкова Дарья Игоревна',       email:'d.volkova@company.ru',    phone:'+7 383 118 02 47', region:'Сибирский регион',        depart:'Новосибирское отделение',    city:'Новосибирск',      shop:'20812', curPos:'Администратор зала' },
  { id:'p4',  fio:'Петров Максим Олегович',       email:'m.petrov@company.ru',     phone:'+7 343 902 71 30', region:'Уральский регион',        depart:'Екатеринбургское отделение', city:'Екатеринбург',     shop:'20933', curPos:'Продавец' },
  { id:'p5',  fio:'Никитина Елена Александровна', email:'e.nikitina@company.ru',   phone:'+7 863 447 12 85', region:'Южный регион',            depart:'Ростовское отделение',       city:'Ростов-на-Дону',   shop:'21044', curPos:'Старший продавец' },
  { id:'p6',  fio:'Ковалёв Дмитрий Викторович',   email:'d.kovalev@company.ru',    phone:'+7 861 205 63 71', region:'Южный регион',            depart:'Краснодарское отделение',    city:'Краснодар',        shop:'21102', curPos:'Кассир' },
  { id:'p7',  fio:'Морозова Анна Дмитриевна',     email:'a.morozova@company.ru',   phone:'+7 846 337 90 12', region:'Приволжский регион',      depart:'Самарское отделение',        city:'Самара',           shop:'21255', curPos:'Продавец-консультант' },
  { id:'p8',  fio:'Соколов Иван Андреевич',       email:'i.sokolov@company.ru',    phone:'+7 347 519 44 67', region:'Приволжский регион',      depart:'Уфимское отделение',         city:'Уфа',              shop:'21309', curPos:'Администратор' },
  { id:'p9',  fio:'Лебедева Виктория Романовна',  email:'v.lebedeva@company.ru',   phone:'+7 473 228 06 53', region:'Центральный регион',      depart:'Воронежское отделение',      city:'Воронеж',          shop:'21418', curPos:'Продавец' },
  { id:'p10', fio:'Захаров Егор Николаевич',      email:'e.zakharov@company.ru',   phone:'+7 342 611 39 24', region:'Приволжский регион',      depart:'Пермское отделение',         city:'Пермь',            shop:'21527', curPos:'Кассир' },
  { id:'p11', fio:'Орлова Мария Сергеевна',       email:'m.orlova@company.ru',     phone:'+7 351 774 82 06', region:'Уральский регион',        depart:'Челябинское отделение',      city:'Челябинск',        shop:'21633', curPos:'Старший кассир' },
  { id:'p12', fio:'Григорьев Павел Игоревич',     email:'p.grigoriev@company.ru',  phone:'+7 391 502 17 88', region:'Сибирский регион',        depart:'Красноярское отделение',     city:'Красноярск',       shop:'21744', curPos:'Продавец-консультант' },
];

// Ключ, под которым в row.values хранится общий список записей развития сотрудника —
// см. столбцы типа devRecords (Потенциальная должность / Обучение в КР / Дата HARD).
// Каждая запись: { position, program, percent, hardDate }. hardDate — ISO-строка или ''.
const DEV_TRACKS_KEY = 'devTracks';

// Демо-набор "по умолчанию" — используется как резервное значение, если понадобится одна
// строка вне контекста сид-данных. Для самих 10 сид-строк реестра ниже используется
// DEV_TRACKS_VARIANTS — у каждой строки свой, разный набор, специально для демонстрации
// фильтров (одинаковые данные у всех строк фильтр никак не показывают).
// Важно: дата HARD проставляется только в момент 100%-го прохождения программы — пока
// процент меньше 100, hardDate всегда пустой (''), а не "почти готовая" дата.
const DEMO_DEV_TRACKS = [
  { position:'Начальник отдела', program:'Кадровый резерв на должность Начальник отдела', percent:100, hardDate:'2026-02-01' },
];

// Разные наборы для 10 сид-строк — где-то одна должность, где-то две-три, где-то пусто.
// Так на демо можно реально показать, как фильтр по столбцу отсеивает часть сотрудников,
// а не просто ничего не меняет, потому что у всех одинаковые данные.
// hardDate непустой ставим только там, где percent:100 — это единственный случай,
// когда дата HARD в принципе может существовать.
const DEV_TRACKS_VARIANTS = [
  // 1. Полный пример — три должности, одна уже завершена на 100%
  [
    { position:'Старший кассир',     program:'Кадровый резерв на должность Старший кассир',     percent:89,  hardDate:'' },
    { position:'Начальник отдела',   program:'Кадровый резерв на должность Начальник отдела',   percent:100, hardDate:'2026-02-01' },
    { position:'Заведующий складом', program:'Кадровый резерв на должность Заведующий складом', percent:11,  hardDate:'' },
  ],
  // 2. Одна должность, программа ещё не завершена
  [
    { position:'Старший кассир', program:'Кадровый резерв на должность Старший кассир', percent:76, hardDate:'' },
  ],
  // 3. Одна должность, другая
  [
    { position:'Начальник отдела', program:'Кадровый резерв на должность Начальник отдела', percent:54, hardDate:'' },
  ],
  // 4. Две должности, одна из них полностью завершена
  [
    { position:'Директор магазина', program:'Кадровый резерв на должность Директор магазина', percent:67,  hardDate:'' },
    { position:'Начальник отдела',  program:'Кадровый резерв на должность Начальник отдела',  percent:100, hardDate:'2026-03-01' },
  ],
  // 5. Одна должность, низкий процент
  [
    { position:'Заведующий складом', program:'Кадровый резерв на должность Заведующий складом', percent:23, hardDate:'' },
  ],
  // 6. Две должности из смежных треков, обе ещё в процессе
  [
    { position:'Старший кассир',     program:'Кадровый резерв на должность Старший кассир',     percent:45, hardDate:'' },
    { position:'Заведующий складом', program:'Кадровый резерв на должность Заведующий складом', percent:60, hardDate:'' },
  ],
  // 7. Совсем без потенциальных должностей — ещё не определился
  [],
  // 8. Две должности, обе ещё в процессе (наглядный случай "высокий % без даты")
  [
    { position:'Старший кассир',   program:'Кадровый резерв на должность Старший кассир',   percent:92, hardDate:'' },
    { position:'Начальник отдела', program:'Кадровый резерв на должность Начальник отдела', percent:30, hardDate:'' },
  ],
  // 9. Одна должность — директорский трек, полностью завершена
  [
    { position:'Директор отделения (ДО)', program:'Кадровый резерв на должность Директор отделения', percent:100, hardDate:'2026-01-10' },
  ],
  // 10. Две должности, одна завершена, другая в процессе
  [
    { position:'Начальник отдела',   program:'Кадровый резерв на должность Начальник отдела',   percent:100, hardDate:'2026-01-20' },
    { position:'Заведующий складом', program:'Кадровый резерв на должность Заведующий складом', percent:40,  hardDate:'' },
  ],
];

// Справочник должностей для назначения ролей (страница "Роли и доступы").
// Это отдельный список, не связанный со значениями столбцов "Текущая/Потенциальная должность".
const POSITIONS = [
  'Директор магазина',
  'Директор отделения (ДО)',
  'Директор по продажам региона',
  'HR BP',
  'Менеджер по оценке',
  'Начальник отдела',
  'Старший кассир',
  'Старший продавец',
  'Заведующий складом',
  'Сотрудник',
];

// Категории текущих должностей — определяют, какие потенциальные должности сотрудник может
// выбрать в столбце "Потенциальная должность" (см. тип positionSelect выше), в зависимости
// от его "Текущей должности". Один и тот же сотрудник может попасть сразу в несколько
// категорий (если его curPos встречается в нескольких) — тогда доступные потенциальные
// должности объединяются (см. getEligiblePotentialPositions). "name" — рабочее название
// категории только для этого конфигуратора, сотрудникам и в основной таблице не показывается.
// Настраивается на странице "Роли и доступы" → вкладка "Категории должностей".
const POSITION_CATEGORIES_SEED = [
  { name:'Продающие',            currentPositions:['Продавец','Продавец К2','Продавец-кассир','Продавец-эксперт'], potentialPositions:['Начальник отдела','Заведующий складом','Старший кассир','Старший продавец'] },
  { name:'Кассовая линия',       currentPositions:['Кассир'],                                                       potentialPositions:['Старший кассир','Начальник отдела','Старший продавец'] },
  { name:'Складской персонал',   currentPositions:['Кладовщик','Мастер-эксперт СЦ','МСЦ'],                          potentialPositions:['Заведующий складом'] },
  { name:'Старшие специалисты',  currentPositions:['Старший кассир','Зав.склада','Старший продавец'],               potentialPositions:['Начальник отдела'] },
  { name:'Начальники отделов',   currentPositions:['Начальник отдела'],                                             potentialPositions:['Директор магазина'] },
  { name:'Директора магазинов',  currentPositions:['Директор магазина'],                                            potentialPositions:['Директор отделения (ДО)'] },
  { name:'Директора отделений',  currentPositions:['Директор отделения'],                                           potentialPositions:['Директор по продажам региона'] },
];

/** Список должностей, доступных для выбора в "Потенциальная должность" сотруднику с данной
 *  "Текущей должностью" — объединение потенциальных должностей всех категорий, куда входит
 *  currentPosition. Если currentPosition не входит ни в одну категорию — пустой список
 *  (это осознанный выбор: должность просто ещё не настроена, а не "доступно всё подряд"). */
function getEligiblePotentialPositions(currentPosition, categories){
  const eligible = new Set();
  (categories || []).forEach(cat => {
    if (Array.isArray(cat.currentPositions) && cat.currentPositions.includes(currentPosition)){
      (cat.potentialPositions || []).forEach(p => eligible.add(p));
    }
  });
  return Array.from(eligible);
}

/** Приводит присланные с клиента данные категории к безопасному виду: обрезает name,
 *  оставляет из currentPositions/potentialPositions только строки (защита от мусора в API). */
function sanitizePositionCategory(raw){
  const clean = arr => Array.isArray(arr) ? arr.filter(v => typeof v === 'string' && v.trim() !== '') : [];
  return {
    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    currentPositions: clean(raw?.currentPositions),
    potentialPositions: clean(raw?.potentialPositions),
  };
}

// Столбцы, тип которых делает их принципиально нередактируемыми ни для какой роли
// (данные приходят автоматически из смежных систем — Pub3 -> СМскилл). autoEditable сюда
// намеренно НЕ входит — такие поля заполняются автоматически, но роль с правом edit может их менять.
const NON_EDITABLE_TYPES = ['auto', 'autoDate', 'devRecords', 'empty'];

// Действия в реестре, не привязанные к конкретному полю — доступ к ним тоже настраивается
// по ролям, отдельно от видимости/редактирования столбцов.
const ACTIONS = [
  { key:'canAddEmployee',    label:'Добавление сотрудника в резерв' },
  { key:'canRemoveEmployee', label:'Удаление сотрудника из резерва' },
];

// Права на действия "по умолчанию" для новой роли — чистый лист, всё запрещено
// (та же логика, что и blankPermissions для полей).
function blankActions(){
  const actions = {};
  ACTIONS.forEach(a => { actions[a.key] = false; });
  return actions;
}

// Приводит присланные права на действия к текущему списку ACTIONS — отбрасывает
// устаревшие ключи, достраивает недостающие как false. Используется и при создании,
// и при обновлении роли, и при миграции уже сохранённых ролей.
function sanitizeActions(rawActions){
  const actions = blankActions();
  ACTIONS.forEach(a => { actions[a.key] = !!(rawActions && rawActions[a.key]); });
  return actions;
}

function isColumnEverEditable(colKey){
  const col = COLUMNS.find(c => c.key === colKey);
  return !!col && !NON_EDITABLE_TYPES.includes(col.type);
}

// Права доступа "по умолчанию" для новой роли — чистый лист, всё скрыто.
function blankPermissions(){
  const perms = {};
  COLUMNS.forEach(col => { perms[col.key] = { view: false, edit: false }; });
  return perms;
}

// Принудительно выставляет edit:false для полей, которые в принципе нельзя редактировать,
// независимо от того, что прислали с клиента. Используется и при создании, и при обновлении роли.
function sanitizePermissions(rawPerms){
  const perms = blankPermissions();
  COLUMNS.forEach(col => {
    const incoming = (rawPerms && rawPerms[col.key]) || {};
    const view = !!incoming.view;
    const edit = isColumnEverEditable(col.key) ? !!incoming.edit && view : false;
    perms[col.key] = { view, edit: edit };
  });
  return perms;
}

function seedRoles(){
  const managerPerms = blankPermissions();
  ['fio','status','curPos','potPos','krStatus','krDate','region','depart','city','shop',
   'hardDate','soft','softDate','managerFio','relocReady',
   'assignment','assignDate','ipr'].forEach(k => { managerPerms[k].view = true; });
  const managerActions = sanitizeActions({ canAddEmployee: true, canRemoveEmployee: false });

  const employeePerms = blankPermissions();
  ['fio','curPos','potPos','krStatus','krDate','relocReady','status'].forEach(k => { employeePerms[k].view = true; });
  const employeeActions = sanitizeActions({ canAddEmployee: false, canRemoveEmployee: false });

  return [
    {
      id: 'role_manager',
      name: 'Руководитель',
      positions: ['Директор магазина', 'Директор отделения (ДО)'],
      permissions: sanitizePermissions(managerPerms),
      actions: managerActions,
    },
    {
      id: 'role_employee',
      name: 'Сотрудник',
      positions: ['Сотрудник'],
      permissions: sanitizePermissions(employeePerms),
      actions: employeeActions,
    },
  ];
}

/** Миграция: в прошлой версии potPos/training/hardDate хранились как склеенный через ", "
 *  текст ("Старший кассир, Начальник отдела" / "Старший кассир 89, ..." / "Старший кассир 01.01.2026, ...").
 *  Восстанавливает из них массив структурированных записей — приблизительно, по позиции в списке,
 *  раз формат сам это писал в строгом порядке. Используется только при миграции старых файлов базы. */
function parseLegacyDevTracks(potPosStr, trainingStr, hardDateStr){
  const positions = (potPosStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (positions.length === 0) return [];
  const trainingParts = (trainingStr || '').split(',').map(s => s.trim()).filter(Boolean);
  const hardDateParts = (hardDateStr || '').split(',').map(s => s.trim()).filter(Boolean);

  return positions.map((position, i) => {
    let percent = '';
    const tMatch = (trainingParts[i] || '').match(/(\d+)\s*%?\s*$/);
    if (tMatch) percent = Number(tMatch[1]);

    let hardDate = '';
    const hMatch = (hardDateParts[i] || '').match(/(\d{2})\.(\d{2})\.(\d{4})\s*$/);
    if (hMatch) hardDate = `${hMatch[3]}-${hMatch[2]}-${hMatch[1]}`;

    return { position, program: position, percent, hardDate };
  });
}

module.exports = {
  GROUPS, COLUMNS, SOURCE_FIELDS, SELECT_DEFAULTS, INITIAL_EMPLOYEE_POOL,
  POSITIONS, isColumnEverEditable, blankPermissions, sanitizePermissions, seedRoles,
  ACTIONS, blankActions, sanitizeActions,
  DEV_TRACKS_KEY, DEMO_DEV_TRACKS, DEV_TRACKS_VARIANTS, parseLegacyDevTracks,
  POSITION_CATEGORIES_SEED, getEligiblePotentialPositions, sanitizePositionCategory,
};
