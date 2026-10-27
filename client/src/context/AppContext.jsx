import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
const Context = createContext(null);
export function AppProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(Boolean(sessionStorage.getItem('food2fit-token')));
  const [demo, setDemo] = useState(() => new URLSearchParams(location.search).has('preview') || sessionStorage.getItem('food2fit-preview') === 'true');
  const [dark, setDark] = useState(() => localStorage.getItem('food2fit-theme') === 'dark'), [toasts, setToasts] = useState([]);
  const timers = useRef([]);
  const notify = useCallback((message, type = 'success') => { const id = crypto.randomUUID(); setToasts(items => [...items.slice(-2), { id, message, type }]); timers.current.push(setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 5000)); }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { if (demo) sessionStorage.setItem('food2fit-preview', 'true'); }, [demo]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('food2fit-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { let current = true; if (!sessionStorage.getItem('food2fit-token')) { setLoading(false); return; } api.get('/auth/me').then(({ data }) => { if (current) setUser(data.user); }).catch(error => { if (error.response?.status === 401) sessionStorage.removeItem('food2fit-token'); if (current) notify('Please sign in to reconnect your account.', 'error'); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [notify]);
  const enterDemo = () => { sessionStorage.setItem('food2fit-preview', 'true'); setDemo(true); };
  const exitDemo = () => { sessionStorage.removeItem('food2fit-preview'); setDemo(false); };
  const authenticate = async (mode, input) => { const { data } = await api.post(`/auth/${mode}`, input); sessionStorage.setItem('food2fit-token', data.token); setUser(data.user); exitDemo(); };
  const logout = () => { sessionStorage.removeItem('food2fit-token'); setUser(null); exitDemo(); };
  return <Context.Provider value={{ user, loading, demo, dark, setDark, notify, enterDemo, exitDemo, authenticate, logout }}>{children}<div className="toast-stack" aria-live="polite">{toasts.map(item => <div key={item.id} className={`toast ${item.type}`} role={item.type === 'error' ? 'alert' : 'status'}>{item.message}<button aria-label="Dismiss notification" onClick={() => setToasts(items => items.filter(t => t.id !== item.id))}>×</button></div>)}</div></Context.Provider>;
}
export const useApp = () => useContext(Context);
