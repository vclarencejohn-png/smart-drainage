const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

// Database setup
const db = new Database('drainage.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debris_level REAL,
    overflow INTEGER,
    led_status TEXT,
    battery REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ESP32 sends data to this endpoint
app.post('/api/data', (req, res) => {
  const { debris_level, overflow, led_status, battery } = req.body;

  const insert = db.prepare(`
    INSERT INTO readings (debris_level, overflow, led_status, battery)
    VALUES (?, ?, ?, ?)
  `);
  insert.run(debris_level, overflow, led_status, battery);

  io.emit('sensor_update', {
    debris_level,
    overflow,
    led_status,
    battery,
    timestamp: new Date().toISOString()
  });

  console.log('Data received:', req.body);
  res.json({ status: 'ok' });
});

// Get last 50 readings for history chart
app.get('/api/history', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM readings
    ORDER BY timestamp DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// Get latest single reading
app.get('/api/latest', (req, res) => {
  const row = db.prepare(`
    SELECT * FROM readings
    ORDER BY timestamp DESC
    LIMIT 1
  `).get();
  res.json(row || {});
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Smart Drainage server running on http://localhost:${PORT}`);
});