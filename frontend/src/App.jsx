import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const SERVER = "https://smart-drainage-production.up.railway.app";
const socket = io(SERVER);

export default function App() {
  const [units, setUnits] = useState(['drainage_1', 'drainage_2', 'drainage_3']);
  const [selectedUnit, setSelectedUnit] = useState('drainage_1');
  const [data, setData] = useState({ debris_level: 0, overflow: 0, led_status: "GREEN", battery: 100 });
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);

  const formatUnit = (id) => id.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

  const loadUnit = (unit_id) => {
    axios.get(`${SERVER}/api/latest/${unit_id}`).then((res) => {
      if (res.data && res.data.debris_level !== undefined) setData(res.data);
      else setData({ debris_level: 0, overflow: 0, led_status: "GREEN", battery: 100 });
    });
    axios.get(`${SERVER}/api/history/${unit_id}`).then((res) => setHistory(res.data.reverse()));
  };

  useEffect(() => {
    axios.get(`${SERVER}/api/units`).then((res) => setUnits(res.data));
    loadUnit(selectedUnit);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("sensor_update", (newData) => {
      if (newData.unit_id === selectedUnit) {
        setData(newData);
        setHistory((prev) => [...prev.slice(-49), newData]);
      }
    });
    return () => socket.off("sensor_update");
  }, []);

  const switchUnit = (unit_id) => {
    setSelectedUnit(unit_id);
    loadUnit(unit_id);
  };

  const getLedColor = (s) => s === "RED" ? "#ef4444" : s === "YELLOW" ? "#f59e0b" : "#22c55e";
  const getDebrisColor = (l) => l > 70 ? "#ef4444" : l > 40 ? "#f59e0b" : "#22c55e";
  const getBatteryIcon = (b) => b > 60 ? "🔋" : b > 20 ? "🪫" : "⚠️";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "white", fontFamily: "'Segoe UI', sans-serif", maxWidth: "480px", margin: "0 auto", paddingBottom: "80px" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .unit-btn { border: none; cursor: pointer; transition: all 0.2s; }
        .unit-btn:hover { transform: translateY(-1px); }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)", padding: "20px 16px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "700" }}>💧 Smart Drainage</h1>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>Multi-unit monitoring system</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: connected ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: "99px", padding: "4px 10px", fontSize: "12px", color: connected ? "#22c55e" : "#ef4444" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", animation: connected ? "pulse 2s infinite" : "none" }}></div>
            {connected ? "Live" : "Offline"}
          </div>
        </div>

        {/* Unit Selector Buttons */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
          {units.map((unit) => (
            <button key={unit} className="unit-btn" onClick={() => switchUnit(unit)}
              style={{ background: selectedUnit === unit ? "#22c55e" : "rgba(255,255,255,0.08)", color: selectedUnit === unit ? "#000" : "#94a3b8", borderRadius: "99px", padding: "6px 14px", fontSize: "13px", fontWeight: selectedUnit === unit ? "700" : "400", whiteSpace: "nowrap" }}>
              📍 {formatUnit(unit)}
            </button>
          ))}
        </div>
      </div>

      {/* Currently viewing banner */}
      <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.05)", borderBottom: "1px solid rgba(34,197,94,0.1)" }}>
        <p style={{ fontSize: "12px", color: "#22c55e" }}>📊 Now viewing: <strong>{formatUnit(selectedUnit)}</strong></p>
      </div>

      {/* Debris + Battery */}
      <div style={{ padding: "16px 16px 0" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", color: "#475569", letterSpacing: "1px", marginBottom: "10px" }}>SENSOR READINGS</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div style={{ background: "#131929", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: "600" }}>DEBRIS LEVEL</p>
            <p style={{ fontSize: "32px", fontWeight: "800", color: getDebrisColor(data.debris_level), marginBottom: "10px", lineHeight: 1 }}>{data.debris_level ?? 0}%</p>
            <div style={{ background: "#1e293b", borderRadius: "99px", height: "6px" }}>
              <div style={{ background: getDebrisColor(data.debris_level), height: "6px", borderRadius: "99px", width: `${data.debris_level ?? 0}%`, transition: "width 0.6s ease" }}></div>
            </div>
          </div>
          <div style={{ background: "#131929", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: "600" }}>BATTERY {getBatteryIcon(data.battery)}</p>
            <p style={{ fontSize: "32px", fontWeight: "800", color: data.battery > 20 ? "#22c55e" : "#ef4444", marginBottom: "10px", lineHeight: 1 }}>{data.battery ?? 0}%</p>
            <div style={{ background: "#1e293b", borderRadius: "99px", height: "6px" }}>
              <div style={{ background: data.battery > 20 ? "#22c55e" : "#ef4444", height: "6px", borderRadius: "99px", width: `${data.battery ?? 0}%`, transition: "width 0.6s ease" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Overflow */}
      <div style={{ padding: "16px 16px 0" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", color: "#475569", letterSpacing: "1px", marginBottom: "10px" }}>OVERFLOW STATUS</p>
        <div style={{ background: data.overflow ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.07)", borderRadius: "16px", padding: "16px", border: `1px solid ${data.overflow ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.2)"}` }}>
          <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px", fontWeight: "600" }}>FLOAT SWITCH</p>
          <p style={{ fontSize: "22px", fontWeight: "800", color: data.overflow ? "#ef4444" : "#22c55e", margin: "4px 0" }}>
            {data.overflow ? "⚠️ OVERFLOW DETECTED!" : "✅ Normal — No Overflow"}
          </p>
          <p style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
            {data.overflow ? "Immediate attention required" : "Drainage operating normally"}
          </p>
        </div>
      </div>

      {/* LED */}
      <div style={{ padding: "16px 16px 0" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", color: "#475569", letterSpacing: "1px", marginBottom: "10px" }}>LED INDICATOR</p>
        <div style={{ background: "#131929", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", flexShrink: 0, background: getLedColor(data.led_status), boxShadow: `0 0 20px ${getLedColor(data.led_status)}88` }}></div>
          <div>
            <p style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px", fontWeight: "600" }}>CURRENT STATUS</p>
            <p style={{ fontSize: "26px", fontWeight: "800", color: getLedColor(data.led_status) }}>{data.led_status ?? "GREEN"}</p>
            <p style={{ fontSize: "12px", color: "#475569" }}>
              {data.led_status === "RED" ? "Critical — drain blocked" : data.led_status === "YELLOW" ? "Warning — debris building up" : "Clear — all good"}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: "16px 16px 0" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", color: "#475569", letterSpacing: "1px", marginBottom: "10px" }}>DEBRIS HISTORY — {formatUnit(selectedUnit)}</p>
        <div style={{ background: "#131929", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
          {history.length === 0 ? (
            <p style={{ color: "#334155", textAlign: "center", padding: "30px 0", fontSize: "13px" }}>No data yet for {formatUnit(selectedUnit)}</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={history}>
                <XAxis dataKey="timestamp" hide />
                <YAxis domain={[0, 100]} stroke="#1e293b" tick={{ fill: "#475569", fontSize: 10 }} width={28} />
                <Tooltip contentStyle={{ background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }} labelFormatter={() => ""} formatter={(v) => [`${v}%`, "Debris"]} />
                <Line type="monotone" dataKey="debris_level" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <p style={{ fontSize: "11px", color: "#334155", textAlign: "center", marginTop: "12px" }}>
          Last updated: {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "—"}
        </p>
      </div>

    </div>
  );
}