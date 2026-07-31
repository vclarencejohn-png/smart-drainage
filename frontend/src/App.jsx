import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;
const LIVE_TIMEOUT_MS = 30_000;

const connectionFor = (reading, now) => {
  if (!reading) return { isLive: false, label: 'DISCONNECTED', lastUpdate: 'Awaiting first reading' };
  const timestamp = Date.parse(reading.timestamp);
  const age = Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : now.getTime() - timestamp;
  const isLive = age <= LIVE_TIMEOUT_MS;
  return {
    isLive,
    label: isLive ? 'LIVE' : 'DISCONNECTED',
    lastUpdate: new Date(reading.timestamp).toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
  };
};

const statusFor = (reading, connection) => {
  if (!reading) return { label: 'NOT CONNECTED', tone: 'waiting' };
  if (!connection.isLive) return { label: 'DISCONNECTED', tone: 'offline' };
  if (reading.overflow) return { label: 'OVERFLOW', tone: 'overflow' };
  if (reading.debris_level >= 75) return { label: 'FULL', tone: 'full' };
  if (reading.debris_level >= 40) return { label: 'WARNING', tone: 'warning' };
  return { label: 'NORMAL', tone: 'normal' };
};

const secondsToText = (seconds) => {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const demoUnits = [
  { id: 'demo-1', name: 'Drainage 1', device_id: 'demo_drainage_1', location: 'Main Street', empty_distance: 33.2 },
  { id: 'demo-2', name: 'Drainage 2', device_id: 'demo_drainage_2', location: 'Market Road', empty_distance: 33.1 },
  { id: 'demo-3', name: 'Drainage 3', device_id: 'demo_drainage_3', location: 'Community Hall', empty_distance: 33.3 },
  { id: 'demo-4', name: 'Drainage 4', device_id: 'demo_drainage_4', location: 'Riverside', empty_distance: 33.0 },
  { id: 'demo-5', name: 'Drainage 5', device_id: 'demo_drainage_5', location: 'School Zone', empty_distance: null },
];

const createDemoReadings = () => {
  const timestamp = new Date().toISOString();
  return {
    demo_drainage_1: { unit_id: 'demo_drainage_1', debris_level: 22, overflow: false, timestamp },
    demo_drainage_2: { unit_id: 'demo_drainage_2', debris_level: 58, overflow: false, timestamp },
    demo_drainage_3: { unit_id: 'demo_drainage_3', debris_level: 84, overflow: false, timestamp },
    demo_drainage_4: { unit_id: 'demo_drainage_4', debris_level: 96, overflow: true, timestamp },
  };
};

const demoUsers = [
  { id: 'demo-admin', username: 'Portfolio Demo', role: 'admin' },
  { id: 'demo-user', username: 'Tanod Demo', role: 'user' },
];

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smart_drainage_session') || 'null'); } catch { return null; }
  });
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [readings, setReadings] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [mutedIds, setMutedIds] = useState(new Set());
  const [adminTab, setAdminTab] = useState('drainages');
  const [login, setLogin] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [formError, setFormError] = useState('');
  const [newDrainage, setNewDrainage] = useState({ name: '', device_id: '', location: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [adminOpen, setAdminOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const alarmRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }, [session?.token]);

  const loadDashboard = useCallback(async () => {
    if (session.user.demo) return;
    try {
      const [drainages, latest] = await Promise.all([request('/api/drainages'), request('/api/readings/latest')]);
      setUnits(drainages);
      setReadings(Object.fromEntries(latest.map((reading) => [reading.unit_id, reading])));
      if (session.user.role === 'admin') setUsers(await request('/api/users'));
    } catch (error) {
      if (error.message.includes('Authentication')) handleLogout();
    }
  }, [request, session?.user?.role, session?.user?.demo]);

  useEffect(() => {
    if (!session) return undefined;
    if (session.user.demo) {
      const timer = window.setInterval(() => setReadings(createDemoReadings()), 10_000);
      return () => window.clearInterval(timer);
    }
    const initialLoad = window.setTimeout(() => { loadDashboard(); }, 0);
    const socket = io(SOCKET_URL, { auth: { token: session.token } });
    socket.on('reading:update', (reading) => setReadings((current) => ({ ...current, [reading.unit_id]: reading })));
    socket.on('calibration:update', (calibration) => setUnits((current) => current.map((unit) => (
      unit.device_id === calibration.device_id ? { ...unit, ...calibration } : unit
    ))));
    socket.on('connect_error', (error) => {
      if (error.message === 'Authentication required') handleLogout();
    });
    return () => { window.clearTimeout(initialLoad); socket.disconnect(); };
  }, [session, loadDashboard]);

  const cards = useMemo(() => units.map((unit) => {
    const reading = readings[unit.device_id];
    const connection = connectionFor(reading, currentTime);
    return { unit, reading, connection, status: statusFor(reading, connection) };
  }), [units, readings, currentTime]);
  const overallGroups = useMemo(() => [
    { key: 'normal', label: 'Normal', description: 'Live units below 40%.', items: cards.filter(({ status }) => status.label === 'NORMAL') },
    { key: 'warning', label: 'Warning', description: 'Live units from 40% to 74%.', items: cards.filter(({ status }) => status.label === 'WARNING') },
    { key: 'full', label: 'Critical / Full', description: 'Live units at 75% or higher.', items: cards.filter(({ status }) => status.label === 'FULL') },
    { key: 'overflow', label: 'Overflow', description: 'The float switch has detected overflow.', items: cards.filter(({ status }) => status.label === 'OVERFLOW') },
    { key: 'offline', label: 'Disconnected', description: 'No current reading is available.', items: cards.filter(({ connection }) => !connection.isLive) },
  ], [cards]);
  const alertMessage = useMemo(() => cards
    .filter(({ unit, reading, connection }) => reading && connection.isLive && !mutedIds.has(unit.id) && (reading.overflow || reading.debris_level >= 75))
    .map(({ unit, reading }) => {
      if (reading.overflow) return `Overflow in ${unit.name}`;
      if (reading.debris_level >= 91) return `${unit.name} is full`;
      return `${unit.name} is critical`;
    })
    .join('. '), [cards, mutedIds]);

  useEffect(() => {
    if (!alertMessage) return undefined;
    const playAlarm = () => {
      if (alarmRef.current) {
        alarmRef.current.currentTime = 0;
        alarmRef.current.play().catch(() => {});
      }
    };
    const speakAlert = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(alertMessage));
      }
    };
    playAlarm();
    speakAlert();
    const soundInterval = window.setInterval(playAlarm, 1_000);
    const voiceInterval = window.setInterval(speakAlert, 4_000);
    return () => {
      window.clearInterval(soundInterval);
      window.clearInterval(voiceInterval);
    };
  }, [alertMessage]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError('');
    try {
      const response = await fetch(`${API_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login) });
      const data = await response.json();
      if (!response.ok) {
        const ban = data.remainingSeconds ? ` Try again in ${secondsToText(data.remainingSeconds)}.` : '';
        throw new Error(`${data.error || 'Login failed'}${ban}`);
      }
      const nextSession = { token: data.token, user: data.user };
      localStorage.setItem('smart_drainage_session', JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (error) { setLoginError(error.message); }
  }

  function startDemoMode() {
    const demoSession = { token: 'demo-mode', user: { id: 'demo-admin', username: 'Portfolio Demo', role: 'admin', demo: true } };
    setUnits(demoUnits);
    setUsers(demoUsers);
    setReadings(createDemoReadings());
    setAdminOpen(false);
    setSession(demoSession);
  }

  function handleLogout() {
    localStorage.removeItem('smart_drainage_session');
    setSession(null);
    setAdminOpen(false);
    setFormError('');
    setUnits([]);
    setUsers([]);
    setReadings({});
  }

  async function createDrainage(event) {
    event.preventDefault();
    setFormError('');
    if (session.user.demo) {
      const deviceId = newDrainage.device_id.trim();
      if (units.some((unit) => unit.device_id === deviceId)) { setFormError('Device ID already exists in this demo.'); return; }
      setUnits((current) => [...current, { id: `demo-${Date.now()}`, ...newDrainage, empty_distance: null }]);
      setNewDrainage({ name: '', device_id: '', location: '' });
      return;
    }
    try {
      await request('/api/drainages', { method: 'POST', body: JSON.stringify(newDrainage) });
      setNewDrainage({ name: '', device_id: '', location: '' });
      await loadDashboard();
    } catch (error) { setFormError(error.message); }
  }

  async function createUser(event) {
    event.preventDefault();
    setFormError('');
    if (session.user.demo) {
      if (users.some((user) => user.username.toLowerCase() === newUser.username.trim().toLowerCase())) { setFormError('Username already exists in this demo.'); return; }
      setUsers((current) => [...current, { id: `demo-${Date.now()}`, username: newUser.username, role: newUser.role }]);
      setNewUser({ username: '', password: '', role: 'user' });
      return;
    }
    try {
      await request('/api/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ username: '', password: '', role: 'user' });
      setUsers(await request('/api/users'));
    } catch (error) { setFormError(error.message); }
  }

  async function requestCalibration(unit) {
    const message = `Calibrate zero for ${unit.name}? Make sure its debris storage is empty. The ESP32 will measure its empty distance within about 10 seconds.`;
    if (!window.confirm(message)) return;
    setFormError('');
    if (session.user.demo) {
      setUnits((current) => current.map((item) => (item.id === unit.id ? { ...item, empty_distance: 33.2, calibration_requested_at: null } : item)));
      return;
    }
    try {
      await request(`/api/drainages/${unit.id}/calibrate`, { method: 'POST' });
      await loadDashboard();
    } catch (error) { setFormError(error.message); }
  }

  async function deleteDrainage(unit) {
    if (!window.confirm(`Delete ${unit.name}? This is only allowed when it has no saved readings.`)) return;
    setFormError('');
    if (session.user.demo) {
      setUnits((current) => current.filter((item) => item.id !== unit.id));
      if (expandedId === unit.id) setExpandedId(null);
      return;
    }
    try {
      await request(`/api/drainages/${unit.id}`, { method: 'DELETE' });
      if (expandedId === unit.id) setExpandedId(null);
      await loadDashboard();
    } catch (error) { setFormError(error.message); }
  }

  async function deleteUser(account) {
    if (!window.confirm(`Delete user ${account.username}?`)) return;
    setFormError('');
    if (session.user.demo) {
      setUsers((current) => current.filter((user) => user.id !== account.id));
      return;
    }
    try {
      await request(`/api/users/${account.id}`, { method: 'DELETE' });
      setUsers(await request('/api/users'));
    } catch (error) { setFormError(error.message); }
  }

  if (!session) return <main className="login-page"><form className="login-card" onSubmit={handleLogin}><h1>Smart Drainage</h1><p>Real-time monitoring</p><label>Username<input maxLength="10" required value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /></label><label>Password<input type="password" maxLength="10" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>{loginError && <p className="error">{loginError}</p>}<button type="submit">Login</button><button type="button" className="demo-button" onClick={startDemoMode}>Open portfolio demo</button><p className="demo-copy">Uses sample data only. Your real drainage records will not be changed.</p></form></main>;

  const visibleCards = expandedId ? cards.filter(({ unit }) => unit.id === expandedId) : cards;
  return <main className="app-shell">
    <audio ref={alarmRef} src="/alarm.wav" preload="auto" />
    <header><div><h1>Smart Drainage</h1><p>Real-time monitoring</p></div><div className="header-actions"><div className="live-time"><span>PH TIME</span><strong>{currentTime.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>{session.user.role === 'admin' && <button onClick={() => setAdminOpen((open) => !open)}>{adminOpen ? 'Close Admin' : 'Admin'}</button>}<button onClick={handleLogout}>Logout</button></div></header>
    {session.user.role === 'admin' && adminOpen && <section className="admin-panel">
      <div className="tabs"><button className={adminTab === 'drainages' ? 'active' : ''} onClick={() => setAdminTab('drainages')}>Drainages</button><button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>Users</button><button className={adminTab === 'hardware' ? 'active' : ''} onClick={() => setAdminTab('hardware')}>Hardware info</button></div>
      {formError && <p className="error">{formError}</p>}
      {adminTab === 'drainages' && <><form className="admin-form" onSubmit={createDrainage}><input required placeholder="Drainage name" value={newDrainage.name} onChange={(event) => setNewDrainage({ ...newDrainage, name: event.target.value })} /><input required placeholder="Device ID" value={newDrainage.device_id} onChange={(event) => setNewDrainage({ ...newDrainage, device_id: event.target.value })} /><input placeholder="Location" value={newDrainage.location} onChange={(event) => setNewDrainage({ ...newDrainage, location: event.target.value })} /><button>Add drainage</button></form><ul className="admin-list">{units.map((unit) => <li key={unit.id}><div><strong>{unit.name}</strong><span>{unit.device_id} · {unit.location || 'No location'}</span><small>{unit.calibration_requested_at ? 'Calibration pending — waiting for ESP32' : unit.empty_distance ? `Zero calibrated: ${Number(unit.empty_distance).toFixed(2)} cm` : 'Zero not calibrated'}</small></div><button className="calibrate-button" onClick={() => requestCalibration(unit)}>Calibrate zero</button><button className="delete-button" onClick={() => deleteDrainage(unit)}>Delete</button></li>)}</ul></>}
      {adminTab === 'users' && <><form className="admin-form" onSubmit={createUser}><input required maxLength="10" placeholder="Username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /><input required type="password" maxLength="10" placeholder="Password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option></select><button>Create user</button></form><ul className="admin-list">{users.map((user) => <li key={user.id}><strong>{user.username}</strong><span>{user.role}</span>{user.id !== session.user.id && <button className="delete-button" onClick={() => deleteUser(user)}>Delete</button>}</li>)}</ul></>}
      {adminTab === 'hardware' && <section className="hardware-info"><div className="hardware-heading"><div><p className="eyebrow">Prototype reference</p><h2>Hardware information</h2></div><p>This reference records the installed components and assigned ESP32 pins.</p></div><div className="hardware-grid"><article><h3>Controller and sensors</h3><ul><li><strong>ESP32 DevKit</strong> — main controller</li><li><strong>JSN-SR04T</strong> — waterproof ultrasonic sensor</li><li>TRIG: GPIO 12; ECHO: GPIO 13 through a 5V-to-3.3V voltage divider</li><li><strong>Float switch</strong> — GPIO 26 using INPUT_PULLUP; LOW means overflow</li></ul></article><article><h3>Local indicators</h3><ul><li>Green LED: GPIO 25</li><li>Yellow LED: GPIO 33</li><li>Red LED: GPIO 32</li><li>Each LED uses a 220-ohm current-limiting resistor.</li></ul></article><article><h3>Power and connection</h3><ul><li>15W solar panel</li><li>W88-A solar charge controller</li><li>12V 7Ah deep-cycle battery</li><li>USB power for the ESP32 and Pocket Wi-Fi 4G LTE</li></ul></article><article><h3>Web monitoring</h3><ul><li>ESP32 sends current readings through Wi-Fi.</li><li>Render hosts the Node.js backend.</li><li>Supabase stores readings and user data.</li><li>Vercel hosts the browser dashboard and alerts.</li></ul></article></div><p className="hardware-note">The alarm and voice notifications are browser-based. This prototype does not use a physical buzzer.</p></section>}
    </section>}
    <section className="dashboard-layout">
      <aside className="overall-updates"><div className="overall-heading"><div><p className="eyebrow">Live summary</p><h2>Overall updates</h2></div><p>Current condition of each drainage unit.</p></div><div className="overall-grid">{overallGroups.map((group) => <article className={`overall-status-card ${group.key}`} key={group.key}><div className="overall-card-title"><h3>{group.label}</h3><strong>{group.items.length}</strong></div>{group.items.length ? <ul className="overall-status-list">{group.items.map(({ unit, reading, status }) => <li key={unit.id}><span><strong>{unit.name}</strong><small>{reading ? `${Math.round(reading.debris_level)}%` : 'Awaiting first reading'}</small></span><b>{status.label}</b></li>)}</ul> : <p className="overall-empty">None</p>}</article>)}</div></aside>
      <section className={`drainage-grid ${expandedId ? 'expanded' : ''}`}>
        {visibleCards.map(({ unit, reading, connection, status }) => <article className={`drainage-card ${status.tone}`} key={unit.id}>
          <div className="card-controls"><button aria-label={expandedId ? 'Restore grid' : `Maximize ${unit.name}`} onClick={() => setExpandedId(expandedId ? null : unit.id)}>⛶</button><button aria-label={mutedIds.has(unit.id) ? `Unmute ${unit.name}` : `Mute ${unit.name}`} onClick={() => setMutedIds((current) => { const next = new Set(current); if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id); return next; })}>{mutedIds.has(unit.id) ? '🔇' : '🔊'}</button></div>
          <div className={`connection-state ${connection.isLive ? 'live' : 'disconnected'}`}><span aria-hidden="true" />{connection.label}</div>
          <h2>{unit.name}</h2>
          <p className={`fill ${reading ? '' : 'connection-message'}`}>{reading ? `${Math.round(reading.debris_level)}%` : 'Not connected'}</p>
          <dl><div><dt>Overflow</dt><dd>{reading ? (reading.overflow ? 'Yes' : 'No') : '—'}</dd></div><div><dt>Status</dt><dd>{status.label}</dd></div></dl>
          <p className="last-update">{connection.lastUpdate === 'Awaiting first reading' ? connection.lastUpdate : `Last update: ${connection.lastUpdate}`}</p>
        </article>)}
      </section>
    </section>
    {!units.length && <p className="empty">No drainages have been added. An administrator can add one in the Admin panel.</p>}
  </main>;
}

export default App;
