import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { io } from 'socket.io-client';
import './App.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_URL = 'https://smart-drainage-production.up.railway.app';
const SOCKET_URL = 'wss://smart-drainage-production.up.railway.app';
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;

const VAPID_PUBLIC_KEY = 'BM9CHUWgQEjHXyL4KSxd_f3G2hVoj99fw_9TojPGjJAd5HXCGBEkXPWD8KgdRbmakpFiGWAe7X5qr3szhOi6uTM';

const translations = {
  en: {
    login: 'Login', username: 'Username', password: 'Password', rememberMe: 'Remember Me',
    dashboard: 'Dashboard', drainageStatus: 'Drainage Status', debrisLevel: 'Debris Level',
    overflow: 'Overflow', ledStatus: 'LED Status', battery: 'Battery', deviceStatus: 'Device Status',
    live: 'Live', offline: 'Offline', maintenance: 'Maintenance', startMaintenance: '🔧 Start Maintenance',
    endMaintenance: '✅ End Maintenance', underMaintenance: '🔧 Under Maintenance', maintenanceBy: 'By',
    maintenanceReason: 'Reason', history: 'History', downloadCSV: 'Download CSV', downloadPDF: 'Download PDF',
    notifications: 'Notifications', loginHistory: 'Login History', settings: 'Settings',
    darkMode: 'Dark Mode', lightMode: 'Light Mode', language: 'Language', english: 'English',
    tagalog: 'Tagalog', voiceAlert: 'Voice Alert', enablePush: '🔕 Enable Alerts', disablePush: '🔔 Disable Alerts',
    logout: 'Logout', willAutoLogout: 'Auto-logout in', minutes: 'minutes', alertOverflow: 'OVERFLOW DETECTED',
    alertCritical: 'CRITICAL LEVEL', noData: 'No data available', selectUnit: 'Select Unit',
    adminPanel: 'Admin Panel', users: 'Users', units: 'Units', addUser: 'Add User', addUnit: 'Add Unit',
    photoUpload: 'Upload Photo', maintenanceNote: 'What is being done?', cancel: 'Cancel', confirm: 'Confirm',
    done: 'Done', refresh: 'Refresh', dateRange: 'Date Range', from: 'From', to: 'To', filter: 'Filter',
    all: 'All', type: 'Type', message: 'Message', time: 'Time', sent: 'Sent', ip: 'IP Address', role: 'Role',
    lastLogin: 'Last Login', normal: 'Normal', warning: 'Warning', critical: 'Critical', emergency: 'Emergency',
  },
  tl: {
    login: 'Mag-login', username: 'Username', password: 'Password', rememberMe: 'Tandaan Ako',
    dashboard: 'Dashboard', drainageStatus: 'Status ng Drainage', debrisLevel: 'Antas ng Basura',
    overflow: 'Umaapaw', ledStatus: 'Status ng LED', battery: 'Baterya', deviceStatus: 'Status ng Device',
    live: 'Live', offline: 'Offline', maintenance: 'Maintenance', startMaintenance: '🔧 Simulan ang Maintenance',
    endMaintenance: '✅ Tapos na ang Maintenance', underMaintenance: '🔧 Sa Ilalim ng Maintenance', maintenanceBy: 'Ni',
    maintenanceReason: 'Dahilan', history: 'Kasaysayan', downloadCSV: 'I-download ang CSV', downloadPDF: 'I-download ang PDF',
    notifications: 'Mga Abiso', loginHistory: 'Kasaysayan ng Login', settings: 'Mga Setting',
    darkMode: 'Dark Mode', lightMode: 'Light Mode', language: 'Wika', english: 'English', tagalog: 'Tagalog',
    voiceAlert: 'Voice Alert', enablePush: '🔕 Buksan ang Alerts', disablePush: '🔔 Isara ang Alerts',
    logout: 'Mag-logout', willAutoLogout: 'Auto-logout sa', minutes: 'minuto', alertOverflow: 'UMAAPAW ANG DRAINAGE',
    alertCritical: 'KRITIKAL NA ANG LEVEL', noData: 'Walang datos', selectUnit: 'Pumili ng Unit',
    adminPanel: 'Admin Panel', users: 'Mga User', units: 'Mga Unit', addUser: 'Magdagdag ng User', addUnit: 'Magdagdag ng Unit',
    photoUpload: 'Mag-upload ng Litrato', maintenanceNote: 'Ano ang ginagawa?', cancel: 'Kanselahin', confirm: 'Kumpirmahin',
    done: 'Tapos', refresh: 'I-refresh', dateRange: 'Saklaw ng Petsa', from: 'Mula', to: 'Hanggang', filter: 'I-filter',
    all: 'Lahat', type: 'Uri', message: 'Mensahe', time: 'Oras', sent: 'Naipadala', ip: 'IP Address', role: 'Role',
    lastLogin: 'Huling Login', normal: 'Normal', warning: 'Babala', critical: 'Kritikal', emergency: 'Emergency',
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', rememberMe: false });
  const [selectedUnit, setSelectedUnit] = useState('drainage_1');
  const [units, setUnits] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [sensorData, setSensorData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [deviceStatus, setDeviceStatus] = useState({});
  const [maintenanceStatus, setMaintenanceStatus] = useState({});
  const [notificationLog, setNotificationLog] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState('en');
  const [voiceAlert, setVoiceAlert] = useState(false);
  const [timeLeft, setTimeLeft] = useState(INACTIVITY_TIMEOUT);
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '' });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [addUserModal, setAddUserModal] = useState(false);
  const [addUnitModal, setAddUnitModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', unit_id: '' });
  const [newUnit, setNewUnit] = useState({ unit_id: '', name: '', location: '' });
  const [adminError, setAdminError] = useState(null);
  
  const t = translations[lang];
  const inactivityTimer = useRef(null);
  const countdownTimer = useRef(null);
  const socketRef = useRef(null);

  // ========== LOAD SAVED USER & SETTINGS ON MOUNT ==========
  useEffect(() => {
    const savedUser = localStorage.getItem('drainage_user');
    const savedTime = localStorage.getItem('drainage_loginTime');
    const savedRemember = localStorage.getItem('drainage_remember') === 'true';
    
    if (savedUser && savedTime) {
      const elapsed = Date.now() - parseInt(savedTime);
      if (savedRemember && elapsed < INACTIVITY_TIMEOUT) {
        try {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          setTimeLeft(INACTIVITY_TIMEOUT - elapsed);
        } catch (e) {
          console.error('Failed to parse saved user:', e);
          localStorage.removeItem('drainage_user');
          localStorage.removeItem('drainage_loginTime');
          localStorage.removeItem('drainage_remember');
        }
      } else {
        localStorage.removeItem('drainage_user');
        localStorage.removeItem('drainage_loginTime');
        localStorage.removeItem('drainage_remember');
      }
    }
    
    // Load settings from localStorage
    const savedDarkMode = localStorage.getItem('drainage_darkMode');
    const savedLang = localStorage.getItem('drainage_lang');
    const savedVoiceAlert = localStorage.getItem('drainage_voiceAlert');
    const savedPush = localStorage.getItem('drainage_push');
    
    if (savedDarkMode !== null) setDarkMode(savedDarkMode === 'true');
    if (savedLang !== null) setLang(savedLang);
    if (savedVoiceAlert !== null) setVoiceAlert(savedVoiceAlert === 'true');
    if (savedPush !== null) setPushEnabled(savedPush === 'true');
  }, []);

  // ========== SAVE SETTINGS TO LOCALSTORAGE ==========
  useEffect(() => {
    localStorage.setItem('drainage_darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('drainage_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('drainage_voiceAlert', voiceAlert.toString());
  }, [voiceAlert]);

  useEffect(() => {
    localStorage.setItem('drainage_push', pushEnabled.toString());
  }, [pushEnabled]);

  // Check existing push subscription on mount
  useEffect(() => {
    const checkPushStatus = async () => {
      if (!('serviceWorker' in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const savedPush = localStorage.getItem('drainage_push') === 'true';
        setPushEnabled(!!sub && savedPush);
      } catch (e) { console.error('Push status check error:', e); }
    };
    checkPushStatus();
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!user) return;
    clearTimeout(inactivityTimer.current);
    clearInterval(countdownTimer.current);
    setTimeLeft(INACTIVITY_TIMEOUT);
    
    inactivityTimer.current = setTimeout(() => {
      setUser(null);
      setSensorData(null);
      setHistoryData([]);
      localStorage.removeItem('drainage_user');
      localStorage.removeItem('drainage_loginTime');
      localStorage.removeItem('drainage_remember');
      if (socketRef.current) socketRef.current.disconnect();
    }, INACTIVITY_TIMEOUT);
    
    countdownTimer.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(countdownTimer.current);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    
    localStorage.setItem('drainage_loginTime', Date.now().toString());
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => resetInactivityTimer();
    events.forEach(e => document.addEventListener(e, handleActivity));
    resetInactivityTimer();
    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity));
      clearTimeout(inactivityTimer.current);
      clearInterval(countdownTimer.current);
    };
  }, [user, resetInactivityTimer]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const s = io(SOCKET_URL);
    socketRef.current = s;
    
    s.on('sensorUpdate', (data) => {
      if (data.unit_id === selectedUnit) setSensorData(data);
      setDeviceStatus(prev => ({
        ...prev,
        [data.unit_id]: { status: 'live', lastSeen: new Date().toISOString() }
      }));
    });
    
    s.on('alert', (alert) => {
      if (alert.unit_id === selectedUnit) {
        addAlert(alert.message, alert.type);
        if (voiceAlert) speakAlert(alert.message);
        // 🔊 Play alarm sound on overflow or critical
        if (alert.type === 'overflow' || alert.type === 'critical') {
          playAlarmSound();
        }
      }
    });
    
    s.on('deviceStatus', ({ unit_id, status }) => {
      setDeviceStatus(prev => ({ ...prev, [unit_id]: { status, lastSeen: new Date().toISOString() } }));
    });
    
    s.on('maintenanceUpdate', ({ unit_id, maintenance, startedBy, reason }) => {
      setMaintenanceStatus(prev => ({
        ...prev,
        [unit_id]: maintenance 
          ? { active: true, startedBy, reason, startedAt: new Date().toISOString() }
          : { active: false }
      }));
    });
    
    return () => s.disconnect();
  }, [user, selectedUnit, voiceAlert]);

  useEffect(() => {
    if (!user) return;
    fetchUnits();
    fetchUsers();
    fetchSensorData();
    fetchMaintenanceStatus();
    fetchNotificationLog();
    if (user.role === 'admin') fetchLoginHistory();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchSensorData();
    fetchHistory();
  }, [selectedUnit]);

  const fetchUnits = async () => {
    try {
      const res = await fetch(`${API_URL}/api/units`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setUnits(data);
      } else {
        console.error('Units data is not an array:', data);
        setUnits([]);
      }
    } catch (e) { 
      console.error('Fetch units error:', e); 
      setUnits([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsersList(data);
      } else {
        console.error('Users data is not an array:', data);
        setUsersList([]);
      }
    } catch (e) { 
      console.error('Fetch users error:', e); 
      setUsersList([]);
    }
  };

  const fetchSensorData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/data/${selectedUnit}?limit=1`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setSensorData(data[0]);
      }
    } catch (e) { console.error('Fetch sensor error:', e); }
  };

  const fetchHistory = async () => {
    try {
      let url = `${API_URL}/api/data/${selectedUnit}/history?limit=50`;
      if (historyFilter.startDate) url += `&startDate=${historyFilter.startDate}`;
      if (historyFilter.endDate) url += `&endDate=${historyFilter.endDate}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistoryData(data);
        
        const labels = data.slice().reverse().map(d => new Date(d.timestamp).toLocaleTimeString());
        const levels = data.slice().reverse().map(d => d.debris_level);
        
        setChartData({
          labels,
          datasets: [{
            label: t.debrisLevel,
            data: levels,
            borderColor: darkMode ? '#4fc3f7' : '#1976d2',
            backgroundColor: darkMode ? 'rgba(79,195,247,0.1)' : 'rgba(25,118,210,0.1)',
            tension: 0.4,
            fill: true,
          }]
        });
      } else {
        setHistoryData([]);
      }
    } catch (e) { 
      console.error('Fetch history error:', e); 
      setHistoryData([]);
    }
  };

  const fetchMaintenanceStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/status`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        setMaintenanceStatus(data);
      } else {
        setMaintenanceStatus({});
      }
    } catch (e) { 
      console.error('Fetch maintenance error:', e); 
      setMaintenanceStatus({});
    }
  };

  const fetchNotificationLog = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/log`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setNotificationLog(data);
      } else {
        setNotificationLog([]);
      }
    } catch (e) { 
      console.error('Fetch notifications error:', e); 
      setNotificationLog([]);
    }
  };

  const fetchLoginHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/login-history`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoginHistory(data);
      } else {
        console.error('Login history data is not an array:', data);
        setLoginHistory([]);
      }
    } catch (e) { 
      console.error('Fetch login history error:', e); 
      setLoginHistory([]);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('drainage_user', JSON.stringify(data.user));
        localStorage.setItem('drainage_loginTime', Date.now().toString());
        localStorage.setItem('drainage_remember', loginForm.rememberMe.toString());
      } else {
        alert('Invalid credentials!');
      }
    } catch (e) { 
      console.error('Login error:', e);
      alert('Login failed!'); 
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSensorData(null);
    setHistoryData([]);
    localStorage.removeItem('drainage_user');
    localStorage.removeItem('drainage_loginTime');
    localStorage.removeItem('drainage_remember');
    if (socketRef.current) socketRef.current.disconnect();
  };

  const addAlert = (message, type) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, message, type, time: new Date().toLocaleTimeString() }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, 5000);
  };

  const speakAlert = (message) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = lang === 'tl' ? 'fil-PH' : 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // 🔊 NEW: Alarm sound using Web Audio API (no external files needed)
  const playAlarmSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      
      // Second beep
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(800, ctx.currentTime);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);
      }, 250);
    } catch (e) { console.error('Alarm sound error:', e); }
  };

  const togglePush = async () => {
    if (!pushEnabled) {
      try {
        if (!('Notification' in window)) {
          alert('This browser does not support push notifications');
          return;
        }
        
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          const reg = await navigator.serviceWorker.register('/sw.js');
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          
          await fetch(`${API_URL}/api/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
          });
          
          setPushEnabled(true);
          localStorage.setItem('drainage_push', 'true');
        } else {
          setPushEnabled(false);
          localStorage.removeItem('drainage_push');
          alert('Push notifications permission was denied. Please enable it in browser settings if you want alerts.');
        }
      } catch (e) { 
        console.error('Push error:', e);
        setPushEnabled(false);
        localStorage.removeItem('drainage_push');
      }
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
        }
      } catch (e) { console.error('Unsubscribe error:', e); }
      
      setPushEnabled(false);
      localStorage.removeItem('drainage_push');
    }
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  };

  const startMaintenance = async () => {
    try {
      await fetch(`${API_URL}/api/maintenance/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: selectedUnit,
          startedBy: user?.username || 'Unknown',
          reason: maintenanceReason || 'Cleaning'
        })
      });
      setMaintenanceModal(false);
      setMaintenanceReason('');
      fetchMaintenanceStatus();
    } catch (e) { alert('Failed to start maintenance'); }
  };

  const endMaintenance = async () => {
    try {
      await fetch(`${API_URL}/api/maintenance/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: selectedUnit })
      });
      fetchMaintenanceStatus();
    } catch (e) { alert('Failed to end maintenance'); }
  };

  const createUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (data.success) {
        setAddUserModal(false);
        setNewUser({ username: '', password: '', role: 'user', unit_id: '' });
        fetchUsers();
      } else {
        alert('Failed to add user');
      }
    } catch (e) { alert('Error adding user'); }
  };

  const createUnit = async () => {
    try {
      const res = await fetch(`${API_URL}/api/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUnit)
      });
      const data = await res.json();
      if (data.success) {
        setAddUnitModal(false);
        setNewUnit({ unit_id: '', name: '', location: '' });
        fetchUnits();
      } else {
        alert('Failed to add unit');
      }
    } catch (e) { alert('Error adding unit'); }
  };

  const deleteUser = async (username) => {
    if (!username) return;
    if (username === user?.username) {
      alert('You cannot delete your own account!');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/users/${encodeURIComponent(username)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
        alert('User deleted successfully');
      } else {
        alert('Failed to delete user: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Delete user error:', e);
      alert('Error deleting user');
    }
  };

  const deleteUnit = async (unitId) => {
    if (!unitId) return;
    if (!window.confirm(`Are you sure you want to delete unit "${unitId}"?`)) return;
    
    try {
      const res = await fetch(`${API_URL}/api/units/${encodeURIComponent(unitId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchUnits();
        alert('Unit deleted successfully');
      } else {
        alert('Failed to delete unit: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Delete unit error:', e);
      alert('Error deleting unit');
    }
  };

  const downloadCSV = () => {
    if (!Array.isArray(historyData) || historyData.length === 0) return;
    const headers = ['Timestamp', 'Debris Level (%)', 'Distance (cm)', 'Overflow', 'LED', 'Battery (%)', 'Maintenance'];
    const rows = historyData.map(d => [
      d.timestamp, d.debris_level, d.distance, d.overflow ? 'Yes' : 'No',
      d.led_status, d.battery, d.maintenance ? 'Yes' : 'No'
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drainage_history_${selectedUnit}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const downloadPDF = () => {
    if (!Array.isArray(historyData) || historyData.length === 0) return;
    const printWindow = window.open('', '_blank');
    const rows = historyData.map(d => `
      <tr>
        <td>${new Date(d.timestamp).toLocaleString()}</td>
        <td>${d.debris_level}%</td>
        <td>${d.distance}cm</td>
        <td>${d.overflow ? 'Yes' : 'No'}</td>
        <td>${d.led_status}</td>
        <td>${d.maintenance ? 'Yes' : 'No'}</td>
      </tr>
    `).join('');
    
    printWindow.document.write(`
      <html>
        <head><title>Drainage History - ${selectedUnit}</title></head>
        <body>
          <h1>Drainage History Report</h1>
          <p>Unit: ${selectedUnit}</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table border="1" cellpadding="8">
            <tr><th>Timestamp</th><th>Debris Level</th><th>Distance</th><th>Overflow</th><th>LED</th><th>Maintenance</th></tr>
            ${rows}
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getStatusColor = (level) => {
    if (level >= 70) return '#f44336';
    if (level >= 40) return '#ff9800';
    return '#4caf50';
  };

  const getStatusText = (level) => {
    if (level >= 70) return t.critical;
    if (level >= 40) return t.warning;
    return t.normal;
  };

  const formatTimeLeft = (ms) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const safeArray = (arr) => Array.isArray(arr) ? arr : [];
  const safeObject = (obj) => (obj && typeof obj === 'object') ? obj : {};

  if (!user) {
    return (
      <div className={`login-container ${darkMode ? 'dark' : ''}`}>
        <div className="login-box">
          <h1>🌊 Smart Drainage</h1>
          <h2>{t.login}</h2>
          {!isOnline && <div className="offline-banner">⚠️ You are offline. Some features may not work.</div>}
          <form onSubmit={handleLogin}>
            <input type="text" placeholder={t.username} value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} required />
            <input type="password" placeholder={t.password} value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
            <label className="remember-me">
              <input type="checkbox" checked={loginForm.rememberMe} onChange={e => setLoginForm({...loginForm, rememberMe: e.target.checked})} />
              {t.rememberMe}
            </label>
            <button type="submit">{t.login}</button>
          </form>
          <div className="login-settings">
            <button onClick={() => setDarkMode(!darkMode)}>{darkMode ? '☀️' : '🌙'}</button>
            <button onClick={() => setLang(lang === 'en' ? 'tl' : 'en')}>{lang === 'en' ? '🇵🇭 TL' : '🇺🇸 EN'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <div className="alerts-container">
        {alerts.map(alert => (
          <div key={alert.id} className={`alert alert-${alert.type}`}>
            <span>{alert.message}</span>
            <span className="alert-time">{alert.time}</span>
          </div>
        ))}
      </div>

      <header className="app-header">
        <h1>🌊 Smart Drainage</h1>
        <div className="header-controls">
          <span className="timer">⏱️ {t.willAutoLogout}: {formatTimeLeft(timeLeft)}</span>
          <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="unit-select">
            {safeArray(units).map(u => <option key={u?.unit_id} value={u?.unit_id}>{u?.name || u?.unit_id}</option>)}
          </select>
          <button onClick={togglePush} className={pushEnabled ? 'active' : ''}>{pushEnabled ? t.disablePush : t.enablePush}</button>
          <button onClick={() => setActiveTab('settings')}>⚙️</button>
          <button onClick={handleLogout}>{t.logout}</button>
        </div>
      </header>

      <nav className="app-nav">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>📊 {t.dashboard}</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>📈 {t.history}</button>
        <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>🔔 {t.notifications}</button>
        {user?.role === 'admin' && <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>🔐 {t.adminPanel}</button>}
      </nav>

      {activeTab === 'dashboard' && (
        <div className="dashboard">
          {!isOnline && <div className="offline-banner">⚠️ Offline mode - Showing cached data</div>}
          {maintenanceStatus[selectedUnit]?.active && (
            <div className="maintenance-banner">
              🔧 {t.underMaintenance} 
              {maintenanceStatus[selectedUnit].startedBy && ` - ${t.maintenanceBy}: ${maintenanceStatus[selectedUnit].startedBy}`}
              {maintenanceStatus[selectedUnit].reason && ` - ${maintenanceStatus[selectedUnit].reason}`}
            </div>
          )}

          <div className="status-cards">
            <div className="status-card">
              <h3>{t.debrisLevel}</h3>
              <div className="big-number" style={{ color: getStatusColor(sensorData?.debris_level || 0) }}>
                {sensorData ? `${sensorData.debris_level?.toFixed(1)}%` : '--'}
              </div>
              <div className="status-text">{sensorData ? getStatusText(sensorData.debris_level) : t.noData}</div>
              {sensorData?.maintenance && <span className="maintenance-badge">🔧</span>}
            </div>
            <div className="status-card">
              <h3>Distance</h3>
              <div className="big-number">{sensorData?.distance != null ? `${sensorData.distance.toFixed(2)} cm` : '--'}</div>
            </div>
            <div className="status-card">
              <h3>{t.overflow}</h3>
              <div className={`big-number ${sensorData?.overflow ? 'danger' : 'safe'}`}>
                {sensorData ? (sensorData.overflow ? 'YES 🚨' : 'NO ✓') : '--'}
              </div>
            </div>
            <div className="status-card">
              <h3>{t.ledStatus}</h3>
              <div className="led-indicator" style={{
                backgroundColor: sensorData?.led_status === 'RED' ? '#f44336' : sensorData?.led_status === 'YELLOW' ? '#ff9800' : '#4caf50',
                boxShadow: `0 0 20px ${sensorData?.led_status === 'RED' ? '#f4433680' : sensorData?.led_status === 'YELLOW' ? '#ff980080' : '#4caf5080'}`
              }}>{sensorData?.led_status || '--'}</div>
            </div>
            <div className="status-card">
              <h3>{t.battery}</h3>
              <div className="big-number">{sensorData?.battery != null ? `${sensorData.battery}%` : '--'}</div>
              <div className="battery-bar">
                <div style={{ width: `${sensorData?.battery || 0}%`, backgroundColor: (sensorData?.battery || 0) > 50 ? '#4caf50' : (sensorData?.battery || 0) > 20 ? '#ff9800' : '#f44336' }}></div>
              </div>
            </div>
            <div className="status-card">
              <h3>{t.deviceStatus}</h3>
              <div className={`device-status ${deviceStatus[selectedUnit]?.status === 'live' ? 'live' : 'offline'}`}>
                <span className="status-dot"></span>
                {deviceStatus[selectedUnit]?.status === 'live' ? t.live : t.offline}
              </div>
              {deviceStatus[selectedUnit]?.lastSeen && <small>Last seen: {new Date(deviceStatus[selectedUnit].lastSeen).toLocaleTimeString()}</small>}
            </div>
          </div>

          <div className="maintenance-section">
            {maintenanceStatus[selectedUnit]?.active ? (
              <button className="maintenance-btn end" onClick={endMaintenance}>{t.endMaintenance}</button>
            ) : (
              <button className="maintenance-btn start" onClick={() => setMaintenanceModal(true)}>{t.startMaintenance}</button>
            )}
          </div>

          <div className="chart-container">
            <h3>{t.debrisLevel} - {t.history}</h3>
            <Line data={chartData} options={{
              responsive: true,
              plugins: { legend: { position: 'top' }, title: { display: true, text: `${selectedUnit} - Last 50 Readings` } },
              scales: { y: { min: 0, max: 100, title: { display: true, text: 'Fill %' } } }
            }} />
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-tab">
          <h2>{t.history}</h2>
          <div className="history-filters">
            <label>{t.from}: <input type="date" value={historyFilter.startDate} onChange={e => setHistoryFilter({...historyFilter, startDate: e.target.value})} /></label>
            <label>{t.to}: <input type="date" value={historyFilter.endDate} onChange={e => setHistoryFilter({...historyFilter, endDate: e.target.value})} /></label>
            <button onClick={fetchHistory}>{t.filter}</button>
            <button onClick={downloadCSV}>📄 {t.downloadCSV}</button>
            <button onClick={downloadPDF}>🖨️ {t.downloadPDF}</button>
          </div>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr><th>{t.time}</th><th>{t.debrisLevel}</th><th>Distance</th><th>{t.overflow}</th><th>LED</th><th>{t.battery}</th><th>{t.maintenance}</th></tr>
              </thead>
              <tbody>
                {safeArray(historyData).map((d, i) => (
                  <tr key={i} className={d?.maintenance ? 'maintenance-row' : ''}>
                    <td>{d?.timestamp ? new Date(d.timestamp).toLocaleString() : '-'}</td>
                    <td style={{ color: getStatusColor(d?.debris_level || 0) }}>{d?.debris_level?.toFixed(1)}%</td>
                    <td>{d?.distance != null ? `${d.distance.toFixed(2)}cm` : '-'}</td>
                    <td>{d?.overflow ? '⚠️ YES' : '✓ No'}</td>
                    <td><span className={`led-mini ${d?.led_status?.toLowerCase()}`}>{d?.led_status}</span></td>
                    <td>{d?.battery != null ? `${d.battery}%` : '-'}</td>
                    <td>{d?.maintenance ? '🔧' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="notifications-tab">
          <h2>{t.notifications}</h2>
          <button onClick={fetchNotificationLog} className="refresh-btn">🔄 {t.refresh}</button>
          <div className="notification-list">
            {safeArray(notificationLog).length === 0 ? <p className="no-data">{t.noData}</p> : (
              safeArray(notificationLog).slice().reverse().map((n, i) => (
                <div key={i} className={`notification-item ${n?.type}`}>
                  <div className="notification-header">
                    <span className="notification-unit">{n?.unit_id}</span>
                    <span className="notification-type">{n?.type === 'overflow' ? '🚨' : '⚠️'} {n?.type?.toUpperCase()}</span>
                    <span className="notification-time">{n?.time ? new Date(n.time).toLocaleString() : '-'}</span>
                  </div>
                  <p className="notification-message">{n?.message}</p>
                  <span className="notification-sent">{n?.sent ? '✓ Delivered' : '✗ Not delivered'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'admin' && user?.role === 'admin' && (
        <div className="admin-panel">
          <h2>{t.adminPanel}</h2>
          {adminError && <div className="error-banner">⚠️ {adminError}</div>}
          
          <div className="admin-section">
            <h3>👥 {t.users}</h3>
            <button onClick={() => setAddUserModal(true)} className="refresh-btn" style={{background: '#4caf50', marginBottom: '16px'}}>➕ {t.addUser}</button>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.username}</th>
                  <th>{t.role}</th>
                  <th>Unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {safeArray(usersList).map((u, i) => (
                  <tr key={i}>
                    <td>{u?.username || '-'}</td>
                    <td>{u?.role || '-'}</td>
                    <td>{u?.unit_id || 'All'}</td>
                    <td>
                      <button 
                        onClick={() => deleteUser(u?.username)} 
                        className="delete-btn"
                        disabled={u?.username === user?.username}
                        title={u?.username === user?.username ? "Cannot delete yourself" : "Delete user"}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {safeArray(usersList).length === 0 && (
                  <tr><td colSpan="4" style={{textAlign: 'center'}}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-section">
            <h3>📍 {t.units}</h3>
            <button onClick={() => setAddUnitModal(true)} className="refresh-btn" style={{background: '#4caf50', marginBottom: '16px'}}>➕ {t.addUnit}</button>
            <div className="units-list">
              {safeArray(units).map(u => (
                <div key={u?.unit_id || Math.random()} className="unit-card">
                  <h4>{u?.name || u?.unit_id || 'Unknown'}</h4>
                  <p>{u?.location || 'No location'}</p>
                  <span className={`status-badge ${deviceStatus[u?.unit_id]?.status === 'live' ? 'live' : 'offline'}`}>
                    {deviceStatus[u?.unit_id]?.status === 'live' ? t.live : t.offline}
                  </span>
                  {maintenanceStatus[u?.unit_id]?.active && <span className="maintenance-badge-small">🔧 {t.maintenance}</span>}
                  <button 
                    onClick={() => deleteUnit(u?.unit_id)} 
                    className="delete-btn-unit"
                    title="Delete unit"
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))}
              {safeArray(units).length === 0 && <p>No units found</p>}
            </div>
          </div>

          <div className="admin-section">
            <h3>📋 {t.loginHistory}</h3>
            <button onClick={fetchLoginHistory} className="refresh-btn">🔄 {t.refresh}</button>
            <table className="admin-table">
              <thead><tr><th>{t.username}</th><th>{t.role}</th><th>IP</th><th>{t.time}</th></tr></thead>
              <tbody>
                {safeArray(loginHistory).map((h, i) => (
                  <tr key={i}>
                    <td>{h?.username || '-'}</td>
                    <td>{h?.role || '-'}</td>
                    <td>{h?.ip || '-'}</td>
                    <td>{h?.time ? new Date(h.time).toLocaleString() : '-'}</td>
                  </tr>
                ))}
                {safeArray(loginHistory).length === 0 && <tr><td colSpan="4" style={{textAlign: 'center'}}>No login history</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="admin-section">
            <h3>🔧 Maintenance Status</h3>
            <div className="maintenance-overview">
              {Object.entries(safeObject(maintenanceStatus)).map(([unitId, status]) => (
                status?.active && (
                  <div key={unitId} className="maintenance-card">
                    <h4>{unitId}</h4>
                    <p>By: {status?.startedBy || 'Unknown'}</p>
                    <p>Reason: {status?.reason || 'N/A'}</p>
                    <p>Since: {status?.startedAt ? new Date(status.startedAt).toLocaleString() : 'Unknown'}</p>
                  </div>
                )
              ))}
              {Object.values(safeObject(maintenanceStatus)).every(s => !s?.active) && <p>No units under maintenance</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="settings-panel">
          <h2>⚙️ {t.settings}</h2>
          <div className="setting-item">
            <label>{t.darkMode}</label>
            <button onClick={() => setDarkMode(!darkMode)}>{darkMode ? '☀️ ' + t.lightMode : '🌙 ' + t.darkMode}</button>
          </div>
          <div className="setting-item">
            <label>{t.language}</label>
            <button onClick={() => setLang(lang === 'en' ? 'tl' : 'en')}>{lang === 'en' ? '🇵🇭 ' + t.tagalog : '🇺🇸 ' + t.english}</button>
          </div>
          <div className="setting-item">
            <label>{t.voiceAlert}</label>
            <button onClick={() => setVoiceAlert(!voiceAlert)} className={voiceAlert ? 'active' : ''}>{voiceAlert ? '🔊 ON' : '🔇 OFF'}</button>
          </div>
          <div className="setting-item">
            <label>Push Notifications</label>
            <button onClick={togglePush} className={pushEnabled ? 'active' : ''}>{pushEnabled ? t.disablePush : t.enablePush}</button>
          </div>
          <button onClick={() => setActiveTab('dashboard')} className="back-btn">← Back to Dashboard</button>
        </div>
      )}

      {maintenanceModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>🔧 {t.startMaintenance}</h3>
            <p>Unit: <strong>{selectedUnit}</strong></p>
            <label>{t.maintenanceNote}</label>
            <textarea value={maintenanceReason} onChange={e => setMaintenanceReason(e.target.value)} placeholder="e.g., Cleaning debris, Repairing pipe..." rows={3} />
            <div className="modal-buttons">
              <button onClick={() => setMaintenanceModal(false)} className="cancel-btn">{t.cancel}</button>
              <button onClick={startMaintenance} className="confirm-btn">{t.confirm}</button>
            </div>
          </div>
        </div>
      )}

      {addUserModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>➕ {t.addUser}</h3>
            <input placeholder={t.username} value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
            <input type="password" placeholder={t.password} value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
            <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input placeholder="Unit ID (optional)" value={newUser.unit_id} onChange={e => setNewUser({...newUser, unit_id: e.target.value})} />
            <div className="modal-buttons">
              <button onClick={() => setAddUserModal(false)} className="cancel-btn">{t.cancel}</button>
              <button onClick={createUser} className="confirm-btn">{t.confirm}</button>
            </div>
          </div>
        </div>
      )}

      {addUnitModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>➕ {t.addUnit}</h3>
            <input placeholder="Unit ID (e.g., drainage_2)" value={newUnit.unit_id} onChange={e => setNewUnit({...newUnit, unit_id: e.target.value})} />
            <input placeholder="Name (e.g., Drainage 2)" value={newUnit.name} onChange={e => setNewUnit({...newUnit, name: e.target.value})} />
            <input placeholder="Location (e.g., Second Street)" value={newUnit.location} onChange={e => setNewUnit({...newUnit, location: e.target.value})} />
            <div className="modal-buttons">
              <button onClick={() => setAddUnitModal(false)} className="cancel-btn">{t.cancel}</button>
              <button onClick={createUnit} className="confirm-btn">{t.confirm}</button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>Smart Drainage System | {user?.username} ({user?.role}) | {new Date().toLocaleDateString()}</p>
      </footer>
    </div>
  );
}

export default App;