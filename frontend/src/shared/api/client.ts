import axios from 'axios';
import type { components, paths } from './schema';
import type {
  AiQualityResult,
  AttributeDefinition,
  DocumentType,
  Item,
  ProjectStructure,
  ReferenceWithStatus,
  SimulinkSidecar,
  User,
  ValidationCreateRequest,
  ValidationCreateResponse,
  ValidationReport,
  ValidationStatusInfo,
} from '../types';

// ── Typen aus dem OpenAPI-Schema (src/shared/api/schema.d.ts, `npm run generate:api`) ──────────

/** Alle Pydantic-Modelle des Backends, z. B. `Schemas['ItemResponse']`. */
export type Schemas = components['schemas'];

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

/** Antworttyp (200/201) eines Endpunkts, z. B. `ApiResponse<'/api/projects', 'get'>`. */
export type ApiResponse<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { responses: infer R }
    ? Json<R[200 & keyof R]> | Json<R[201 & keyof R]>
    : never;

/** Request-Body (JSON) eines Endpunkts, z. B. `ApiBody<'/api/projects', 'post'>`. */
export type ApiBody<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { requestBody?: infer B } ? Json<NonNullable<B>> : never;

// ── axios-Instanz ───────────────────────────────────────────────────────────────────────────

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

// Endpunkte, für die das Backend (noch) kein Response-Modell liefert, sind unten mit
// „ohne Response-Modell" markiert und nutzen handgeschriebene Typen (Folge-Issue #28).

// Auth
export const login = (username: string, password: string) => {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  return api.post<ApiResponse<'/api/auth/token', 'post'>>('/auth/token', form);
};

export const getMe = () => api.get<User>('/auth/me');

// Projects
export const listProjects = () => api.get<ApiResponse<'/api/projects', 'get'>>('/projects');
export const createProject = (data: ApiBody<'/api/projects', 'post'>) =>
  api.post<ApiResponse<'/api/projects', 'post'>>('/projects', data);
export const importProject = (data: ApiBody<'/api/projects/import', 'post'>) =>
  api.post<ApiResponse<'/api/projects/import', 'post'>>('/projects/import', data);
export const deleteProject = (id: string, deleteFiles = false) =>
  api.delete(`/projects/${id}?delete_files=${deleteFiles}`);
export const getProject = (id: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}', 'get'>>(`/projects/${id}`);

// Filesystem browser
export const browseFilesystem = (path?: string) =>
  api.get<ApiResponse<'/api/filesystem/browse', 'get'>>('/filesystem/browse', { params: path ? { path } : {} });

