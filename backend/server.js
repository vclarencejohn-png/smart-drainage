const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('/tmp/drainage.db');

db.run(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id TEXT DEFAULT 'drainage_1',
    debris_level REAL,
    overflow INTEGER,
    led_status TEXT,
    battery REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.get('/api/units', (req, res) => {
  db.all(`SELECT DISTINCT unit_id FROM readings`, [], (err, rows) => {
    const defaults = ['drainage_1', 'drainage_2', 'drainage_3'];
    const fromDb = rows ? rows.map(r => r.unit_id) : [];
    const all = [...new Set([...defaults, ...fromDb])];
    res.json(all);
  });
});

app.post('/api/data', (req, res) => {
  const { unit_id = 'drainage_1', debris_level, overflow, led_status, battery } = req.body;
  db.run(
    `INSERT INTO readings (unit_id, debris_level, overflow, led_status, battery) VALUES (?, ?, ?, ?, ?)`,
    [unit_id, debris_level, overflow, led_status, battery],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      io.emit('sensor_update', { unit_id, debris_level, overflow, led_status, battery, timestamp: new Date().toISOString() });
      console.log(`[${unit_id}] Data received:`, req.body);
      res.json({ status: 'ok' });
    }
  );
});

app.get('/api/latest/:unit_id', (req, res) => {
  db.get(
    `SELECT * FROM readings WHERE unit_id = ? ORDER BY timestamp DESC LIMIT 1`,
    [req.params.unit_id],
    (err, row) => res.json(row || {})
  );
});

app.get('/api/history/:unit_id', (req, res) => {
  db.all(
    `SELECT * FROM readings WHERE unit_id = ? ORDER BY timestamp DESC LIMIT 50`,
    [req.params.unit_id],
    (err, rows) => res.json(rows || [])
  );
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Smart Drainage server running on port ${PORT}`);
});