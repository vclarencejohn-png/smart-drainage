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
  if (reading.overflow || reading.debris_level >= 75) return { label: 'FULL', tone: 'full' };
  if (reading.debris_level >= 40) return { label: 'WARNING', tone: 'warning' };
  return { label: 'NORMAL', tone: 'normal' };
};

const secondsToText = (seconds) => {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

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
    try {
      const [drainages, latest] = await Promise.all([request('/api/drainages'), request('/api/readings/latest')]);
      setUnits(drainages);
      setReadings(Object.fromEntries(latest.map((reading) => [reading.unit_id, reading])));
      if (session.user.role === 'admin') setUsers(await request('/api/users'));
    } catch (error) {
      if (error.message.includes('Authentication')) handleLogout();
    }
  }, [request, session?.user?.role]);

  useEffect(() => {
    if (!session) return undefined;
    const initialLoad = window.setTimeout(() => { loadDashboard(); }, 0);
    const socket = io(SOCKET_URL, { auth: { token: session.token } });
    socket.on('reading:update', (reading) => setReadings((current) => ({ ...current, [reading.unit_id]: reading })));
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
  const alertingCards = useMemo(() => cards.filter(({ unit, reading, connection }) => reading && connection.isLive && !mutedIds.has(unit.id) && (reading.overflow || reading.debris_level >= 75)), [cards, mutedIds]);

  useEffect(() => {
    if (!alertingCards.length) return undefined;
    const playAlarm = () => {
      if (alarmRef.current) {
        alarmRef.current.currentTime = 0;
        alarmRef.current.play().catch(() => {});
      }
    };
    const speakAlert = () => {
      if ('speechSynthesis' in window) {
        const message = alertingCards.map(({ unit, reading }) => {
          if (reading.overflow) return `Overflow in ${unit.name}`;
          if (reading.debris_level >= 91) return `${unit.name} is full`;
          return `${unit.name} is critical`;
        }).join('. ');
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
      }
    };
    playAlarm();
    speakAlert();
    const soundInterval = window.setInterval(playAlarm, 1_000);
    const voiceInterval = window.setInterval(speakAlert, 10_000);
    return () => {
      window.clearInterval(soundInterval);
      window.clearInterval(voiceInterval);
    };
  }, [alertingCards]);

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
    try {
      await request('/api/drainages', { method: 'POST', body: JSON.stringify(newDrainage) });
      setNewDrainage({ name: '', device_id: '', location: '' });
      await loadDashboard();
    } catch (error) { setFormError(error.message); }
  }

  async function createUser(event) {
    event.preventDefault();
    setFormError('');
    try {
      await request('/api/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ username: '', password: '', role: 'user' });
      setUsers(await request('/api/users'));
    } catch (error) { setFormError(error.message); }
  }

  async function deleteDrainage(unit) {
    if (!window.confirm(`Delete ${unit.name}? This is only allowed when it has no saved readings.`)) return;
    setFormError('');
    try {
      await request(`/api/drainages/${unit.id}`, { method: 'DELETE' });
      if (expandedId === unit.id) setExpandedId(null);
      await loadDashboard();
    } catch (error) { setFormError(error.message); }
  }

  async function deleteUser(account) {
    if (!window.confirm(`Delete user ${account.username}?`)) return;
    setFormError('');
    try {
      await request(`/api/users/${account.id}`, { method: 'DELETE' });
      setUsers(await request('/api/users'));
    } catch (error) { setFormError(error.message); }
  }

  if (!session) return <main className="login-page"><form className="login-card" onSubmit={handleLogin}><h1>Smart Drainage</h1><p>Real-time monitoring</p><label>Username<input maxLength="10" required value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /></label><label>Password<input type="password" maxLength="10" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>{loginError && <p className="error">{loginError}</p>}<button type="submit">Login</button></form></main>;

  const visibleCards = expandedId ? cards.filter(({ unit }) => unit.id === expandedId) : cards;
  return <main className="app-shell">
    <audio ref={alarmRef} src="/alarm.wav" preload="auto" />
    <header><div><h1>Smart Drainage</h1><p>Real-time monitoring</p></div><div className="header-actions"><div className="live-time"><span>PH TIME</span><strong>{currentTime.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>{session.user.role === 'admin' && <button onClick={() => setAdminOpen((open) => !open)}>{adminOpen ? 'Close Admin' : 'Admin'}</button>}<button onClick={handleLogout}>Logout</button></div></header>
    {session.user.role === 'admin' && adminOpen && <section className="admin-panel"><div className="tabs"><button className={adminTab === 'drainages' ? 'active' : ''} onClick={() => setAdminTab('drainages')}>Drainages</button><button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>Users</button></div>{formError && <p className="error">{formError}</p>}{adminTab === 'drainages' ? <><form className="admin-form" onSubmit={createDrainage}><input required placeholder="Drainage name" value={newDrainage.name} onChange={(event) => setNewDrainage({ ...newDrainage, name: event.target.value })} /><input required placeholder="Device ID" value={newDrainage.device_id} onChange={(event) => setNewDrainage({ ...newDrainage, device_id: event.target.value })} /><input placeholder="Location" value={newDrainage.location} onChange={(event) => setNewDrainage({ ...newDrainage, location: event.target.value })} /><button>Add drainage</button></form><ul className="admin-list">{units.map((unit) => <li key={unit.id}><strong>{unit.name}</strong><span>{unit.device_id} · {unit.location || 'No location'}</span><button className="delete-button" onClick={() => deleteDrainage(unit)}>Delete</button></li>)}</ul></> : <><form className="admin-form" onSubmit={createUser}><input required maxLength="10" placeholder="Username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /><input required type="password" maxLength="10" placeholder="Password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option></select><button>Create user</button></form><ul className="admin-list">{users.map((user) => <li key={user.id}><strong>{user.username}</strong><span>{user.role}</span>{user.id !== session.user.id && <button className="delete-button" onClick={() => deleteUser(user)}>Delete</button>}</li>)}</ul></>}</section>}
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
    {!units.length && <p className="empty">No drainages have been added. An administrator can add one in the Admin panel.</p>}
  </main>;
}

export default App;
