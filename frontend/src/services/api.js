import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.message || error.message || 'Something went wrong. Please try again.';
    return Promise.reject(new Error(message));
  }
);

export async function getHealth() {
  const { data } = await api.get('/health');
  return data.data;
}

export async function getTrackers() {
  const { data } = await api.get('/trackers?limit=50');
  return data.data;
}

export async function getSnapshots(id) {
  const { data } = await api.get(`/trackers/${id}/snapshots`);
  return data.data;
}

export async function getAttempts(id) {
  const { data } = await api.get(`/trackers/${id}/attempts`);
  return data.data;
}

export async function createTracker(payload) {
  const { data } = await api.post('/trackers', payload);
  return data.data;
}

export async function trackerAction(id, action) {
  const { data } = await api.post(`/trackers/${id}/${action}`);
  return data.data;
}

export async function addManualObservation(id, payload) {
  const { data } = await api.post(`/trackers/${id}/manual-observation`, payload);
  return data.data;
}

export function downloadCsv(id) {
  return api.get(`/trackers/${id}/export`, { responseType: 'blob' }).then(({ data }) => {
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ticketstracker-${id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}

export default api;
