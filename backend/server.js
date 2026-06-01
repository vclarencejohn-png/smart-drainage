const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// In-memory storage (no database needed!)
let readings = [];

app.get('/api/units', (req, res) => {
  const defaults = ['drainage_1', 'drainage_2', 'drainage_3'];
  const fromData = [...new Set(readings.map(r => r.unit_id))];
  const all = [...new Set([...defaults, ...fromData])];
  res.json(all);
});

app.post('/api/data', (req, res) => {
  const { unit_id = 'drainage_1', debris_level, overflow, led_status, battery } = req.body;
  const entry = {
    id: readings.length + 1,
    unit_id,
    debris_level,
    overflow,
    led_status,
    battery,
    timestamp: new Date().toISOString()
  };
  readings.push(entry);
  // Keep only last 500 readings
  if (readings.length > 500) readings = readings.slice(-500);

  io.emit('sensor_update', entry);
  console.log(`[${unit_id}] Data received:`, req.body);
  res.json({ status: 'ok' });
});

app.get('/api/latest/:unit_id', (req, res) => {
  const unitReadings = readings.filter(r => r.unit_id === req.params.unit_id);
  res.json(unitReadings[unitReadings.length - 1] || {});
});

app.get('/api/history/:unit_id', (req, res) => {
  const unitReadings = readings.filter(r => r.unit_id === req.params.unit_id);
  res.json(unitReadings.slice(-50));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Smart Drainage server running on port ${PORT}`);
});