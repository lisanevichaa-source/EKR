const express = require('express');
const path = require('path');
const { GROUPS, COLUMNS, POSITIONS, RELOCATION_CITIES, ACTIONS } = require('./columns');
const db = require('./db');

const app = express();
app.use(express.json());

// --- API ---

app.get('/api/meta', (req, res) => {
  res.json({ groups: GROUPS, columns: COLUMNS, positions: POSITIONS, relocationCities: RELOCATION_CITIES, actions: ACTIONS });
});

app.get('/api/state', (req, res) => {
  res.json(db.getState());
});

app.patch('/api/reserve/:id', (req, res) => {
  const { col, value } = req.body || {};
  if (typeof col !== 'string') return res.status(400).json({ error: 'Не передано поле col' });
  try {
    const { row, relatedRows } = db.updateCell(req.params.id, col, value ?? '');
    // relatedRows — другие строки, изменившиеся вместе с этой (сейчас так бывает только для
    // "Готовности к релокации": значение общее для всех активных треков человека)
    const payload = { row };
    if (relatedRows && relatedRows.length > 0) payload.relatedRows = relatedRows;
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reserve', (req, res) => {
  const { employeeId, position } = req.body || {};
  if (!employeeId) return res.status(400).json({ error: 'Не передан employeeId' });
  if (!position) return res.status(400).json({ error: 'Не передана потенциальная должность' });
  try {
    res.json(db.addToReserve(employeeId, position));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/reserve/:id', (req, res) => {
  const { reason } = req.body || {};
  try {
    res.json(db.removeFromReserve(req.params.id, reason));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ручная простановка статуса "Назначен" прямо в ЭКР — блокирует трек немедленно и
// необратимо (см. раздел 2 документа, "Уже назначен"). Интерфейс обязан предупредить о
// необратимости ДО вызова — сам эндпоинт подтверждения не запрашивает.
app.post('/api/reserve/:id/mark-assigned', (req, res) => {
  try {
    res.json(db.markAsAssigned(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/reserve/:id/potential-position', (req, res) => {
  const { position } = req.body || {};
  if (typeof position !== 'string') return res.status(400).json({ error: 'Не передано поле position' });
  try {
    const row = db.updatePotentialPosition(req.params.id, position);
    res.json({ row });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// "Готовность к релокации" — используется личным кабинетом (см. /profile.html), обновляет
// значение сразу во всех строках этого сотрудника, а не в одной конкретной
app.patch('/api/employee/:employeeId/reloc-ready', (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== 'string') return res.status(400).json({ error: 'Не передано поле value' });
  try {
    res.json(db.updateRelocReadyForEmployee(req.params.employeeId, value));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// "Города релокации" — используется личным кабинетом, обновляет значение сразу во всех
// строках этого сотрудника; имеет смысл только при relocReady === 'Готов в определённые
// города' (проверяется на стороне db.updateRelocCitiesForEmployee)
app.patch('/api/employee/:employeeId/reloc-cities', (req, res) => {
  const { cities } = req.body || {};
  if (!Array.isArray(cities)) return res.status(400).json({ error: 'Не передано поле cities (ожидается массив)' });
  try {
    res.json(db.updateRelocCitiesForEmployee(req.params.employeeId, cities));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// "Не хочу развиваться" — используется личным кабинетом, убирает СРАЗУ ВСЕ активные треки
// сотрудника, обязательно требует причину
app.post('/api/employee/:employeeId/decline', (req, res) => {
  const { reason } = req.body || {};
  if (typeof reason !== 'string') return res.status(400).json({ error: 'Не передано поле reason' });
  try {
    res.json(db.declineAllTracksForEmployee(req.params.employeeId, reason));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Роли и доступы ---

app.post('/api/roles', (req, res) => {
  const { name, positions } = req.body || {};
  try {
    res.json(db.createRole(name, positions));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/roles/:id', (req, res) => {
  const { name, positions } = req.body || {};
  try {
    res.json(db.updateRole(req.params.id, name, positions));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/roles/:id/permissions', (req, res) => {
  const { permissions, actions } = req.body || {};
  try {
    res.json(db.updateRolePermissions(req.params.id, permissions || {}, actions || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/roles/:id', (req, res) => {
  try {
    res.json(db.deleteRole(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Категории должностей (настройка допустимых "Потенциальных должностей") ---

app.post('/api/position-categories', (req, res) => {
  try {
    res.json(db.createPositionCategory(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/position-categories/:id', (req, res) => {
  try {
    res.json(db.updatePositionCategory(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/position-categories/:id', (req, res) => {
  try {
    res.json(db.deletePositionCategory(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- Статика фронтенда ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Кадровый резерв — сервер запущен: http://localhost:${PORT}`);
  console.log(`Файл базы данных: ${db.DATA_FILE}`);
});
