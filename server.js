const express = require('express');
const path = require('path');
const { GROUPS, COLUMNS } = require('./columns');
const db = require('./db');

const app = express();
app.use(express.json());

// --- API ---

app.get('/api/meta', (req, res) => {
  res.json({ groups: GROUPS, columns: COLUMNS });
});

app.get('/api/state', (req, res) => {
  res.json(db.getState());
});

app.patch('/api/reserve/:id', (req, res) => {
  const { col, value } = req.body || {};
  if (typeof col !== 'string') return res.status(400).json({ error: 'Не передано поле col' });
  try {
    res.json(db.updateCell(req.params.id, col, value ?? ''));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reserve', (req, res) => {
  const { poolId } = req.body || {};
  if (!poolId) return res.status(400).json({ error: 'Не передан poolId' });
  try {
    res.json(db.addToReserve(poolId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/reserve/:id', (req, res) => {
  try {
    res.json(db.removeFromReserve(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/dismissed/:id/restore', (req, res) => {
  try {
    res.json(db.restoreFromDismissed(req.params.id));
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
  console.log(`Электронный кадровый резерв — сервер запущен: http://localhost:${PORT}`);
  console.log(`Файл базы данных: ${db.DATA_FILE}`);
});
