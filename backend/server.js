const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: ['https://smart-drainage.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true 
  } 
});

app.use(cors({ 
  origin: ['https://smart-drainage.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true 
}));
app.use(express.json());

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Web Push VAPID
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};
webpush.setVapidDetails('mailto:admin@smartdrainage.com', vapidKeys.publicKey, vapidKeys.privateKey);

// In-memory stores
let subscriptions = [];
let lastData = {};
let deviceStatus = {};
let notificationLog = [];
let loginHistory = [];
let maintenanceMode = {};

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

  loginHistory.push({
    username,
    role: data.role,
    ip: req.ip,
    time: new Date().toISOString()
  });
  if (loginHistory.length > 100) loginHistory.shift();

  res.json({ success: true, user: { username: data.username, role: data.role, unit_id: data.unit_id } });
});

app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

// ========== DATA RECEIVE FROM ESP32 ==========
app.post('/api/data', async (req, res) => {
  const { unit_id, debris_level, overflow, led_status, battery, distance = 0 } = req.body;

  if (maintenanceMode[unit_id]?.active) {
    await supabase.from('readings').insert([{
      unit_id, debris_level, overflow, led_status, battery, distance,
      maintenance: true, timestamp: new Date().toISOString()
    }]);

    io.emit('sensorUpdate', { unit_id, debris_level, overflow, led_status, battery, distance, maintenance: true });
    return res.json({ success: true, maintenance: true });
  }

  const { error } = await supabase.from('readings').insert([{
    unit_id, debris_level, overflow, led_status, battery, distance,
    maintenance: false, timestamp: new Date().toISOString()
  }]);

  if (error) return res.status(500).json({ error: error.message });

  lastData[unit_id] = {
    debris_level, overflow, led_status, battery, distance,
    timestamp: new Date().toISOString()
  };

  deviceStatus[unit_id] = { status: 'live', lastSeen: new Date().toISOString() };

  // Check for alerts
  if (overflow || debris_level >= 95) {
    const alertMsg = overflow 
      ? `🚨 OVERFLOW DETECTED at ${unit_id}!`
      : `⚠️ ${unit_id} is ${debris_level.toFixed(1)}% FULL!`;

    const alertType = overflow ? 'overflow' : 'critical';

    notificationLog.push({
      unit_id, type: alertType,
      message: alertMsg, time: new Date().toISOString(),
      sent: subscriptions.length > 0
    });
    if (notificationLog.length > 200) notificationLog.shift();

    // Send push notifications to ALL subscribed clients
    if (subscriptions.length > 0) {
      const pushPayload = JSON.stringify({
        title: 'Smart Drainage Alert',
        body: alertMsg,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: unit_id,
        requireInteraction: true,
        actions: [
          { action: 'open', title: 'Open App' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      });

      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, pushPayload)
          .then(() => console.log('Push sent successfully'))
          .catch(err => {
            console.error('Push error:', err);
            // Remove invalid subscription
            if (err.statusCode === 410 || err.statusCode === 404) {
              subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
            }
          });
      });
    }

    io.emit('alert', { unit_id, message: alertMsg, type: alertType });
  }

  io.emit('sensorUpdate', { unit_id, debris_level, overflow, led_status, battery, distance, maintenance: false });
  res.json({ success: true });
});

// ========== MAINTENANCE MODE ==========
app.post('/api/maintenance/start', (req, res) => {
  const { unit_id, startedBy, reason } = req.body;

  maintenanceMode[unit_id] = {
    active: true,
    startedBy: startedBy || 'Unknown',
    reason: reason || 'Maintenance',
    startedAt: new Date().toISOString()
  };

  io.emit('maintenanceUpdate', { unit_id, maintenance: true, startedBy, reason });
  res.json({ success: true, maintenanceMode: maintenanceMode[unit_id] });
});

app.post('/api/maintenance/end', (req, res) => {
  const { unit_id } = req.body;

  if (maintenanceMode[unit_id]) {
    maintenanceMode[unit_id].active = false;
    maintenanceMode[unit_id].endedAt = new Date().toISOString();
  }

  io.emit('maintenanceUpdate', { unit_id, maintenance: false });
  res.json({ success: true });
});

app.get('/api/maintenance/status', (req, res) => {
  res.json(maintenanceMode);
});

// ========== GET DATA ==========
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

app.get('/api/data/:unit_id/history', async (req, res) => {
  const { unit_id } = req.params;
  const { startDate, endDate, limit = 500 } = req.query;

  let query = supabase
    .from('readings')
    .select('*')
    .eq('unit_id', unit_id)
    .order('timestamp', { ascending: false });

  if (startDate) query = query.gte('timestamp', startDate);
  if (endDate) query = query.lte('timestamp', endDate);
  if (limit) query = query.limit(parseInt(limit));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ========== UNITS ==========
app.get('/api/units', async (req, res) => {
  const { data, error } = await supabase.from('drainage_units').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/units', async (req, res) => {
  const { unit_id, name, location } = req.body;
  if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });

  const { error } = await supabase.from('drainage_units').insert([{ unit_id, name, location }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/units/:unit_id', async (req, res) => {
  const { unit_id } = req.params;
  const { error } = await supabase.from('drainage_units').delete().eq('unit_id', unit_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== USERS ==========
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', async (req, res) => {
  const { username, password, role, unit_id } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('username')
    .eq('username', username)
    .single();

  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const { error } = await supabase.from('users').insert([{ 
    username, 
    password, 
    role: role || 'user', 
    unit_id: unit_id || null 
  }]);

  if (error) {
    console.error('Supabase insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

app.delete('/api/users/:username', async (req, res) => {
  const { username } = req.params;
  const { error } = await supabase.from('users').delete().eq('username', username);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== NOTIFICATIONS ==========
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
    subscriptions.push(subscription);
    console.log('New push subscription added. Total:', subscriptions.length);
  }
  res.json({ success: true });
});

app.get('/api/notifications/log', (req, res) => {
  res.json(notificationLog);
});

// ========== LOGIN HISTORY ==========
app.get('/api/login-history', (req, res) => {
  res.json(loginHistory);
});

// ========== DEVICE STATUS CHECK ==========
setInterval(() => {
  const now = new Date();
  Object.keys(deviceStatus).forEach(unit_id => {
    const lastSeen = new Date(deviceStatus[unit_id].lastSeen);
    const diff = (now - lastSeen) / 1000;
    if (diff > 30) {
      deviceStatus[unit_id].status = 'offline';
      io.emit('deviceStatus', { unit_id, status: 'offline' });
    }
  });
}, 10000);

// ========== ACTIVITY HEARTBEAT ==========
app.post('/api/heartbeat', (req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// ========== THIS MUST BE LAST ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));