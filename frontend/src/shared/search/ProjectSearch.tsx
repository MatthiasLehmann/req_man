import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import clsx from 'clsx';
import { ragSearch } from '../api/client';
import { useDebounced } from './useDebounced';
import { useOpenRequirement } from './openRequirement';
import { useActionStore } from './actions';
import { COMMANDS, isAvailable, runCommand, Command } from './commands';

type Row =
  | { kind: 'command'; command: Command }
  | { kind: 'hit'; uid: string; prefix: string; text: string };

/**
 * Befehlsfeld im Kopf (Strg+K): ohne Eingabe die Befehle der aktuellen Seite, mit Eingabe
 * Anforderungen (Suche nach Bedeutung im Projekt) und passende Befehle.
 */
export default function ProjectSearch({ projectId }: { projectId?: string }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const handlers = useActionStore((s) => s.handlers);
  const q = useDebounced(text.trim(), 400);
  const openRequirement = useOpenRequirement();

  const { data, isFetching, error } = useQuery({
    queryKey: ['rag-search', projectId, q],
    queryFn: async () => (await ragSearch(projectId!, q, 8)).data,
    enabled: !!projectId && q.length >= 3,
    staleTime: 30_000,
    retry: false,
  });
  const unavailable = (error as { response?: { status?: number } } | null)?.response?.status === 503;

  // Strg+K öffnet das Feld
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const rows: Row[] = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const cmds = COMMANDS.filter((c) => isAvailable(c, handlers, projectId))
      .filter((c) => !needle || `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(needle))
      .map((command): Row => ({ kind: 'command', command }));
    const hits: Row[] = q.length >= 3 && q === text.trim()
      ? (data ?? []).map((h) => ({ kind: 'hit', uid: h.uid, prefix: h.prefix, text: h.text }))
      : [];
    return [...hits, ...cmds];
  }, [text, q, data, handlers, projectId]);

  useEffect(() => setActive(0), [text, rows.length]);

  const close = () => { setOpen(false); setText(''); inputRef.current?.blur(); };
  const choose = (r: Row) => {
    close();
    if (r.kind === 'hit') { if (projectId) openRequirement(projectId, r.prefix, r.uid); }
    else runCommand(r.command, navigate, projectId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) choose(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div className="relative w-72" ref={boxRef}>
      <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
      <input
        ref={inputRef}
        className="input text-sm py-1 pl-8 pr-14 w-full"
        placeholder="Suchen oder Befehl …"
        title="Suchen oder Befehl ausführen (Strg K)"
        role="combobox"
        aria-expanded={open}
        aria-controls="befehlsfeld-liste"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {isFetching
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 absolute right-2.5 top-2.5" />
        : <kbd className="absolute right-2 top-1.5 text-[10px] text-gray-400 border border-gray-200 rounded px-1 py-0.5">Strg K</kbd>}
      {open && (
        <div id="befehlsfeld-liste" role="listbox" className="absolute z-50 mt-1 w-[28rem] max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {q.length >= 3 && unavailable && (
            <p className="p-3 text-xs text-gray-500">Suche nicht verfügbar (Embedding-Modell nicht erreichbar).</p>
          )}
          {rows.length === 0 && <p className="p-3 text-xs text-gray-500">Keine Treffer.</p>}
          {rows.map((r, i) => (
            <button
              key={r.kind === 'hit' ? `h-${r.uid}` : `c-${r.command.id}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              className={clsx('w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 flex items-center gap-2',
                i === active ? 'bg-primary-50' : 'hover:bg-gray-50')}
            >
              {r.kind === 'hit' ? (
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs font-semibold text-primary-600">{r.uid}</span>
                  <span className="block text-xs text-gray-600 line-clamp-2">{r.text}</span>
                </span>
              ) : (
                <>
                  <CornerDownLeft className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <span className="flex-1 text-sm text-gray-800">{r.command.label}</span>
                  {r.command.shortcut && (
                    <kbd className="text-[10px] text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50">{r.command.shortcut}</kbd>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
