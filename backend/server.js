const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://smart-drainage.vercel.app', 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

app.use(cors({
  origin: ['https://smart-drainage.vercel.app', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'your-supabase-url',
  process.env.SUPABASE_KEY || 'your-supabase-key'
);

// Web Push
webpush.setVapidDetails(
  'mailto:clarence@example.com',
  process.env.VAPID_PUBLIC_KEY || 'your-public-key',
  process.env.VAPID_PRIVATE_KEY || 'your-private-key'
);

// In-memory storage
let pushSubscriptions = [];
let lastSensorData = {};
let deviceOnline = {};

// ========== NEW: OFFLINE DETECTION ==========
// Mark device offline if no heartbeat for 2 minutes
const OFFLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function checkDeviceOffline() {
  const now = new Date().toISOString();
  Object.keys(deviceOnline).forEach(unit_id => {
    const lastSeen = deviceOnline[unit_id]?.lastSeen;
    if (lastSeen) {
      const elapsed = new Date(now) - new Date(lastSeen);
      if (elapsed >= OFFLINE_TIMEOUT_MS && deviceOnline[unit_id].online) {
        deviceOnline[unit_id].online = false;
        console.log(`[OFFLINE DETECTED] ${unit_id} — no heartbeat for ${Math.round(elapsed/1000)}s`);
        io.emit('deviceStatus', {
          unit_id,
          status: 'offline',
          stuck: lastSensorData[unit_id]?.stuck || false,
          lastSeen: lastSeen
        });
      }
    }
  });
}

// Run offline check every 30 seconds
setInterval(checkDeviceOffline, 30000);

// ========== AUTH ==========
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ success: true, user: data });
});

app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

