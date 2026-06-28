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

  await supabase.from('login_history').insert([{ 
    user_id: data.id, 
    username: data.username,
    login_time: new Date().toISOString()
  }]);

  res.json({ user: data });
});

app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').insert([req.body]);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
  res.json(data);
});

app.delete('/api/units/:id', async (req, res) => {
  const { error } = await supabase.from('drainage_units').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== SENSOR DATA ==========
app.post('/api/data', async (req, res) => {
  const { unit_id, debris_level, distance, overflow, led_status, battery, alarm, stuck } = req.body;

  // Store last data
  lastSensorData[unit_id] = {
    unit_id,
    debris_level,
    distance,
    overflow,
    led_status,
    battery: battery || 100,
    alarm: alarm || false,
    stuck: stuck || false,
    timestamp: new Date().toISOString()
  };

  // Mark device online
  deviceOnline[unit_id] = {
    online: true,
    lastSeen: new Date().toISOString()
  };

  // Save to Supabase
  const { data, error } = await supabase.from('readings').insert([{
    unit_id,
    debris_level,
    distance,
    overflow: overflow || false,
    led_status,
    battery: battery || 100,
    created_at: new Date().toISOString()
  }]);

  if (error) console.error('Supabase error:', error);

  // Emit to all connected clients
  io.emit('sensorData', lastSensorData[unit_id]);

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

    // Save notification
    await supabase.from('notifications').insert([alertData]);

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
    .order('created_at', { ascending: false })
    .limit(parseInt(limit));

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ========== HEARTBEAT (NEW) ==========
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
    io.emit('sensorData', lastSensorData[unit_id]);
  }

  // Emit device status
  io.emit('deviceStatus', {
    unit_id,
    online: true,
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

// ========== NOTIFICATIONS ==========
app.get('/api/notifications', async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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

// ========== MAINTENANCE ==========
app.post('/api/maintenance/start', async (req, res) => {
  const { unit_id, reason, started_by } = req.body;
  const { data, error } = await supabase.from('maintenance').insert([{
    unit_id,
    reason,
    started_by,
    started_at: new Date().toISOString(),
    active: true
  }]);

  if (error) return res.status(500).json({ error: error.message });
  io.emit('maintenance', { unit_id, active: true, reason });
  res.json(data);
});

app.post('/api/maintenance/end', async (req, res) => {
  const { unit_id, ended_by } = req.body;
  const { data, error } = await supabase
    .from('maintenance')
    .update({ ended_at: new Date().toISOString(), active: false, ended_by })
    .eq('unit_id', unit_id)
    .eq('active', true);

  if (error) return res.status(500).json({ error: error.message });
  io.emit('maintenance', { unit_id, active: false });
  res.json(data);
});

app.get('/api/maintenance', async (req, res) => {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current data to new client
  Object.values(lastSensorData).forEach(data => {
    socket.emit('sensorData', data);
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