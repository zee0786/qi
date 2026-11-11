let currentUserId = null;

export const OUTCOMES = ['Scratch', 'Dent', 'Paint Issue', 'Missing Component', 'No Defect'];

export function setCurrentUser(id) {
  currentUserId = id;
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (currentUserId) headers['X-User-Id'] = String(currentUserId);
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  users: () => request('/api/users'),
  batches: () => request('/api/batches'),
  classify: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/api/classify', { method: 'POST', body: form });
  },
  createInspection: (payload) => request('/api/inspections', json(payload)),
  inspections: ({ defectType, batchId } = {}) => {
    const params = new URLSearchParams();
    if (defectType) params.set('defectType', defectType);
    if (batchId) params.set('batchId', batchId);
    return request(`/api/inspections?${params}`);
  },
  dashboard: (batchId) => request(`/api/dashboard${batchId ? `?batchId=${batchId}` : ''}`),
};

export const formatPercent = (value) => (value === null ? '—' : `${value}%`);
export const formatTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