app.delete('/api/users/:id', async (req, res) => {
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== DRAINAGE UNITS ==========
app.get('/api/units', async (req, res) => {
  const { data, error } = await supabase.from('drainage_units').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/units', async (req, res) => {
  const { data, error } = await supabase.from('drainage_units').insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

app.delete('/api/units/:id', async (req, res) => {
  const { error } = await supabase.from('drainage_units').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== SENSOR DATA ==========
app.post('/api/data', async (req, res) => {
  const { unit_id, debris_level, distance, overflow, led_status, battery, alarm, stuck } = req.body;

  // Store last data — include new timer fields if present
  lastSensorData[unit_id] = {
    unit_id,
    debris_level,
    distance,
    overflow,
    led_status,
    battery: battery || 100,
    alarm: alarm || false,
    stuck: stuck || false,
    // ===== NEW: Store timer fields =====
    stuck_active: req.body.stuck_active || stuck || false,
    stuck_timer: req.body.stuck_timer || 0,
    resume_timer: req.body.resume_timer || 0,
    timestamp: new Date().toISOString()
  };

  // Mark device online
  deviceOnline[unit_id] = {
    online: true,
    lastSeen: new Date().toISOString()
  };

  // Save to Supabase — use 'timestamp' not 'created_at'
  const { data, error } = await supabase.from('readings').insert([{
    unit_id,
    debris_level,
    distance,
    overflow: overflow || false,
    led_status,
    battery: battery || 100,
    timestamp: new Date().toISOString()
  }]);

  if (error) console.error('Supabase error:', error);

  // Emit to all connected clients — FIXED: emit 'sensorUpdate' (not 'sensorData')
  io.emit('sensorUpdate', lastSensorData[unit_id]);

  // Alert if overflow or critical
  if (overflow || debris_level >= 80) {
    const alertData = {
      type: overflow ? 'overflow' : 'critical',
      unit_id,
      debris_level,
      message: overflow ? `OVERFLOW at ${unit_id}!` : `CRITICAL LEVEL at ${unit_id}: ${debris_level}%`,
      timestamp: new Date().toISOString()
    };

    io.emit('alert', alertData);

    // Send push notifications
    sendPushNotifications(alertData);
  }

  res.json({ success: true, received: lastSensorData[unit_id] });
});

app.get('/api/data/:unit_id', async (req, res) => {
  const { unit_id } = req.params;
  const { limit = 50 } = req.query;

  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('unit_id', unit_id)
    .order('timestamp', { ascending: false })
    .limit(parseInt(limit));

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ========== HEARTBEAT ==========
app.post('/api/heartbeat', async (req, res) => {
  const { unit_id, online, stuck } = req.body;

  deviceOnline[unit_id] = {
    online: online !== false,
    lastSeen: new Date().toISOString()
  };

  // If stuck mode, keep last known data but mark as stuck
  if (stuck && lastSensorData[unit_id]) {
    lastSensorData[unit_id].stuck = true;
    lastSensorData[unit_id].timestamp = new Date().toISOString();
    io.emit('sensorUpdate', lastSensorData[unit_id]);
  }

  // ===== NEW: Update timer fields from heartbeat if present =====
  if (req.body.stuck_active !== undefined && lastSensorData[unit_id]) {
    lastSensorData[unit_id].stuck_active = req.body.stuck_active;
    lastSensorData[unit_id].stuck_timer = req.body.stuck_timer || 0;
    lastSensorData[unit_id].resume_timer = req.body.resume_timer || 0;
  }

  // Emit device status — FIXED: use 'status: live' to match frontend
  io.emit('deviceStatus', {
    unit_id,
    status: 'live',
    stuck: stuck || false,
    lastSeen: new Date().toISOString()
  });

  res.json({ success: true, online: true });
});

// ========== DEVICE STATUS ==========
app.get('/api/status/:unit_id', (req, res) => {
  const { unit_id } = req.params;
  const status = deviceOnline[unit_id] || { online: false, lastSeen: null };
  const lastData = lastSensorData[unit_id] || null;

  res.json({
    unit_id,
    online: status.online,
    lastSeen: status.lastSeen,
    stuck: lastData ? lastData.stuck : false,
    lastData
  });
});

// ========== PUSH NOTIFICATIONS ==========
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!pushSubscriptions.find(s => s.endpoint === subscription.endpoint)) {
    pushSubscriptions.push(subscription);
  }
  res.json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
  res.json({ success: true });
});

function sendPushNotifications(alertData) {
  const payload = JSON.stringify({
    title: 'Smart Drainage Alert',
    body: alertData.message,
    tag: 'drainage-alert',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });

  pushSubscriptions.forEach(sub => {
    webpush.sendNotification(sub, payload).catch(err => {
      console.error('Push error:', err);
      if (err.statusCode === 410 || err.statusCode === 404) {
        pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
      }
    });
  });
}

// ========== MAINTENANCE (in-memory only) ==========
const maintenanceMemory = {};

app.post('/api/maintenance/start', (req, res) => {
  const { unit_id, reason, started_by } = req.body;
  maintenanceMemory[unit_id] = {
    active: true,
    startedBy: started_by,
    reason: reason || 'Cleaning',
    startedAt: new Date().toISOString()
  };
  // FIXED: emit 'maintenanceUpdate' to match frontend
  io.emit('maintenanceUpdate', { unit_id, maintenance: true, startedBy: started_by, reason });
  res.json({ success: true, maintenance: maintenanceMemory[unit_id] });
});

app.post('/api/maintenance/end', (req, res) => {
  const { unit_id } = req.body;
  if (maintenanceMemory[unit_id]) {
    maintenanceMemory[unit_id].active = false;
    maintenanceMemory[unit_id].endedAt = new Date().toISOString();
  }
  // FIXED: emit 'maintenanceUpdate' to match frontend
  io.emit('maintenanceUpdate', { unit_id, maintenance: false });
  res.json({ success: true });
});

app.get('/api/maintenance', (req, res) => {
  res.json(maintenanceMemory);
});

app.get('/api/maintenance/status', (req, res) => {
  res.json(maintenanceMemory);
});

// ========== NOTIFICATIONS (in-memory only) ==========
const notificationMemory = [];

app.get('/api/notifications', (req, res) => {
  res.json(notificationMemory.slice(-50));
});

app.get('/api/notifications/log', (req, res) => {
  res.json(notificationMemory.slice(-50));
});

// ========== LOGIN HISTORY (in-memory only) ==========
const loginHistoryMemory = [];

app.get('/api/login-history', (req, res) => {
  res.json(loginHistoryMemory.slice(-50));
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current data to new client — FIXED: emit 'sensorUpdate'
  Object.values(lastSensorData).forEach(data => {
    socket.emit('sensorUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});