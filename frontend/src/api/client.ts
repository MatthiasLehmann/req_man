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
export const createProject = (data: { name: string; description?: string; path: string }) =>
  api.post('/projects', data);
export const importProject = (data: { path: string; name?: string; description?: string }) =>
  api.post('/projects/import', data);
export const deleteProject = (id: string, deleteFiles = false) =>
  api.delete(`/projects/${id}?delete_files=${deleteFiles}`);
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

// Links
export const addLink = (projectId: string, sourceUid: string, targetUid: string) =>
  api.post(`/projects/${projectId}/items/${sourceUid}/links`, { target_uid: targetUid });
export const removeLink = (projectId: string, sourceUid: string, targetUid: string) =>
  api.delete(`/projects/${projectId}/items/${sourceUid}/links/${targetUid}`);

// Review (doorstop stamp)
export const reviewItem = (projectId: string, uid: string) =>
  api.post(`/projects/${projectId}/items/${uid}/review`);

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

// Validation (Konzept 2)
export const createValidation = (projectId: string, uid: string, data: object) =>
  api.post(`/projects/${projectId}/items/${uid}/validate`, data);
export const getLatestValidation = (projectId: string, uid: string) =>
  api.get(`/projects/${projectId}/items/${uid}/validations/latest`);
export const getValidationHistory = (projectId: string, uid: string) =>
  api.get(`/projects/${projectId}/items/${uid}/validations`);
export const getAllValidations = (projectId: string) =>
  api.get(`/projects/${projectId}/validations`);
export const getGitLog = (projectId: string, maxCount = 50) =>
  api.get(`/projects/${projectId}/git/log?max_count=${maxCount}`);
export const getGitStatus = (projectId: string) =>
  api.get(`/projects/${projectId}/git/status`);

// Local file references (kein Upload – Datei bleibt am Originalort)
export interface LocalFileInfo {
  path: string;
  hash: string;
  size: number;
  name: string;
}

export interface LocalFileCheckResult {
  path: string;
  status: 'ok' | 'changed' | 'missing' | 'forbidden';
  current_hash?: string;
}

/** Öffnet nativen Dateidialog (Server-seitig), gibt Pfad + Hash zurück. */
export const pickLocalFile = () =>
  api.post<LocalFileInfo>('/localfile/pick');

/** Prüft mehrere lokale Bildreferenzen auf Änderungen. */
export const checkLocalFiles = (items: { path: string; hash: string }[]) =>
  api.post<LocalFileCheckResult[]>('/localfile/check', items);

/** URL zum Einbetten einer lokalen Datei als img.src */
export const localFileUrl = (path: string, hash: string) =>
  `/api/localfile?path=${encodeURIComponent(path)}&h=${encodeURIComponent(hash)}`;

// References (doorstop `references`-Feld)
import type { Reference, ReferenceWithStatus } from '../types';

/** Gibt die gespeicherten Referenzen eines Items zurück. */
export const getReferences = (projectId: string, uid: string) =>
  api.get<Reference[]>(`/projects/${projectId}/items/${uid}/references`);

/** Speichert eine neue Referenzliste; SHA256 wird serverseitig berechnet. */
export const updateReferences = (projectId: string, uid: string, refs: Reference[]) =>
  api.put<Reference[]>(`/projects/${projectId}/items/${uid}/references`, refs);

/** Prüft den SHA256-Status aller Referenzen (ok / changed / missing / no_hash). */
export const checkReferences = (projectId: string, uid: string) =>
  api.post<ReferenceWithStatus[]>(`/projects/${projectId}/items/${uid}/references/check`);

/** Berechnet SHA256 für alle Referenzen neu und speichert das Ergebnis. */
export const refreshReferenceHashes = (projectId: string, uid: string) =>
  api.post<Reference[]>(`/projects/${projectId}/items/${uid}/references/refresh`);

// PlantUML
export const renderPlantUML = (source: string) =>
  api.post<{ svg: string }>('/plantuml/render', { source });

// Uploads
export const uploadImage = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post<{ url: string; filename: string; original_name: string; size: number }>("/uploads", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
