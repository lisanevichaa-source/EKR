// Единое описание структуры реестра резервистов.
// Используется и сервером (для дефолтных значений при добавлении сотрудника),
// и фронтендом (для построения таблицы, фильтров и т.д.) — отдаётся через GET /api/meta.

const GROUPS = [
  { key:'core',       label:'Основное' },
  { key:'contacts',   label:'Контакты и заявка' },
  { key:'geo',        label:'География и магазин' },
  { key:'dev',        label:'Развитие и мотивация' },
  { key:'assess',     label:'Оценка HARD / SOFT' },
  { key:'manager',    label:'Руководитель' },
  { key:'reloc',      label:'Релокация' },
  { key:'assignment', label:'Назначение и ИПР' },
];

// Типы полей:
//   auto           — автоматически, никогда не редактируется (данные из СМскилл/Pub3)
//   autoDate       — то же самое, но по смыслу это дата (значение уже хранится в читаемом формате)
//   autoEditable   — изначально заполняется автоматически, но роль с правом edit может изменить значение
//   devRecords     — автоматически, никогда не редактируется; сотрудник может развиваться сразу на
//                    несколько должностей одновременно — реальное значение лежит не в самом столбце,
//                    а в общем списке row.values.devTracks (см. DEV_TRACKS_KEY), столбец лишь показывает
//                    один из атрибутов записи (recordField) в сводном виде с попапом-расшифровкой.
//                    Если задан summaryField — в самой ячейке показывается именно он (например, процент
//                    прохождения программы), а recordField всё равно используется для фильтра по столбцу
//                    (например, фильтровать по названию программы, даже если в ячейке виден только %).
//                    showCount:true — единственный столбец из связки, который показывает "+N" при
//                    нескольких должностях; у остальных столбцов той же связки индикатор не дублируется.
//   select         — выпадающий список
//   free           — свободный ввод текстом
//   date           — свободный ввод через календарь
//   empty          — источник ещё не определён, поле всегда пустое и нередактируемое
const COLUMNS = [
  { key:'fio',             label:'ФИО',                                   group:'core',       type:'auto',  value:'Анисенко Никита Владимирович' },
  { key:'status',          label:'Статус',                                group:'core',       type:'select',
    options:['Назначен','В КР','Аннулировано','Развиваем на ТД','Тест Soft','Сессия ОС'],
    value:'Назначен' },
  { key:'reqDate',         label:'Дата заявки',                           group:'contacts',   type:'autoDate', value:'13.04.2023' },
  { key:'employeeComment', label:'Комментарий сотрудника',                group:'contacts',   type:'auto',  value:'Передумал' },
  { key:'email',           label:'Почта кандидата',                       group:'contacts',   type:'auto',  value:'primer_1@yandex.ru' },
  { key:'phone',           label:'Номер телефона',                        group:'contacts',   type:'auto',  value:'+7 911 111 11 11' },
  { key:'region',          label:'Регион',                                group:'geo',        type:'auto',  value:'Поволжский регион' },
  { key:'depart',          label:'Отделение',                             group:'geo',        type:'auto',  value:'Казанское отделение' },
  { key:'city',            label:'Город проживания',                      group:'geo',        type:'auto',  value:'Казань' },
  { key:'shop',            label:'Магазин',                               group:'geo',        type:'auto',  value:'12345' },
  { key:'grade',           label:'Грейд магазина',                        group:'geo',        type:'auto',  value:'401' },
  { key:'motivation',      label:'Мотивация',                             group:'dev',        type:'auto',  value:'Бригадная' },
  { key:'curPos',          label:'Текущая должность',                     group:'core',       type:'auto',  value:'Продавец' },
  { key:'ipr',             label:'Наличие ИПР',                           group:'dev',        type:'auto',  value:'Да' },
  { key:'potPos',          label:'Потенциальная должность',               group:'core',       type:'devRecords', recordField:'position', showCount:true },
  { key:'training',        label:'Обучение в кадровый резерв',            group:'dev',        type:'devRecords', recordField:'program', summaryField:'percent' },
  { key:'hardDate',        label:'Дата HARD',                             group:'assess',     type:'devRecords', recordField:'hardDate' },
  { key:'soft',            label:'Оценка SOFT',                           group:'assess',     type:'select',
    options:['Успешно пройдено','Тест направлен','Не пройдено','Пройдено не успешно','Опционально'],
    value:'Тест направлен' },
  { key:'softDate',        label:'Дата SOFT',                             group:'assess',     type:'autoDate', value:'23.06.2021' },
  { key:'managerFio',      label:'ФИО действующего руководителя',         group:'manager',    type:'auto',  value:'Иванов Иван Директорович' },
  { key:'relocReady',      label:'Готовность к релокации',                group:'reloc',      type:'auto',  value:'Не готов' },
  { key:'reloc',           label:'Релокация',                             group:'reloc',      type:'auto',  value:'По региону' },
  { key:'krStatus',        label:'Статус по КР',                         group:'core',       type:'select',
    options:['Да','Нет'], value:'Да' },
  { key:'krDate',          label:'Дата зачисления КР',                    group:'core',       type:'date',  value:'2025-01-01' },
  { key:'assignment',      label:'Тип назначения',                        group:'assignment', type:'select',
    options:['Временное','Постоянное'], value:'Временное' },
  { key:'assignDate',      label:'Дата назначения',                       group:'assignment', type:'date',  value:'2026-01-01' },
  { key:'tempEndDate',     label:'Дата окончания временного назначения',  group:'assignment', type:'date',  value:'2026-03-01' },
  { key:'assignPlace',     label:'Место назначения',                      group:'assignment', type:'select',
    options:['СМ_1234','СМ_20144','СМ_20531','СМ_20812','СМ_20933','СМ_21044','СМ_21102','СМ_21255'],
    value:'СМ_1234' },
  { key:'managerComment',  label:'Комментарий менеджера по оценке',       group:'assignment', type:'free',  value:'Молодец, берем' },
  { key:'managerAtEntry',  label:'Руководитель в момент вступления в КР', group:'manager',    type:'autoEditable',
    options:['—','Иванов Руководитель Петрович','Петров Руководитель Петрович','Сидоров Руководитель Петрович',
             'Кузнецов Руководитель Петрович','Смирнов Руководитель Петрович','Волков Руководитель Петрович',
             'Морозов Руководитель Петрович','Соколов Руководитель Петрович','Лебедев Руководитель Петрович',
             'Захаров Руководитель Петрович'],
    value:'Иванов Руководитель Петрович' },
  { key:'shopAtEntry',     label:'Магазин в момент вступления в КР',      group:'assignment', type:'autoEditable',
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
  { position:'Старший кассир',     program:'Кадровый резерв на должность Старший кассир',     percent:89,  hardDate:'' },
  { position:'Начальник отдела',   program:'Кадровый резерв на должность Начальник отдела',   percent:100, hardDate:'2026-02-01' },
  { position:'Заведующий складом', program:'Кадровый резерв на должность Заведующий складом', percent:11,  hardDate:'' },
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
  'Заведующий складом',
  'Сотрудник',
];

// Столбцы, тип которых делает их принципиально нередактируемыми ни для какой роли
// (данные приходят автоматически из смежных систем — Pub3 -> СМскилл). autoEditable сюда
// намеренно НЕ входит — такие поля заполняются автоматически, но роль с правом edit может их менять.
const NON_EDITABLE_TYPES = ['auto', 'autoDate', 'devRecords', 'empty'];

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
   'hardDate','soft','softDate','managerFio','relocReady','reloc',
   'assignment','assignDate','ipr'].forEach(k => { managerPerms[k].view = true; });

  const employeePerms = blankPermissions();
  ['fio','curPos','potPos','krStatus','krDate','relocReady','status'].forEach(k => { employeePerms[k].view = true; });

  return [
    {
      id: 'role_manager',
      name: 'Руководитель',
      positions: ['Директор магазина', 'Директор отделения (ДО)'],
      permissions: sanitizePermissions(managerPerms),
    },
    {
      id: 'role_employee',
      name: 'Сотрудник',
      positions: ['Сотрудник'],
      permissions: sanitizePermissions(employeePerms),
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
  DEV_TRACKS_KEY, DEMO_DEV_TRACKS, DEV_TRACKS_VARIANTS, parseLegacyDevTracks,
};
