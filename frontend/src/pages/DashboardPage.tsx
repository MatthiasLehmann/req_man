import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, FolderOpen, FileText, ChevronRight, Loader2, X,
  FolderInput, Trash2, AlertTriangle, FolderSearch, ArrowLeft,
  Folder,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { listProjects, createProject, importProject, deleteProject, browseFilesystem } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import { Project } from '../types';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function emptyCreate() {
  return { name: '', description: '', path: '' };
}
function emptyImport() {
  return { path: '', name: '', description: '' };
}

// ─── Modal: Ordner-Browser ────────────────────────────────────────────────────

function FolderBrowserModal({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [browsePath, setBrowsePath] = useState(initialPath || '~');

  const { data, isLoading, error } = useQuery({
    queryKey: ['filesystem', browsePath],
    queryFn: () => browseFilesystem(browsePath),
  });

  const result = data?.data;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '70vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FolderSearch className="w-5 h-5 text-primary-600" />
            Ordner auswählen
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aktueller Pfad */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <p className="font-mono text-xs text-gray-600 break-all">{result?.current ?? browsePath}</p>
        </div>

        {/* Verzeichnisliste */}
        <div className="overflow-y-auto flex-1 px-2 py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade...
            </div>
          )}
          {error && (
            <p className="text-xs text-red-500 px-4 py-2">Fehler beim Laden</p>
          )}
          {result && (
            <ul>
              {/* ".." Zurück-Eintrag */}
              {result.parent && (
                <li>
                  <button
                    onClick={() => setBrowsePath(result.parent!)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span className="font-mono text-xs truncate">..</span>
                  </button>
                </li>
              )}
              {result.entries
                .filter((e: any) => e.is_dir)
                .map((entry: any) => (
                  <li key={entry.path}>
                    <button
                      onClick={() => setBrowsePath(entry.path)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-primary-50 transition-colors"
                    >
                      <Folder className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  </li>
                ))}
              {result.entries.filter((e: any) => e.is_dir).length === 0 && !result.parent && (
                <p className="text-xs text-gray-400 px-3 py-4 text-center">Keine Unterordner</p>
              )}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <button
            onClick={() => { onSelect(result?.current ?? browsePath); onClose(); }}
            className="btn-primary flex-1 justify-center"
            disabled={isLoading}
          >
            Diesen Ordner wählen
          </button>
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Projekt erstellen ─────────────────────────────────────────────────

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (p: Project) => void }) {
  const [form, setForm] = useState(emptyCreate);
  const [showBrowser, setShowBrowser] = useState(false);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createProject({ name: form.name, description: form.description, path: form.path }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projekt erstellt');
      onSuccess(res.data);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Fehler beim Erstellen');
    },
  });

  return (
    <>
    {showBrowser && (
      <FolderBrowserModal
        initialPath={form.path}
        onSelect={(p) => setForm({ ...form, path: p })}
        onClose={() => setShowBrowser(false)}
      />
    )}
    <Modal title="Neues Projekt erstellen" icon={<Plus className="w-5 h-5 text-primary-600" />} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name *">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="z.B. Fahrzeugsteuerung 2025"
            autoFocus
          />
        </Field>

        <Field
          label="Speicherpfad *"
          hint="Verzeichnis, in dem das Doorstop-Projekt angelegt wird. Wird automatisch erstellt."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono text-sm flex-1"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="/home/user/projekte/fahrzeugsteuerung"
            />
            <button
              type="button"
              onClick={() => setShowBrowser(true)}
              className="btn-secondary px-3 shrink-0"
              title="Ordner durchsuchen"
            >
              <FolderSearch className="w-4 h-4" />
            </button>
          </div>
        </Field>

        <Field label="Beschreibung">
          <textarea
            className="input resize-none"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Kurze Beschreibung..."
          />
        </Field>

        <ModalFooter
          onClose={onClose}
          onConfirm={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!form.name.trim() || !form.path.trim()}
          confirmLabel="Erstellen"
        />
      </div>
    </Modal>
    </>
  );
}

// ─── Modal: Projekt importieren ───────────────────────────────────────────────

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (p: Project) => void }) {
  const [form, setForm] = useState(emptyImport);
  const [showBrowser, setShowBrowser] = useState(false);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      importProject({ path: form.path, name: form.name || undefined, description: form.description }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projekt importiert');
      onSuccess(res.data);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Fehler beim Importieren');
    },
  });

  return (
    <>
    {showBrowser && (
      <FolderBrowserModal
        initialPath={form.path}
        onSelect={(p) => setForm({ ...form, path: p })}
        onClose={() => setShowBrowser(false)}
      />
    )}
    <Modal
      title="Bestehendes Projekt importieren"
      icon={<FolderInput className="w-5 h-5 text-emerald-600" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
          Geben Sie den Pfad zu einem bestehenden Doorstop-Projektverzeichnis an.
          Die Dateien werden <strong>nicht verändert</strong> – das Projekt wird nur registriert.
        </div>

        <Field
          label="Pfad zum Projektverzeichnis *"
          hint="Muss ein bestehendes Verzeichnis auf dem Server sein."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono text-sm flex-1"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              placeholder="/home/user/projekte/bestehendes-projekt"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowBrowser(true)}
              className="btn-secondary px-3 shrink-0"
              title="Ordner durchsuchen"
            >
              <FolderSearch className="w-4 h-4" />
            </button>
          </div>
        </Field>

        <Field label="Anzeigename" hint="Leer lassen, um den Verzeichnisnamen zu verwenden.">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="(Verzeichnisname)"
          />
        </Field>

        <Field label="Beschreibung">
          <textarea
            className="input resize-none"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Kurze Beschreibung..."
          />
        </Field>

        <ModalFooter
          onClose={onClose}
          onConfirm={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!form.path.trim()}
          confirmLabel="Importieren"
          confirmClass="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        />
      </div>
    </Modal>
    </>
  );
}

