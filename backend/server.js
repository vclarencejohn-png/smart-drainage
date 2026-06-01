const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Supabase connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================
// AUTH ROUTES
// ============================================

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ user: { id: data.id, username: data.username, role: data.role } });
});

// Get all users (admin only)
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create user (admin only)
app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body;
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password, role: role || 'user' }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete user (admin only)
app.delete('/api/users/:id', async (req, res) => {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================
// DRAINAGE UNITS ROUTES
// ============================================

// Get all drainage units
app.get('/api/units', async (req, res) => {
  const { data, error } = await supabase
    .from('drainage_units')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Add drainage unit (admin only)
app.post('/api/units', async (req, res) => {
  const { unit_id, name, location } = req.body;
  const { data, error } = await supabase
    .from('drainage_units')
    .insert([{ unit_id, name, location }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete drainage unit (admin only)
app.delete('/api/units/:unit_id', async (req, res) => {
  const { error } = await supabase
    .from('drainage_units')
    .update({ active: false })
    .eq('unit_id', req.params.unit_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ============================================
// SENSOR DATA ROUTES
// ============================================

// ESP32 sends data here
app.post('/api/data', async (req, res) => {
  const { unit_id = 'drainage_1', debris_level, overflow, led_status, battery } = req.body;

  const { error } = await supabase
    .from('readings')
    .insert([{ unit_id, debris_level, overflow, led_status, battery }]);

  if (error) return res.status(500).json({ error: error.message });

  const entry = { unit_id, debris_level, overflow, led_status, battery, timestamp: new Date().toISOString() };
  io.emit('sensor_update', entry);
  console.log(`[${unit_id}] Data received:`, req.body);
  res.json({ status: 'ok' });
});

// Get latest reading for a unit
app.get('/api/latest/:unit_id', async (req, res) => {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('unit_id', req.params.unit_id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();
  if (error) return res.json({});
  res.json(data);
});

// Get history for a unit
app.get('/api/history/:unit_id', async (req, res) => {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('unit_id', req.params.unit_id)
    .order('timestamp', { ascending: false })
    .limit(50);
  if (error) return res.json([]);
  res.json(data.reverse());
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Smart Drainage server running on port ${PORT}`);
});