import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import { Loading } from './components/UI';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import RecipeGenerator from './pages/RecipeGenerator';
import FitnessPlanner from './pages/FitnessPlanner';
import RecipeLibrary from './pages/RecipeLibrary';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
function Protected() { const { user, demo, loading } = useApp(); return loading ? <Loading /> : user || demo ? <Layout /> : <Navigate to="/login" replace />; }
export default function App() { return <BrowserRouter><AppProvider><a className="skip-link" href="#main-content">Skip to content</a><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Auth />} /><Route path="/register" element={<Auth register />} /><Route element={<Protected />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/recipes" element={<RecipeGenerator />} /><Route path="/fitness" element={<FitnessPlanner />} /><Route path="/favorites" element={<RecipeLibrary type="favorites" />} /><Route path="/history" element={<RecipeLibrary type="history" />} /><Route path="/profile" element={<Profile />} /></Route><Route path="*" element={<NotFound />} /></Routes></AppProvider></BrowserRouter>; }
