require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET', 'API_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
};

const io = new Server(server, { cors: corsOptions });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));

const loginAttempts = new Map();
const BAN_STEPS = [5 * 60_000, 60 * 60_000, 24 * 60 * 60_000];
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,10}$/;

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, created_at: user.created_at };
}

function loginAttemptState(username) {
  return loginAttempts.get(username.toLowerCase()) || { failures: 0, bannedUntil: 0 };
}

function recordFailedLogin(username) {
  const key = username.toLowerCase();
  const state = loginAttemptState(username);
  state.failures += 1;
  if (state.failures >= 5) {
    const step = state.failures < 8 ? 0 : state.failures < 11 ? 1 : 2;
    state.bannedUntil = Date.now() + BAN_STEPS[step];
  }
  loginAttempts.set(key, state);
  return state;
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function authenticate(req, res, next) {
  const token = req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
  return next();
}

function requireDeviceKey(req, res, next) {
  if (req.get('X-API-Key') !== process.env.API_KEY) return res.status(401).json({ error: 'Invalid device API key' });
  return next();
}

function validReading(body) {
  const requiredFields = ['unit_id', 'debris_level', 'distance', 'overflow', 'led_status', 'battery', 'timestamp'];
  if (requiredFields.some((field) => body[field] === undefined || body[field] === null)) return false;
  if (typeof body.unit_id !== 'string' || !body.unit_id.trim()) return false;
  if (!Number.isFinite(Number(body.debris_level)) || Number(body.debris_level) < 0 || Number(body.debris_level) > 100) return false;
  if (!Number.isFinite(Number(body.distance)) || Number(body.distance) < 0) return false;
  if (typeof body.overflow !== 'boolean') return false;
  if (!['GREEN', 'YELLOW', 'RED'].includes(body.led_status)) return false;
  if (!Number.isInteger(Number(body.battery)) || Number(body.battery) < 0 || Number(body.battery) > 100) return false;
  return !Number.isNaN(Date.parse(body.timestamp));
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!USERNAME_PATTERN.test(username) || password.length < 1 || password.length > 10) {
    return res.status(400).json({ error: 'Username and password must be 1 to 10 characters' });
  }
  const state = loginAttemptState(username);
  if (state.bannedUntil > Date.now()) {
    return res.status(429).json({ error: 'Account temporarily banned', remainingSeconds: Math.ceil((state.bannedUntil - Date.now()) / 1000) });
  }

  const { data: user, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
  const passwordMatches = !error && user && await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    const failure = recordFailedLogin(username);
    const response = { error: 'Invalid username or password' };
    if (failure.bannedUntil > Date.now()) response.remainingSeconds = Math.ceil((failure.bannedUntil - Date.now()) / 1000);
    return res.status(failure.bannedUntil > Date.now() ? 429 : 401).json(response);
  }

  loginAttempts.delete(username.toLowerCase());
  return res.json({ token: tokenFor(user), user: publicUser(user) });
});

app.get('/api/drainages', authenticate, async (_req, res) => {
  const { data, error } = await supabase.from('drainage_units').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.post('/api/drainages', authenticate, requireAdmin, async (req, res) => {
  const { name, device_id, location = '' } = req.body;
  if (![name, device_id].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Name and device ID are required' });
  }
  const { data, error } = await supabase.from('drainage_units').insert([{ name: name.trim(), device_id: device_id.trim(), location: String(location).trim() }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
});

app.delete('/api/drainages/:id', authenticate, requireAdmin, async (req, res) => {
  const { data: unit, error: unitError } = await supabase
    .from('drainage_units')
    .select('device_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (unitError) return res.status(500).json({ error: unitError.message });
  if (!unit) return res.status(404).json({ error: 'Drainage not found' });

  const { count, error: countError } = await supabase
    .from('readings')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unit.device_id);
  if (countError) return res.status(500).json({ error: countError.message });
  if (count > 0) return res.status(409).json({ error: 'This drainage has saved readings and cannot be deleted.' });

  const { error } = await supabase.from('drainage_units').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

app.get('/api/users', authenticate, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('users').select('id, username, role, created_at').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!USERNAME_PATTERN.test(username || '') || typeof password !== 'string' || password.length < 1 || password.length > 10 || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Username/password must be 1 to 10 characters and role must be admin or user' });
  }
  const password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('users').insert([{ username, password_hash, role }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(publicUser(data));
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

app.post('/api/readings', requireDeviceKey, async (req, res) => {
  if (!validReading(req.body)) return res.status(400).json({ error: 'Invalid reading payload' });
  const payload = {
    unit_id: req.body.unit_id.trim(),
    debris_level: Number(req.body.debris_level),
    distance: Number(req.body.distance),
    overflow: req.body.overflow,
    led_status: req.body.led_status,
    battery: Number(req.body.battery),
    timestamp: new Date(req.body.timestamp).toISOString(),
  };
  const { data: unit, error: unitError } = await supabase.from('drainage_units').select('id').eq('device_id', payload.unit_id).maybeSingle();
  if (unitError) return res.status(500).json({ error: unitError.message });
  if (!unit) return res.status(404).json({ error: 'Unknown drainage device ID' });
  const { error } = await supabase.from('readings').insert([payload]);
  if (error) return res.status(500).json({ error: error.message });
  io.emit('reading:update', payload);
  return res.status(201).json({ success: true });
});

app.get('/api/readings/latest', authenticate, async (_req, res) => {
  const { data, error } = await supabase.from('readings').select('*').order('timestamp', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  const latestByUnit = [];
  const seen = new Set();
  for (const reading of data) {
    if (!seen.has(reading.unit_id)) {
      seen.add(reading.unit_id);
      latestByUnit.push(reading);
    }
  }
  return res.json(latestByUnit);
});

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Authentication required'));
  }
});

io.on('connection', (socket) => {
  socket.emit('connection:ready', { username: socket.user.username });
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`Smart Drainage API listening on ${PORT}`));