// ─── Modal: Projekt löschen ───────────────────────────────────────────────────

function DeleteModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [confirmed, setConfirmed] = useState('');
  const qc = useQueryClient();
  const { currentProject, setCurrentProject } = useProjectStore();

  const mutation = useMutation({
    mutationFn: () => deleteProject(project.id, deleteFiles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (currentProject?.id === project.id) setCurrentProject(null);
      toast.success('Projekt entfernt');
      onClose();
    },
    onError: () => toast.error('Fehler beim Entfernen'),
  });

  // Erstes Wort des Projektnamens als Bestätigungswort
  const confirmWord = project.name.trim().split(/\s+/)[0];
  const ready = confirmed === confirmWord;

  return (
    <Modal
      title="Projekt entfernen"
      icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Das Projekt <strong>„{project.name}"</strong> wird aus der Registry entfernt.
        </p>

        {/* Dateien löschen */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="mt-0.5 accent-red-600"
          />
          <span className="text-sm text-red-700">
            <strong>Dateien dauerhaft vom Dateisystem löschen</strong>
            <br />
            <span className="font-mono text-xs break-all">{project.path}</span>
            <br />
            <span className="text-xs opacity-75 mt-0.5 block">Dieser Vorgang kann nicht rückgängig gemacht werden.</span>
          </span>
        </label>

        {/* Bestätigung */}
        <Field label={`Zur Bestätigung das erste Wort eingeben: „${confirmWord}"`}>
          <input
            className="input"
            value={confirmed}
            onChange={(e) => setConfirmed(e.target.value)}
            placeholder={confirmWord}
          />
        </Field>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => mutation.mutate()}
            disabled={!ready || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                       bg-red-600 text-white text-sm font-medium
                       hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Entfernen...</>
              : <><Trash2 className="w-4 h-4" /> Endgültig entfernen</>}
          </button>
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Wiederverwendbare Bausteine ──────────────────────────────────────────────

function Modal({
  title, icon, onClose, children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {icon}{title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function ModalFooter({
  onClose, onConfirm, loading, disabled, confirmLabel,
  confirmClass = 'btn-primary flex-1 justify-center',
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  disabled: boolean;
  confirmLabel: string;
  confirmClass?: string;
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button onClick={onConfirm} disabled={disabled || loading} className={confirmClass}>
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> {confirmLabel}...</>
          : confirmLabel}
      </button>
      <button onClick={onClose} className="btn-secondary">Abbrechen</button>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

type ActiveModal = 'create' | 'import' | null;

export default function DashboardPage() {
  const { data: projectsRes, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });
  const projects: Project[] = projectsRes?.data || [];

  const [modal, setModal] = useState<ActiveModal>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const { setCurrentProject } = useProjectStore();
  const navigate = useNavigate();

  const openProject = (project: Project) => {
    setCurrentProject(project);
    navigate(`/requirements/${project.id}`);
  };

  const afterAction = (project: Project) => {
    setModal(null);
    setCurrentProject(project);
    navigate(`/requirements/${project.id}`);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projekte</h1>
          <p className="text-gray-500 text-sm mt-1">Requirements Management mit Doorstop</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('import')} className="btn-secondary">
            <FolderInput className="w-4 h-4" />
            Importieren
          </button>
          <button onClick={() => setModal('create')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Neues Projekt
          </button>
        </div>
      </div>

      {/* Modals */}
      {modal === 'create' && <CreateModal onClose={() => setModal(null)} onSuccess={afterAction} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} onSuccess={afterAction} />}
      {deleteTarget && <DeleteModal project={deleteTarget} onClose={() => setDeleteTarget(null)} />}

      {/* Projektliste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Noch keine Projekte</h3>
          <p className="text-gray-400 text-sm mb-6">
            Erstellen Sie ein neues Projekt oder importieren Sie ein bestehendes Doorstop-Verzeichnis.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setModal('import')} className="btn-secondary">
              <FolderInput className="w-4 h-4" />
              Importieren
            </button>
            <button onClick={() => setModal('create')} className="btn-primary">
              <Plus className="w-4 h-4" />
              Erstes Projekt erstellen
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card p-5 hover:border-primary-300 hover:shadow-md transition-all group relative"
            >
              {/* Löschen-Button – erscheint beim Hover */}
              <button
                onClick={() => setDeleteTarget(project)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300
                           hover:text-red-500 hover:bg-red-50 transition-colors
                           opacity-0 group-hover:opacity-100"
                title="Projekt entfernen"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Karte öffnet das Projekt */}
              <button onClick={() => openProject(project)} className="w-full text-left">
                <div className="flex items-center gap-3 pr-8">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">ID: {project.id}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-600 ml-auto shrink-0" />
                </div>

                {project.description && (
                  <p className="text-sm text-gray-500 mt-3 line-clamp-2 pr-8">{project.description}</p>
                )}

                <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono truncate">{project.path}</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
