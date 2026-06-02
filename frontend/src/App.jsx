import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const SERVER = "https://smart-drainage-production.up.railway.app";
const socket = io(SERVER);

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return setError("Please enter username and password.");
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${SERVER}/api/login`, { username, password });
      sessionStorage.setItem("drainage_user", JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch { setError("Invalid username or password."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "20px" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#131929", borderRadius: "20px", padding: "40px", width: "100%", maxWidth: "400px", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>💧</div>
          <h1 style={{ color: "white", fontSize: "22px", fontWeight: "700" }}>Smart Drainage Monitor</h1>
          <p style={{ color: "#475569", fontSize: "13px", marginTop: "6px" }}>Sign in to access the dashboard</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "6px" }}>USERNAME</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter username"
              style={{ width: "100%", background: "#0a0f1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "12px 16px", color: "white", fontSize: "14px" }} />
          </div>
          <div>
            <label style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "6px" }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Enter password"
              style={{ width: "100%", background: "#0a0f1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "12px 16px", color: "white", fontSize: "14px" }} />
          </div>
          {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: "#ef4444", fontSize: "13px" }}>❌ {error}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{ background: loading ? "#1e293b" : "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", border: "none", borderRadius: "10px", padding: "14px", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", marginTop: "8px" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
        <p style={{ color: "#334155", fontSize: "11px", textAlign: "center", marginTop: "24px" }}>Smart Drainage Monitoring System v2.0</p>
      </div>
    </div>
  );
}

function AdminPanel({ user, onLogout }) {
  const [tab, setTab] = useState("units");
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [newUnit, setNewUnit] = useState({ unit_id: "", name: "", location: "" });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [msg, setMsg] = useState("");

  const loadData = async () => {
    const [u, us] = await Promise.all([axios.get(`${SERVER}/api/units`), axios.get(`${SERVER}/api/users`)]);
    setUnits(u.data); setUsers(us.data);
  };

  useEffect(() => { loadData(); }, []);

  const addUnit = async () => {
    if (!newUnit.unit_id || !newUnit.name) return setMsg("Unit ID and name are required!");
    try { await axios.post(`${SERVER}/api/units`, newUnit); setNewUnit({ unit_id: "", name: "", location: "" }); setMsg("✅ Drainage unit added!"); loadData(); }
    catch { setMsg("❌ Error adding unit. Unit ID may already exist."); }
  };

  const deleteUnit = async (unit_id) => {
    if (!confirm(`Remove ${unit_id}?`)) return;
    await axios.delete(`${SERVER}/api/units/${unit_id}`); setMsg("✅ Unit removed!"); loadData();
  };

  const addUser = async () => {
    if (!newUser.username || !newUser.password) return setMsg("Username and password required!");
    try { await axios.post(`${SERVER}/api/users`, newUser); setNewUser({ username: "", password: "", role: "user" }); setMsg("✅ User created!"); loadData(); }
    catch { setMsg("❌ Error creating user."); }
  };

  const deleteUser = async (id, username) => {
    if (username === user.username) return setMsg("❌ Cannot delete your own account!");
    if (!confirm(`Delete user ${username}?`)) return;
    await axios.delete(`${SERVER}/api/users/${id}`); setMsg("✅ User deleted!"); loadData();
  };

  const inp = { width: "100%", background: "#0a0f1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "white", fontSize: "13px" };
  const btn = (color) => ({ background: color, color: "white", border: "none", borderRadius: "8px", padding: "10px 18px", fontSize: "13px", fontWeight: "600", cursor: "pointer" });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "white", fontFamily: "'Segoe UI', sans-serif" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#131929", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>💧</span>
          <span style={{ fontWeight: "700", fontSize: "16px" }}>Smart Drainage — Admin Panel</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ color: "#475569", fontSize: "13px" }}>👤 {user.username}</span>
          <button onClick={() => window.location.reload()} style={btn("#1e40af")}>📊 Dashboard</button>
          <button onClick={onLogout} style={btn("#7f1d1d")}>Logout</button>
        </div>
      </div>
      <div style={{ padding: "24px", maxWidth: "900px", margin: "0 auto" }}>
        {msg && <div style={{ background: msg.includes("✅") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.includes("✅") ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "14px", color: msg.includes("✅") ? "#22c55e" : "#ef4444" }}>{msg}</div>}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          <button onClick={() => setTab("units")} style={{ ...btn(tab === "units" ? "#22c55e" : "#1e293b"), color: tab === "units" ? "#000" : "#94a3b8" }}>🚰 Drainage Units</button>
          <button onClick={() => setTab("users")} style={{ ...btn(tab === "users" ? "#22c55e" : "#1e293b"), color: tab === "users" ? "#000" : "#94a3b8" }}>👥 Users</button>
        </div>

        {tab === "units" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#131929", borderRadius: "16px", padding: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ marginBottom: "16px", fontSize: "15px" }}>➕ Add Drainage Unit</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>UNIT ID (no spaces)</label><input value={newUnit.unit_id} onChange={e => setNewUnit({ ...newUnit, unit_id: e.target.value })} placeholder="e.g. drainage_4" style={inp} /></div>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>NAME</label><input value={newUnit.name} onChange={e => setNewUnit({ ...newUnit, name: e.target.value })} placeholder="e.g. Drainage 4" style={inp} /></div>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>LOCATION</label><input value={newUnit.location} onChange={e => setNewUnit({ ...newUnit, location: e.target.value })} placeholder="e.g. Purok 3" style={inp} /></div>
              </div>
              <button onClick={addUnit} style={btn("#22c55e")}>Add Unit</button>
            </div>
            <div style={{ background: "#131929", borderRadius: "16px", padding: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ marginBottom: "16px", fontSize: "15px" }}>🚰 Active Drainage Units ({units.length})</h3>
              {units.length === 0 ? <p style={{ color: "#475569" }}>No units yet.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {units.map(u => (
                    <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0f1e", borderRadius: "10px", padding: "12px 16px" }}>
                      <div><p style={{ fontWeight: "600", fontSize: "14px" }}>{u.name}</p><p style={{ color: "#475569", fontSize: "12px" }}>ID: {u.unit_id} {u.location ? `• 📍 ${u.location}` : ""}</p></div>
                      <button onClick={() => deleteUnit(u.unit_id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#131929", borderRadius: "16px", padding: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ marginBottom: "16px", fontSize: "15px" }}>➕ Create User Account</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>USERNAME</label><input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder="e.g. tanod1" style={inp} /></div>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>PASSWORD</label><input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Set password" style={inp} /></div>
                <div><label style={{ color: "#64748b", fontSize: "11px", display: "block", marginBottom: "4px" }}>ROLE</label>
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} style={inp}>
                    <option value="user">User (View only)</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <button onClick={addUser} style={btn("#22c55e")}>Create Account</button>
            </div>
            <div style={{ background: "#131929", borderRadius: "16px", padding: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ marginBottom: "16px", fontSize: "15px" }}>👥 All Users ({users.length})</h3>
              {users.length === 0 ? <p style={{ color: "#475569" }}>No users yet.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {users.map(u => (
                    <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0f1e", borderRadius: "10px", padding: "12px 16px" }}>
                      <div>
                        <p style={{ fontWeight: "600", fontSize: "14px" }}>👤 {u.username} {u.username === user.username ? <span style={{ color: "#22c55e", fontSize: "11px" }}>(you)</span> : ""}</p>
                        <p style={{ color: u.role === "admin" ? "#f59e0b" : "#475569", fontSize: "12px" }}>{u.role === "admin" ? "⭐ Admin" : "👁️ View only"}</p>
                      </div>
                      {u.username !== user.username && (
                        <button onClick={() => deleteUser(u.id, u.username)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}>Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => { const s = sessionStorage.getItem("drainage_user"); return s ? JSON.parse(s) : null; });
  const [showAdmin, setShowAdmin] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [data, setData] = useState({ debris_level: 0, overflow: 0, led_status: "GREEN", battery: 100 });
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overflowAlert, setOverflowAlert] = useState(false);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // PWA install
  useEffect(() => {
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); setInstallPrompt(e); });
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  };

  const loadUnit = (unit_id) => {
    axios.get(`${SERVER}/api/latest/${unit_id}`).then(res => {
      if (res.data && res.data.debris_level !== undefined) setData(res.data);
      else setData({ debris_level: 0, overflow: 0, led_status: "GREEN", battery: 100 });
    });
    axios.get(`${SERVER}/api/history/${unit_id}`).then(res => setHistory(res.data));
  };

  useEffect(() => {
    if (!user) return;
    axios.get(`${SERVER}/api/units`).then(res => {
      setUnits(res.data);
      if (res.data.length > 0) { setSelectedUnit(res.data[0].unit_id); loadUnit(res.data[0].unit_id); }
    });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("sensor_update", newData => {
      if (newData.unit_id === selectedUnit) {
        setData(newData);
        setHistory(prev => [...prev.slice(-49), newData]);
        if (newData.overflow) {
          setOverflowAlert(true);
          // Play alert sound
          try {
            const ctx = new AudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.value = 880;
            oscillator.type = "square";
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.5);
          } catch(e) {}
        } else {
          setOverflowAlert(false);
        }
      }
    });
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => { socket.off("sensor_update"); window.removeEventListener("resize", handleResize); };
  }, [user, selectedUnit]);

  const handleLogout = () => { sessionStorage.removeItem("drainage_user"); setUser(null); };
  const switchUnit = (unit_id) => { setSelectedUnit(unit_id); loadUnit(unit_id); setOverflowAlert(false); };
  const getLedColor = (s) => s === "RED" ? "#ef4444" : s === "YELLOW" ? "#f59e0b" : "#22c55e";
  const getDebrisColor = (l) => l > 70 ? "#ef4444" : l > 40 ? "#f59e0b" : "#22c55e";
  const getBatteryIcon = (b) => b > 60 ? "🔋" : b > 20 ? "🪫" : "⚠️";
  const getUnitName = (uid) => { const u = units.find(x => x.unit_id === uid); return u ? u.name : uid; };
  const getUnitLocation = (uid) => { const u = units.find(x => x.unit_id === uid); return u && u.location ? u.location : null; };

  const formatDate = (date) => date.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const formatTime = (date) => date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatChartTime = (ts) => { try { return new Date(ts).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  if (!user) return <LoginPage onLogin={setUser} />;
  if (showAdmin && user.role === "admin") return <AdminPanel user={user} onLogout={handleLogout} />;

  const cardStyle = { background: "#131929", borderRadius: "16px", padding: isMobile ? "16px" : "24px", border: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "white", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "40px" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}} *{box-sizing:border-box;margin:0;padding:0} .ubtn{border:none;cursor:pointer;transition:all 0.2s} .ubtn:hover{transform:translateY(-1px)}`}</style>

      {/* Overflow Alert Banner */}
      {overflowAlert && (
        <div style={{ background: "#ef4444", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", animation: "blink 1s infinite" }}>
          <p style={{ fontWeight: "700", fontSize: "15px" }}>⚠️ OVERFLOW DETECTED — {getUnitName(selectedUnit)} {getUnitLocation(selectedUnit) ? `• 📍 ${getUnitLocation(selectedUnit)}` : ""} — Immediate attention required!</p>
          <button onClick={() => setOverflowAlert(false)} style={{ background: "rgba(0,0,0,0.2)", border: "none", color: "white", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "13px" }}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", padding: isMobile ? "16px" : "0 32px", height: isMobile ? "auto" : "64px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? "18px" : "20px", fontWeight: "700" }}>💧 Smart Drainage Monitor</h1>
          <p style={{ fontSize: "11px", color: "#94a3b8" }}>👤 {user.username} • {user.role === "admin" ? "⭐ Admin" : "View only"}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Date and Time */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "4px 12px", textAlign: "right" }}>
            <p style={{ fontSize: "13px", fontWeight: "700", color: "white" }}>{formatTime(currentTime)}</p>
            <p style={{ fontSize: "10px", color: "#64748b" }}>{formatDate(currentTime)}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: connected ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: "99px", padding: "4px 10px", fontSize: "12px", color: connected ? "#22c55e" : "#ef4444" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", animation: connected ? "pulse 2s infinite" : "none" }}></div>
            {connected ? "Live" : "Offline"}
          </div>
          {user.role === "admin" && (
            <button className="ubtn" onClick={() => setShowAdmin(true)} style={{ background: "#1e40af", color: "white", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "600" }}>⚙️ Admin Panel</button>
          )}
          <button className="ubtn" onClick={() => setIsMobile(!isMobile)} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "6px 12px", fontSize: "12px" }}>
            {isMobile ? "🖥️ Desktop" : "📱 Mobile"}
          </button>
          <button className="ubtn" onClick={() => setShowInstall(true)} style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "600" }}>
            📲 Install App
          </button>
          <button className="ubtn" onClick={handleLogout} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}>Logout</button>
        </div>
      </div>

      {/* Unit selector */}
      <div style={{ padding: isMobile ? "12px" : "16px 32px", background: "#131929", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "8px", overflowX: "auto" }}>
        {units.map(u => (
          <button key={u.unit_id} className="ubtn" onClick={() => switchUnit(u.unit_id)}
            style={{ background: selectedUnit === u.unit_id ? "#22c55e" : "rgba(255,255,255,0.06)", color: selectedUnit === u.unit_id ? "#000" : "#94a3b8", border: `1px solid ${selectedUnit === u.unit_id ? "#22c55e" : "rgba(255,255,255,0.06)"}`, borderRadius: "99px", padding: "6px 16px", fontSize: "13px", fontWeight: selectedUnit === u.unit_id ? "700" : "400", whiteSpace: "nowrap" }}>
            📍 {u.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? "16px" : "24px 32px", maxWidth: "1200px", margin: "0 auto" }}>

        {/* Unit info bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <p style={{ fontSize: "12px", color: "#22c55e" }}>📊 Now viewing: <strong>{getUnitName(selectedUnit)}</strong></p>
            {getUnitLocation(selectedUnit) && <p style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>📍 Location: {getUnitLocation(selectedUnit)}</p>}
          </div>
          <p style={{ fontSize: "11px", color: "#334155" }}>Last updated: {data.timestamp ? new Date(data.timestamp).toLocaleString("en-PH") : "—"}</p>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
          <div style={cardStyle}>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: "600" }}>DEBRIS LEVEL</p>
            <p style={{ fontSize: isMobile ? "32px" : "40px", fontWeight: "800", color: getDebrisColor(data.debris_level), lineHeight: 1, marginBottom: "10px" }}>{data.debris_level ?? 0}%</p>
            <div style={{ background: "#1e293b", borderRadius: "99px", height: "6px" }}><div style={{ background: getDebrisColor(data.debris_level), height: "6px", borderRadius: "99px", width: `${data.debris_level ?? 0}%`, transition: "width 0.6s" }}></div></div>
          </div>
          <div style={cardStyle}>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: "600" }}>BATTERY {getBatteryIcon(data.battery)}</p>
            <p style={{ fontSize: isMobile ? "32px" : "40px", fontWeight: "800", color: data.battery > 20 ? "#22c55e" : "#ef4444", lineHeight: 1, marginBottom: "10px" }}>{data.battery ?? 0}%</p>
            <div style={{ background: "#1e293b", borderRadius: "99px", height: "6px" }}><div style={{ background: data.battery > 20 ? "#22c55e" : "#ef4444", height: "6px", borderRadius: "99px", width: `${data.battery ?? 0}%`, transition: "width 0.6s" }}></div></div>
          </div>
          <div style={{ ...cardStyle, background: data.overflow ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.07)", border: `1px solid ${data.overflow ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.2)"}` }}>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: "600" }}>OVERFLOW</p>
            <p style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: "800", color: data.overflow ? "#ef4444" : "#22c55e" }}>{data.overflow ? "⚠️ OVERFLOW!" : "✅ Normal"}</p>
            <p style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>{data.overflow ? "Immediate attention!" : "Operating normally"}</p>
          </div>
          <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0, background: getLedColor(data.led_status), boxShadow: `0 0 20px ${getLedColor(data.led_status)}88` }}></div>
            <div>
              <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px", fontWeight: "600" }}>LED STATUS</p>
              <p style={{ fontSize: "22px", fontWeight: "800", color: getLedColor(data.led_status) }}>{data.led_status ?? "GREEN"}</p>
              <p style={{ fontSize: "11px", color: "#475569" }}>{data.led_status === "RED" ? "Critical" : data.led_status === "YELLOW" ? "Warning" : "All clear"}</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div style={cardStyle}>
          <p style={{ fontWeight: "700", marginBottom: "16px" }}>Debris History — {getUnitName(selectedUnit)}</p>
          {history.length === 0 ? (
            <p style={{ color: "#334155", textAlign: "center", padding: "40px 0" }}>No data yet for this unit</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history}>
                <XAxis dataKey="timestamp" tickFormatter={formatChartTime} tick={{ fill: "#475569", fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} stroke="#1e293b" tick={{ fill: "#475569", fontSize: 10 }} width={28} />
                <Tooltip contentStyle={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }} labelFormatter={(ts) => new Date(ts).toLocaleString("en-PH")} formatter={v => [`${v}%`, "Debris"]} />
                <Line type="monotone" dataKey="debris_level" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Install Guide Modal */}
      {showInstall && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#131929", borderRadius: "20px", padding: "32px", maxWidth: "480px", width: "100%", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "700" }}>📲 Install Smart Drainage App</h2>
              <button onClick={() => setShowInstall(false)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "22px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#0a0f1e", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: "1px solid rgba(34,197,94,0.2)" }}>
              <p style={{ fontWeight: "700", marginBottom: "10px", color: "#22c55e", fontSize: "14px" }}>🤖 Android (Chrome)</p>
              <ol style={{ paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#94a3b8" }}>
                <li>Open <strong style={{ color: "white" }}>Chrome</strong> on your Android phone</li>
                <li>Go to <strong style={{ color: "#22c55e" }}>smart-drainage.vercel.app</strong></li>
                <li>Tap the <strong style={{ color: "white" }}>3 dots menu ⋮</strong> at top right</li>
                <li>Tap <strong style={{ color: "white" }}>"Add to Home Screen"</strong></li>
                <li>Tap <strong style={{ color: "white" }}>"Add"</strong> ✅</li>
              </ol>
              {installPrompt && (
                <button onClick={handleInstall} style={{ marginTop: "12px", background: "#22c55e", color: "#000", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer", width: "100%" }}>
                  ⚡ Quick Install — Tap Here!
                </button>
              )}
            </div>
            <div style={{ background: "#0a0f1e", borderRadius: "12px", padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontWeight: "700", marginBottom: "10px", color: "#94a3b8", fontSize: "14px" }}>🍎 iPhone (Safari)</p>
              <ol style={{ paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "#94a3b8" }}>
                <li>Open <strong style={{ color: "white" }}>Safari</strong> on your iPhone</li>
                <li>Go to <strong style={{ color: "#22c55e" }}>smart-drainage.vercel.app</strong></li>
                <li>Tap the <strong style={{ color: "white" }}>Share button ⬆️</strong> at the bottom</li>
                <li>Tap <strong style={{ color: "white" }}>"Add to Home Screen"</strong></li>
                <li>Tap <strong style={{ color: "white" }}>"Add"</strong> ✅</li>
              </ol>
            </div>
            <p style={{ fontSize: "11px", color: "#334155", textAlign: "center", marginTop: "16px" }}>Once installed, it works like a real app — no app store needed!</p>
          </div>
        </div>
      )}
    </div>
  );
}