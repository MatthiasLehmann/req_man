import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const login = (username: string, password: string) => {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  return api.post('/auth/token', form);
};

export const getMe = () => api.get('/auth/me');

// Projects
export const listProjects = () => api.get('/projects');
export const createProject = (data: { name: string; description?: string }) =>
  api.post('/projects', data);
export const getProject = (id: string) => api.get(`/projects/${id}`);

// Documents
export const listDocuments = (projectId: string) =>
  api.get(`/projects/${projectId}/documents`);
export const createDocument = (projectId: string, data: { prefix: string; parent?: string; sep?: string }) =>
  api.post(`/projects/${projectId}/documents`, data);
export const deleteDocument = (projectId: string, prefix: string) =>
  api.delete(`/projects/${projectId}/documents/${prefix}`);

// Items
export const listItems = (projectId: string, prefix: string) =>
  api.get(`/projects/${projectId}/documents/${prefix}/items`);
export const createItem = (projectId: string, prefix: string, data: object) =>
  api.post(`/projects/${projectId}/documents/${prefix}/items`, data);
export const getItem = (projectId: string, uid: string) =>
  api.get(`/projects/${projectId}/items/${uid}`);
export const updateItem = (projectId: string, uid: string, data: object) =>
  api.put(`/projects/${projectId}/items/${uid}`, data);
export const deleteItem = (projectId: string, uid: string) =>
  api.delete(`/projects/${projectId}/items/${uid}`);

// Traceability
export const getTraceability = (projectId: string) =>
  api.get(`/projects/${projectId}/traceability`);

// Metrics
export const getMetrics = (projectId: string) =>
  api.get(`/projects/${projectId}/metrics`);

// Attributes
export const getAttributes = () => api.get('/attributes');
export const updateAttributes = (data: object[]) => api.put('/attributes', data);

// Users
export const listUsers = () => api.get('/users');
export const createUser = (data: object) => api.post('/users', data);
export const updateUser = (id: number, data: object) => api.put(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);
