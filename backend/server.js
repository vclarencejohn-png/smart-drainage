const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
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
  const { unit_id, debris_level, overflow, led_status, battery, distance } = req.body;
  
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
  
  if (overflow || debris_level >= 95) {
    const alertMsg = overflow 
      ? `🚨 OVERFLOW DETECTED at ${unit_id}!` 
      : `⚠️ ${unit_id} is ${debris_level.toFixed(1)}% FULL!`;
    
    notificationLog.push({
      unit_id, type: overflow ? 'overflow' : 'critical',
      message: alertMsg, time: new Date().toISOString(),
      sent: subscriptions.length > 0
    });
    if (notificationLog.length > 200) notificationLog.shift();
    
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, JSON.stringify({
        title: 'Smart Drainage Alert',
        body: alertMsg,
        icon: '/icon.png',
        badge: '/badge.png',
        tag: unit_id,
        requireInteraction: true
      })).catch(err => console.error('Push error:', err));
    });
    
    io.emit('alert', { unit_id, message: alertMsg, type: overflow ? 'overflow' : 'critical' });
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
  const { error } = await supabase.from('drainage_units').insert([{ unit_id, name, location }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== USERS ==========
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('username, role, unit_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/users', async (req, res) => {
  const { username, password, role, unit_id } = req.body;
  const { error } = await supabase.from('users').insert([{ username, password, role, unit_id }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ========== NOTIFICATIONS ==========
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
    subscriptions.push(subscription);
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