// Documents
export const listDocuments = (projectId: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/documents', 'get'>>(`/projects/${projectId}/documents`);
export const createDocument = (projectId: string, data: ApiBody<'/api/projects/{project_id}/documents', 'post'>) =>
  api.post<ApiResponse<'/api/projects/{project_id}/documents', 'post'>>(`/projects/${projectId}/documents`, data);
export const deleteDocument = (projectId: string, prefix: string) =>
  api.delete(`/projects/${projectId}/documents/${prefix}`);

// Items
export const listItems = (projectId: string, prefix: string) =>
  api.get<Item[]>(
    `/projects/${projectId}/documents/${prefix}/items`,
  );
export const createItem = (
  projectId: string,
  prefix: string,
  data: ApiBody<'/api/projects/{project_id}/documents/{prefix}/items', 'post'>,
) =>
  api.post<Item>(
    `/projects/${projectId}/documents/${prefix}/items`,
    data,
  );

// Tabellen-Import (Excel/CSV/Zwischenablage)
type ImportBase = `/api/projects/{project_id}/documents/{prefix}/import`;
const importUrl = (projectId: string, prefix: string) =>
  `/projects/${projectId}/documents/${encodeURIComponent(prefix)}/import`;
export type ImportCheck = ApiResponse<`${ImportBase}/validate`, 'post'>;
export const parseImportFile = (projectId: string, prefix: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<ApiResponse<`${ImportBase}/parse`, 'post'>>(`${importUrl(projectId, prefix)}/parse`, form);
};
export const validateImport = (projectId: string, prefix: string, rows: Record<string, string>[]) =>
  api.post<ImportCheck>(`${importUrl(projectId, prefix)}/validate`, { rows });
export const runImport = (projectId: string, prefix: string, rows: Record<string, string>[]) =>
  api.post<ApiResponse<ImportBase, 'post'>>(importUrl(projectId, prefix), { rows });

// Excel-Rückweg (U4): exportieren, in Excel bearbeiten, Änderungen geprüft zurückholen
type RoundtripBase = `/api/projects/{project_id}/roundtrip`;
export type RoundtripCompare = ApiResponse<`${RoundtripBase}/compare`, 'post'>;
const fileForm = (file: File) => { const f = new FormData(); f.append('file', file); return f; };
export const exportForExcel = (projectId: string, prefix: string) =>
  api.get<Blob>(`/projects/${projectId}/roundtrip/export/${encodeURIComponent(prefix)}`, { responseType: 'blob' });
export const detectRoundtrip = (projectId: string, file: File) =>
  api.post<ApiResponse<`${RoundtripBase}/detect`, 'post'>>(`/projects/${projectId}/roundtrip/detect`, fileForm(file));
export const compareRoundtrip = (projectId: string, file: File) =>
  api.post<RoundtripCompare>(`/projects/${projectId}/roundtrip/compare`, fileForm(file));
export const applyRoundtrip = (projectId: string, file: File, uids: string[], newRows: number[]) => {
  const form = fileForm(file);
  form.append('selection', JSON.stringify({ uids, new_rows: newRows }));
  return api.post<ApiResponse<`${RoundtripBase}/apply`, 'post'>>(`/projects/${projectId}/roundtrip/apply`, form);
};

export const getItem = (projectId: string, uid: string) =>
  api.get<Item>(`/projects/${projectId}/items/${uid}`);
export const updateItem = (projectId: string, uid: string, data: ApiBody<'/api/projects/{project_id}/items/{uid}', 'put'>) =>
  api.put<Item>(`/projects/${projectId}/items/${uid}`, data);
export const deleteItem = (projectId: string, uid: string) =>
  api.delete(`/projects/${projectId}/items/${uid}`);
export const getItemCommits = (projectId: string, uid: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/items/{uid}/commits', 'get'>>(
    `/projects/${projectId}/items/${uid}/commits`,
  );

// Links
export const addLink = (projectId: string, sourceUid: string, targetUid: string) =>
  api.post<Item>(
    `/projects/${projectId}/items/${sourceUid}/links`,
    { target_uid: targetUid } satisfies ApiBody<'/api/projects/{project_id}/items/{uid}/links', 'post'>,
  );
export const removeLink = (projectId: string, sourceUid: string, targetUid: string) =>
  api.delete<Item>(
    `/projects/${projectId}/items/${sourceUid}/links/${targetUid}`,
  );

// Bedeutungssuche (RAG, A1) – Ähnliche, Link-Vorschläge, Auswirkungen, Suche
export type RagHit = Schemas['RagHit'];
export type LinkSuggestionsResult = Schemas['LinkSuggestions'];
export type ImpactResult = Schemas['ImpactResult'];
export const ragSearch = (projectId: string, q: string, k = 8, prefixes?: string[]) =>
  api.get<ApiResponse<'/api/projects/{project_id}/rag/search', 'get'>>(`/projects/${projectId}/rag/search`, {
    params: { q, k, prefix: prefixes },
    paramsSerializer: { indexes: null },
  });
export const ragSimilarText = (projectId: string, body: ApiBody<'/api/projects/{project_id}/rag/similar-text', 'post'>) =>
  api.post<ApiResponse<'/api/projects/{project_id}/rag/similar-text', 'post'>>(
    `/projects/${projectId}/rag/similar-text`, body);
export const getLinkSuggestions = (projectId: string, uid: string, k = 8) =>
  api.get<LinkSuggestionsResult>(`/projects/${projectId}/items/${uid}/link-suggestions`, { params: { k } });
export const getImpact = (projectId: string, uid: string) =>
  api.get<ImpactResult>(`/projects/${projectId}/items/${uid}/impact`);

// Vorschläge (A6) – Agenten/Assistent schlagen vor, ein Mensch übernimmt oder lehnt ab
export type Proposal = Schemas['ProposalResponse'];
export const listProposals = (projectId: string, params?: { status?: string; uid?: string }) =>
  api.get<Proposal[]>(`/projects/${projectId}/proposals`, { params });
export const getProposalCount = (projectId: string) =>
  api.get<Schemas['ProposalCount']>(`/projects/${projectId}/proposals/count`);
export const acceptProposal = (projectId: string, id: number) =>
  api.post<Proposal>(`/projects/${projectId}/proposals/${id}/accept`);
export const rejectProposal = (projectId: string, id: number) =>
  api.post<Proposal>(`/projects/${projectId}/proposals/${id}/reject`);

// Rückmeldung zu KI-Befunden (L2) – „trifft zu“ / „trifft nicht zu“, speist den Fallspeicher
export type FindingFeedback = Schemas['FeedbackResponse'];
export type FindingVerdict = 'applies' | 'not_applies';
export const listFindingFeedback = (projectId: string, params?: { uid?: string; only_mine?: boolean }) =>
  api.get<FindingFeedback[]>(`/projects/${projectId}/finding-feedback`, { params });
export const sendFindingFeedback = (
  projectId: string,
  body: { uid: string; category: string; finding: string; verdict: FindingVerdict },
) => api.post<FindingFeedback>(`/projects/${projectId}/finding-feedback`, body);
export const deleteFindingFeedback = (projectId: string, id: number) =>
  api.delete(`/projects/${projectId}/finding-feedback/${id}`);
// Brücken (B1) – Projekt als Obsidian-Ordner ausliefern (Markdown, .base, .canvas)
export type ObsidianExport = Schemas['ObsidianExport'];
export type ObsidianStatus = Schemas['ObsidianStatus'];
export const exportToObsidian = (projectId: string) =>
  api.post<ObsidianExport>(`/projects/${projectId}/obsidian/export`);
export type ObsidianImport = Schemas['ObsidianImport'];
export const importFromObsidian = (projectId: string) =>
  api.post<ObsidianImport>(`/projects/${projectId}/obsidian/import-changes`);
export const getObsidianStatus = (projectId: string) =>
  api.get<ObsidianStatus>(`/projects/${projectId}/obsidian/status`);

// „Frag ReqMan“ (A4) – Assistent mit Quellen, Hilfe-Suche, offene Punkte
export type AssistantAnswer = Schemas['AssistantAnswer'];
export type AssistantSource = Schemas['AssistantSource'];
export type NextStep = Schemas['NextStep'];
export const askAssistant = (body: ApiBody<'/api/assistant/ask', 'post'>) =>
  api.post<ApiResponse<'/api/assistant/ask', 'post'>>('/assistant/ask', body, { timeout: 120_000 });
export const searchHelp = (q: string, k = 5) =>
  api.get<ApiResponse<'/api/help/search', 'get'>>('/help/search', { params: { q, k } });
export const getNextSteps = (projectId: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/next-steps', 'get'>>(`/projects/${projectId}/next-steps`);

// Review (doorstop stamp)
export const reviewItem = (projectId: string, uid: string) =>
  api.post<Item>(
    `/projects/${projectId}/items/${uid}/review`,
  );

// Traceability
export const getTraceability = (projectId: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/traceability', 'get'>>(`/projects/${projectId}/traceability`);

// Metrics
export const getMetrics = (projectId: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/metrics', 'get'>>(`/projects/${projectId}/metrics`);

// Attributes
export const getAttributes = () => api.get<AttributeDefinition[]>('/attributes');
export const updateAttributes = (data: ApiBody<'/api/attributes', 'put'>) => api.put('/attributes', data);

// Users
export const listUsers = () => api.get<User[]>('/users');
export const createUser = (data: ApiBody<'/api/users', 'post'>) =>
  api.post<User>('/users', data);
export const updateUser = (id: number, data: ApiBody<'/api/users/{user_id}', 'put'>) =>
  api.put<User>(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

// Validation (Konzept 2)
export const createValidation = (
  projectId: string,
  uid: string,
  data: ValidationCreateRequest,
) =>
  api.post<ValidationCreateResponse>(
    `/projects/${projectId}/items/${uid}/validate`,
    data,
  );
export const getLatestValidation = (projectId: string, uid: string) =>
  api.get<ValidationStatusInfo>(
    `/projects/${projectId}/items/${uid}/validations/latest`,
  );
/** Ohne Response-Modell (Backend liefert `list[dict]`). */
export const getValidationHistory = (projectId: string, uid: string) =>
  api.get<ValidationReport[]>(`/projects/${projectId}/items/${uid}/validations`);
/** Ohne Response-Modell (Backend liefert `list[dict]`). */
export const getAllValidations = (projectId: string) =>
  api.get<ValidationReport[]>(`/projects/${projectId}/validations`);
/** Ohne Response-Modell (Backend liefert `list[dict]`). */
export const getGitLog = (projectId: string, maxCount = 50) =>
  api.get<Record<string, unknown>[]>(`/projects/${projectId}/git/log?max_count=${maxCount}`);
/** Ohne Response-Modell. */
export const getGitStatus = (projectId: string) =>
  api.get<Record<string, unknown>>(`/projects/${projectId}/git/status`);

// Local file references (kein Upload – Datei bleibt am Originalort)
// Ohne Response-Modell – Typen von Hand gepflegt.
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
export const checkLocalFiles = (items: ApiBody<'/api/localfile/check', 'post'>) =>
  api.post<LocalFileCheckResult[]>('/localfile/check', items);

/** URL zum Einbetten einer lokalen Datei als img.src */
export const localFileUrl = (path: string, hash: string) =>
  `/api/localfile?path=${encodeURIComponent(path)}&h=${encodeURIComponent(hash)}`;

// References (doorstop `references`-Feld)

/** Gibt die gespeicherten Referenzen eines Items zurück. */
export const getReferences = (projectId: string, uid: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/items/{uid}/references', 'get'>>(
    `/projects/${projectId}/items/${uid}/references`,
  );

/** Speichert eine neue Referenzliste; SHA256 wird serverseitig berechnet. */
export const updateReferences = (
  projectId: string,
  uid: string,
  refs: ApiBody<'/api/projects/{project_id}/items/{uid}/references', 'put'>,
) =>
  api.put<ApiResponse<'/api/projects/{project_id}/items/{uid}/references', 'put'>>(
    `/projects/${projectId}/items/${uid}/references`,
    refs,
  );

/** Prüft den SHA256-Status aller Referenzen (ok / changed / missing / no_hash). */
export const checkReferences = (projectId: string, uid: string) =>
  api.post<ReferenceWithStatus[]>(
    `/projects/${projectId}/items/${uid}/references/check`,
  );

/** Berechnet SHA256 für alle Referenzen neu und speichert das Ergebnis. */
export const refreshReferenceHashes = (projectId: string, uid: string) =>
  api.post<ApiResponse<'/api/projects/{project_id}/items/{uid}/references/refresh', 'post'>>(
    `/projects/${projectId}/items/${uid}/references/refresh`,
  );

// Document Types
export const listDocumentTypes = () =>
  api.get<DocumentType[]>('/document-types');
export const createDocumentType = (data: ApiBody<'/api/document-types', 'post'>) =>
  api.post<DocumentType>('/document-types', data);
export const updateDocumentType = (id: string, data: ApiBody<'/api/document-types/{type_id}', 'put'>) =>
  api.put<DocumentType>(`/document-types/${id}`, data);
export const deleteDocumentType = (id: string) =>
  api.delete(`/document-types/${id}`);

// Project Structure
export const getProjectStructure = (projectId: string) =>
  api.get<ProjectStructure>(`/projects/${projectId}/structure`);
export const assignDocumentType = (projectId: string, prefix: string, typeId: string | null) =>
  api.put(`/projects/${projectId}/documents/${prefix}/type`, {
    document_type_id: typeId,
  } satisfies ApiBody<'/api/projects/{project_id}/documents/{prefix}/type', 'put'>);
export const updateDocumentProperties = (projectId: string, prefix: string, values: Record<string, string>) =>
  api.put(`/projects/${projectId}/documents/${encodeURIComponent(prefix)}/properties`, {
    values,
  } satisfies ApiBody<'/api/projects/{project_id}/documents/{prefix}/properties', 'put'>);

// Export
export type ExportFormat = 'csv' | 'tsv' | 'xlsx' | 'yaml';

/** Löst einen Browser-Download für ein einzelnes Dokument aus. */
export const exportDocument = (projectId: string, prefix: string, format: ExportFormat = 'xlsx') => {
  const token = localStorage.getItem('token');
  const url = `/api/projects/${projectId}/documents/${encodeURIComponent(prefix)}/export?format=${format}`;
  const a = document.createElement('a');
  a.href = url;
  // Token über fetch + Blob-URL (CORS-konform, Auth-Header mitschicken)
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Export fehlgeschlagen: ${res.statusText}`);
      return res.blob();
    })
    .then((blob) => {
      const ext = format === 'yaml' ? 'yml' : format;
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `${prefix}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    });
};

/** Gesetztes Lastenheft als PDF (Typst); ohne `document` das ganze Projekt. */
export const exportPdf = async (projectId: string, document?: string) => {
  const token = localStorage.getItem('token');
  const qs = document ? `?document=${encodeURIComponent(document)}` : '';
  const res = await fetch(`/api/projects/${projectId}/export/pdf${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* keine JSON-Antwort */ }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = objectUrl;
  a.download = `${document ?? 'Lastenheft'}.pdf`;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
};

/** Löst einen Browser-Download für das gesamte Projekt (ZIP) aus. */
export const exportProject = (projectId: string, projectName: string, format: ExportFormat = 'xlsx') => {
  const token = localStorage.getItem('token');
  const url = `/api/projects/${projectId}/export?format=${format}`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Export fehlgeschlagen: ${res.statusText}`);
      return res.blob();
    })
    .then((blob) => {
      const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${safeName}_export_${format}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    });
};

// KI-Qualitätsprüfung
export const triggerAiQuality = (
  projectId: string,
  uid: string,
  data: ApiBody<'/api/projects/{project_id}/items/{uid}/ai-quality', 'post'> = {},
) =>
  api.post<AiQualityResult>(
    `/projects/${projectId}/items/${uid}/ai-quality`,
    data,
  );

export const getAiQuality = (projectId: string, uid: string) =>
  api.get<AiQualityResult>(
    `/projects/${projectId}/items/${uid}/ai-quality`,
  );

/** Ohne Response-Modell (Backend liefert `dict`). */
export const triggerAiQualityBatch = (
  projectId: string,
  prefix: string,
  data: ApiBody<'/api/projects/{project_id}/documents/{prefix}/ai-quality-batch', 'post'> = {},
) => api.post<Record<string, unknown>>(`/projects/${projectId}/documents/${prefix}/ai-quality-batch`, data);

export const getAiQualityProfiles = () =>
  api.get<ApiResponse<'/api/ai-quality/profiles', 'get'>>('/ai-quality/profiles');

/** Ohne Response-Modell (Backend liefert `dict`). */
export const getAiQualitySettings = () =>
  api.get<{ api_key_configured: boolean; default_model: string; default_profile: string; available_profiles: string[] }>('/ai-quality/settings');

// Simulink Traceability
export const importSimulinkTrace = (projectId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ApiResponse<'/api/projects/{project_id}/simulink/import', 'post'>>(
    `/projects/${projectId}/simulink/import`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

export const getSimulinkLinks = (projectId: string, uid: string) =>
  api.get<SimulinkSidecar>(
    `/projects/${projectId}/items/${uid}/simulink-links`,
  );

export const getSimulinkCoverage = (projectId: string) =>
  api.get<ApiResponse<'/api/projects/{project_id}/simulink/coverage', 'get'>>(`/projects/${projectId}/simulink/coverage`);

/** Ohne Response-Modell (Backend liefert `dict`). */
export const deleteSimulinkLinks = (projectId: string) =>
  api.delete<{ deleted: number; message: string }>(`/projects/${projectId}/simulink/links`);

// PlantUML
export const renderPlantUML = (source: string) =>
  api.post<ApiResponse<'/api/plantuml/render', 'post'>>('/plantuml/render', {
    source,
  } satisfies ApiBody<'/api/plantuml/render', 'post'>);

// Uploads
/** Ohne Response-Modell. */
export const uploadImage = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post<{ url: string; filename: string; original_name: string; size: number }>("/uploads", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
