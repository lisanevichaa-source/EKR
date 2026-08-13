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

const COLUMNS = [
  { key:'fio',          label:'ФИО',                                  group:'core',       type:'auto',  value:'Анисенко Никита Владимирович' },
  { key:'status',       label:'Статус',                               group:'core',       type:'select',
    options:['Уволен','Назначен','Декрет','в КР','аннулировано','развиваем на ТД','проходит обучение','Мобилизован','обучение пройдено','тест Soft','тест Hard','сессия ОС','ОС руководителя','встреча с HR','КР ИИ МР','встреча с ЛПР'],
    value:'Уволен' },
  { key:'reqDate',      label:'Дата заявки',                          group:'contacts',   type:'free',  value:'13.04.2023' },
  { key:'email',        label:'Почта кандидата',                      group:'contacts',   type:'auto',  value:'primer_1@yandex.ru' },
  { key:'phone',        label:'Номер телефона',                       group:'contacts',   type:'auto',  value:'+7 911 111 11 11' },
  { key:'region',       label:'Регион',                               group:'geo',        type:'auto',  value:'Поволжский регион' },
  { key:'depart',       label:'Отделение',                            group:'geo',        type:'auto',  value:'Казанское отделение' },
  { key:'city',         label:'Город проживания',                     group:'geo',        type:'auto',  value:'Казань' },
  { key:'shop',         label:'Магазин',                              group:'geo',        type:'auto',  value:'12345' },
  { key:'grade',        label:'Грейд магазина',                       group:'geo',        type:'empty' },
  { key:'motivation',   label:'Мотивация',                            group:'dev',        type:'empty' },
  { key:'curPos',       label:'Текущая должность',                    group:'core',       type:'auto',  value:'Продавец' },
  { key:'potPos',       label:'Потенциальная должность',              group:'core',       type:'select',
    options:['Старший кассир','Начальник отдела','Заведующий складом','Директор магазина','Директор по Продажам Региона','Директор отделения','Начальник отдела УСМ','Администратор','Администратор моно','Ведущий Региональный Мерчендайзер','Старший продавец'],
    value:'Старший кассир' },
  { key:'sed',          label:'Замещение СЭД',                        group:'dev',        type:'select',
    options:['Да один раз','Да, более одного','Нет'], value:'Да один раз' },
  { key:'hard',         label:'Оценка HARD (sm_skills)',               group:'assess',     type:'auto',  value:'Успешно пройдено' },
  { key:'hardDate',     label:'Дата HARD',                            group:'assess',     type:'auto',  value:'01.12.2022' },
  { key:'soft',         label:'Оценка SOFT',                          group:'assess',     type:'auto',  value:'Тест направлен' },
  { key:'softDate',     label:'Дата SOFT',                            group:'assess',     type:'auto',  value:'23.06.2021' },
  { key:'managerFio',   label:'ФИО действующего руководителя',        group:'manager',    type:'auto',  value:'Иванов Иван Директорович' },
  { key:'managerRec',   label:'ОС руководителя',                      group:'manager',    type:'select',
    options:['Рекомендован','Не рекомендован','Ожидание ОС'], value:'Не рекомендован' },
  { key:'relocReady',   label:'Готовность к релокации',                group:'reloc',      type:'auto',  value:'Не готов' },
  { key:'relocNotes',   label:'Релокация (примечания)',                group:'reloc',      type:'auto',  value:'По региону' },
  { key:'krStatus',     label:'Статус по КР',                         group:'core',       type:'select',
    options:['Кадровый резерв','Развитие на текущую должность'], value:'Кадровый резерв' },
  { key:'krDate',       label:'Дата зачисления КР',                   group:'core',       type:'date',  value:'2025-01-01' },
  { key:'assignment',   label:'Назначение',                           group:'assignment', type:'select',
    options:['Временное','Постоянное'], value:'Временное' },
  { key:'assignDate',   label:'Дата назначения',                      group:'assignment', type:'free',  value:'01.01.2026' },
  { key:'ipr',          label:'Наличие ИПР',                          group:'assignment', type:'auto',  value:'Да' },
  { key:'tempEndDate',  label:'Дата окончания временного назначения', group:'assignment', type:'free',  value:'' },
  { key:'assignPlace',  label:'Место назначения',                     group:'assignment', type:'free',  value:'' },
  { key:'assignRegion', label:'Регион назначения',                    group:'assignment', type:'free',  value:'' },
  { key:'assignDepart', label:'Отделение назначения',                 group:'assignment', type:'free',  value:'' },
  { key:'assignCity',   label:'Город назначения',                     group:'assignment', type:'free',  value:'' },
  { key:'deptChange',   label:'Была смена отделения/региона',         group:'assignment', type:'free',  value:'' },
  { key:'comment',      label:'Комментарий',                          group:'assignment', type:'free',  value:'' },
];

// Поля, которые физически приходят из HR-системы по сотруднику —
// используются и в общем списке (пул), и как "автоматические" поля резервиста.
const SOURCE_FIELDS = ['fio','email','phone','region','depart','city','shop','curPos'];

// Разумные значения по умолчанию для выпадающих списков при добавлении сотрудника в резерв.
const SELECT_DEFAULTS = {
  status:'в КР',
  sed:'Нет',
  managerRec:'Ожидание ОС',
  krStatus:'Кадровый резерв',
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

module.exports = { GROUPS, COLUMNS, SOURCE_FIELDS, SELECT_DEFAULTS, INITIAL_EMPLOYEE_POOL };
