import { useEffect } from 'react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import { useActionStore, ActionId } from './actions';
import { useProjectStore } from '../store/projectStore';

export interface Command {
  id: string;
  label: string;
  /** Zusätzliche Suchwörter */
  keywords?: string;
  /** Anzeige des Kürzels */
  shortcut?: string;
  /** Einzelne Taste (greift nicht in Textfeldern) */
  key?: string;
  /** Strg+Taste (greift auch in Textfeldern) */
  ctrlKey?: string;
  /** Seitenaktion; der Befehl erscheint nur, wenn die aktuelle Seite sie anmeldet */
  action?: ActionId;
  /** Befehl braucht ein gewähltes Projekt */
  needsProject?: boolean;
  /** Fest eingebaute Aktion (ohne Seite) */
  run?: (ctx: { navigate: NavigateFunction; projectId?: string }) => void;
}

/** Reihenfolge = Reihenfolge im Feld ohne Eingabe. */
export const COMMANDS: Command[] = [
  { id: 'new-item', label: 'Neue Anforderung', keywords: 'anlegen erstellen', shortcut: 'N', key: 'n', action: 'new-item' },
  { id: 'save', label: 'Speichern', shortcut: 'Strg S', ctrlKey: 's', action: 'save' },
  { id: 'review', label: 'Review', keywords: 'prüfen freigeben', shortcut: 'R', key: 'r', action: 'review' },
  { id: 'view-table', label: 'Zur Tabelle', keywords: 'ansicht excel', shortcut: 'T', key: 't', action: 'view-table' },
  { id: 'view-list', label: 'Zur Liste', keywords: 'ansicht editor', shortcut: 'L', key: 'l', action: 'view-list' },
  {
    id: 'graph', label: 'Graph öffnen', keywords: 'traceability verknüpfungen', shortcut: 'G', key: 'g', needsProject: true,
    run: ({ navigate, projectId }) => navigate(`/traceability/${projectId}`),
  },
  { id: 'import', label: 'Importieren', keywords: 'excel datei laden', shortcut: 'I', key: 'i', action: 'import' },
  { id: 'export', label: 'Exportieren', keywords: 'excel herunterladen', shortcut: 'E', key: 'e', action: 'export' },
  { id: 'switch-project', label: 'Projekt wechseln', keywords: 'projekte übersicht', shortcut: 'P', key: 'p', run: ({ navigate }) => navigate('/') },
  {
    id: 'setup', label: 'Projekt einrichten', keywords: 'dokumentenstruktur dokumente', shortcut: 'D', key: 'd', needsProject: true,
    run: ({ navigate, projectId }) => navigate(`/document-structure/${projectId}`),
  },
  { id: 'help', label: 'Hilfe', keywords: 'anleitung', shortcut: 'F1', key: 'F1', run: ({ navigate }) => navigate('/help') },
  { id: 'ask', label: 'Frag ReqMan', keywords: 'assistent fragen', shortcut: 'F', key: 'f', run: () => undefined },
];

/** Gibt es den Befehl auf der aktuellen Seite? */
export function isAvailable(c: Command, handlers: Record<string, unknown>, projectId?: string) {
  if (c.needsProject && !projectId) return false;
  if (c.action) return !!handlers[c.action];
  if (c.id === 'ask') return !!handlers['ask'];
  return true;
}

/** Kürzel für Tooltips der Knöpfe, z. B. `title={withShortcut('Neue Anforderung', 'new-item')}`. */
export function withShortcut(title: string, id: string) {
  const c = COMMANDS.find((x) => x.id === id);
  return c?.shortcut ? `${title} (${c.shortcut})` : title;
}

function inTextField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Führt einen Befehl aus. `ask` läuft über die angemeldete Aktion des Assistenten. */
export function runCommand(c: Command, navigate: NavigateFunction, projectId?: string) {
  const handlers = useActionStore.getState().handlers as Record<string, (() => void) | undefined>;
  if (c.action) handlers[c.action]?.();
  else if (c.id === 'ask') handlers['ask']?.();
  else c.run?.({ navigate, projectId });
}

/** Globale Tastenkürzel (einmal im Layout). Einzelne Tasten gelten nicht in Textfeldern. */
export function useCommandShortcuts() {
  const navigate = useNavigate();
  const projectId = useProjectStore((s) => s.currentProject?.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const handlers = useActionStore.getState().handlers as Record<string, unknown>;
      const ctrl = e.ctrlKey || e.metaKey;
      let hit: Command | undefined;
      if (ctrl && !e.altKey && !e.shiftKey) {
        hit = COMMANDS.find((c) => c.ctrlKey === e.key.toLowerCase());
      } else if (!ctrl && !e.altKey && (!inTextField(e.target) || /^F\d+$/.test(e.key))) {
        hit = COMMANDS.find((c) => c.key === (e.key.length === 1 ? e.key.toLowerCase() : e.key));
      }
      if (!hit || !isAvailable(hit, handlers, projectId)) return;
      e.preventDefault();
      runCommand(hit, navigate, projectId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, projectId]);
}
