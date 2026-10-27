import axios from 'axios';
const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const api = axios.create({ baseURL: `${base}/api`, timeout: 55000 });
api.interceptors.request.use(config => { const token = sessionStorage.getItem('food2fit-token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
export const messageOf = error => error.response?.data?.error?.message || (error.code === 'ERR_NETWORK' ? 'We couldn’t reach the server. Check your connection and try again.' : error.message || 'Something went wrong. Please try again.');
export const recipeApi = {
  generate: input => api.post('/recipes/generate', input), refine: input => api.post('/recipes/refine', input),
  detect: image => { const data = new FormData(); data.append('image', image); return api.post('/recipes/detect-ingredients', data); },
  save: recipeId => api.post('/recipes/save', { recipeId }), list: (type, page = 1) => api.get(`/recipes/${type}`, { params: { page, limit: 12 } }),
  remove: (type, id) => api.delete(`/recipes/${type === 'favorites' ? 'favorites/' : ''}${id}`),
};
export const fitnessApi = { profile: () => api.get('/fitness/profile'), saveProfile: (profile, exists) => api[exists ? 'put' : 'post']('/fitness/profile', profile), deleteProfile: () => api.delete('/fitness/profile'), generate: () => api.post('/fitness/generate-plan'), plan: () => api.get('/fitness/plan'), progress: () => api.get('/fitness/progress'), log: entry => api.post('/fitness/log-progress', entry) };
