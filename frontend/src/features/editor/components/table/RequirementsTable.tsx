import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, AlertCircle, CheckCircle, Circle, ExternalLink, Plus, FileSpreadsheet, X, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listItems, updateItem, createItem, getAttributes } from '../../../../shared/api/client';
import type { AttributeDefinition, Item } from '../../../../shared/types';
import { useAuthStore } from '../../../../shared/auth/authStore';
import ImportDialog from '../import/ImportDialog';
import { attributesFor, parseClipboardTable } from '../import/tableParsing';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const LEVEL_RE = /^\d+(\.\d+)*$/;

function compareLevel(a: string, b: string) {
  const la = a.split('.').map(Number);
  const lb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const d = (la[i] ?? 0) - (lb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function levelDepth(level: string) {
  const p = level.split('.');
  return Math.max(0, (p[p.length - 1] === '0' ? p.length - 1 : p.length) - 1);
}

/** Texte mit Bildern, Tabellen, HTML oder Codeblöcken nur im Rich-Text-Editor bearbeiten. */
function isRichText(text: string) {
  return /!\[|<[a-z][^>]*>|```|^\s*\|.*\|\s*$/im.test(text);
}

function plainPreview(text: string) {
  return (text ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '[Bild]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function formatAttr(attr: AttributeDefinition, v: unknown): string {
  if (isEmpty(v)) return '';
  if (attr.attr_type === 'boolean') return v ? 'Ja' : 'Nein';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Rohtext aus der Zelle in den Attributtyp umwandeln. Rückgabe [Wert, Fehler]. */
function parseAttr(attr: AttributeDefinition, raw: string): [unknown, string | null] {
  const s = raw.trim();
  if (!s) return ['', null];
  switch (attr.attr_type) {
    case 'integer':
      return /^-?\d+$/.test(s) ? [parseInt(s, 10), null] : [null, `${attr.display_name}: „${s}“ ist keine ganze Zahl`];
    case 'enum': {
      const hit = (attr.possible_values ?? []).find((p) => p.toLowerCase() === s.toLowerCase());
      return hit ? [hit, null] : [null, `${attr.display_name}: „${s}“ ist nicht erlaubt`];
    }
    case 'list':
      return [s.split(/[;,]/).map((x) => x.trim()).filter(Boolean), null];
    default:
      return [raw, null];
  }
}

// ─── Spalten ──────────────────────────────────────────────────────────────────

type ColKind = 'level' | 'text' | 'attr' | 'normative' | 'active';
interface Column {
  id: string;
  kind: ColKind;
  label: string;
  attr?: AttributeDefinition;
  width: number;
  required?: boolean;
}

function buildColumns(attrs: AttributeDefinition[]): Column[] {
  return [
    { id: 'level', kind: 'level', label: 'Level', width: 90 },
    { id: 'text', kind: 'text', label: 'Anforderungstext', width: 420, required: true },
    ...attrs.map((a): Column => ({
      id: `attr:${a.key}`, kind: 'attr', label: a.display_name, attr: a, required: a.required,
      width: a.attr_type === 'text' ? 240 : a.attr_type === 'boolean' ? 90 : 140,
    })),
    { id: 'normative', kind: 'normative', label: 'Normativ', width: 80 },
    { id: 'active', kind: 'active', label: 'Aktiv', width: 70 },
  ];
}

function cellValue(item: Item, col: Column): unknown {
  switch (col.kind) {
    case 'level': return item.level;
    case 'text': return item.text;
    case 'normative': return item.normative;
    case 'active': return item.active;
    case 'attr': return (item.custom_attributes ?? {})[col.attr!.key];
  }
}

function isMissing(item: Item, col: Column) {
  if (item.header || !item.active) return false; // Pflichtfelder gelten für aktive Anforderungen
  return !!col.required && isEmpty(cellValue(item, col));
}

function cellEditable(item: Item, col: Column) {
  if (col.kind === 'text') return !item.header && !isRichText(item.text);
  return true;
}

const isBoolCol = (col: Column) =>
  col.kind === 'normative' || col.kind === 'active' || col.attr?.attr_type === 'boolean';

// ─── Komponente ───────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  prefix: string;
  onOpenItem: (uid: string) => void;
}

interface Pos { row: number; col: number }

/**
 * Tabellenansicht eines Dokuments – bedient sich wie Excel (Pfeiltasten, Enter/F2 zum
 * Bearbeiten, Tab/Enter zum Übernehmen, Esc zum Abbrechen), hält aber die Regeln von
 * ReqMan ein: Enum-Werte nur aus der Liste, Zahlen geprüft, Pflichtfelder rot markiert
 * und nicht leerbar, neue Anforderungen erst anlegbar, wenn alle Pflichtfelder gesetzt sind.
 */
export default function RequirementsTable({ projectId, prefix, onOpenItem }: Props) {
  const { user } = useAuthStore();
  const canEdit = user?.role !== 'viewer';
  const qc = useQueryClient();
  const itemsKey = ['items', projectId, prefix];

  const { data: itemsRes, isLoading } = useQuery({
    queryKey: itemsKey,
    queryFn: () => listItems(projectId, prefix),
  });
  const { data: attrsRes } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const attrs = useMemo(() => attributesFor(prefix, attrsRes?.data ?? []), [prefix, attrsRes]);
  const columns = useMemo(() => buildColumns(attrs), [attrs]);

  const [filter, setFilter] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Pos | null>(null);
  const [editing, setEditing] = useState<{ pos: Pos; value: string } | null>(null);
  const [importTable, setImportTable] = useState<string[][] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(
    () => [...(itemsRes?.data ?? [])].sort((a, b) => compareLevel(a.level, b.level)),
    [itemsRes],
  );
  const incomplete = useMemo(
    () => allItems.filter((it) => columns.some((c) => isMissing(it, c))),
    [allItems, columns],
  );
  const rows = useMemo(() => {
    const q = filter.toLowerCase();
    return (onlyIncomplete ? incomplete : allItems).filter((it) =>
      !q || it.uid.toLowerCase().includes(q) || it.text.toLowerCase().includes(q)
      || Object.values(it.custom_attributes ?? {}).some((v) => String(v).toLowerCase().includes(q)));
  }, [allItems, incomplete, onlyIncomplete, filter]);

  // ── Speichern ──────────────────────────────────────────────────────────────
  const replaceItem = (updated: Item) => {
    qc.setQueryData(itemsKey, (old: any) =>
      old ? { ...old, data: old.data.map((it: Item) => (it.uid === updated.uid ? updated : it)) } : old);
    qc.invalidateQueries({ queryKey: ['item', projectId, updated.uid] });
  };

  const saveMut = useMutation({
    mutationFn: ({ uid, patch }: { uid: string; patch: Record<string, unknown> }) =>
      updateItem(projectId, uid, patch as any),
    onSuccess: (res) => replaceItem(res.data),
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Speichern fehlgeschlagen'),
  });

  /** Prüft einen Wert und speichert ihn. false = abgelehnt (Zelle bleibt im Bearbeiten). */
  const commitValue = (item: Item, col: Column, value: unknown): boolean => {
    let patch: Record<string, unknown>;
    if (col.kind === 'level') {
      const v = String(value).trim();
      if (!LEVEL_RE.test(v)) { toast.error(`Level „${v}“ ist ungültig (Beispiel: 1.2.3)`); return false; }
      const clash = allItems.find((it) => it.level === v && it.uid !== item.uid);
      if (clash) { toast.error(`Level ${v} ist schon vergeben (${clash.uid})`); return false; }
      if (v === item.level) return true;
      patch = { level: v };
    } else if (col.kind === 'text') {
      const v = String(value);
      if (!v.trim()) { toast.error('Der Anforderungstext darf nicht leer sein'); return false; }
      if (v === item.text) return true;
      patch = { text: v };
    } else if (col.kind === 'normative' || col.kind === 'active') {
      patch = { [col.kind]: !!value };
    } else {
      const attr = col.attr!;
      let v = value;
      if (typeof value === 'string' && attr.attr_type !== 'string' && attr.attr_type !== 'text') {
        const [parsed, err] = parseAttr(attr, value);
        if (err) { toast.error(err); return false; }
        v = parsed;
      }
      if (isEmpty(v) && attr.required && item.active && !item.header) {
        toast.error(`${attr.display_name} ist ein Pflichtattribut und darf nicht leer sein`);
        return false;
      }
      if (JSON.stringify(v) === JSON.stringify((item.custom_attributes ?? {})[attr.key] ?? '')) return true;
      patch = { custom_attributes: { [attr.key]: v } };
    }
    saveMut.mutate({ uid: item.uid, patch });
    return true;
  };

  // ── Bearbeiten / Navigation ────────────────────────────────────────────────
  const startEdit = (pos: Pos, initial?: string) => {
    const item = rows[pos.row];
    const col = columns[pos.col];
    if (!canEdit || !item || !col) return;
    if (isBoolCol(col)) { commitValue(item, col, !cellValue(item, col)); return; }
    if (!cellEditable(item, col)) {
      toast(item.header ? 'Abschnittsüberschriften im Editor bearbeiten' : 'Formatierter Text – bitte im Editor bearbeiten', { icon: '✏️' });
      return;
    }
    const cur = cellValue(item, col);
    const str = col.attr ? formatAttr(col.attr, cur) : String(cur ?? '');
    setEditing({ pos, value: initial ?? str });
  };

  const move = (dr: number, dc: number) => {
    setActive((p) => {
      const base = p ?? { row: 0, col: 0 };
      return {
        row: Math.min(Math.max(0, base.row + dr), Math.max(0, rows.length - 1)),
        col: Math.min(Math.max(0, base.col + dc), columns.length - 1),
      };
    });
  };

  // Aktueller Bearbeitungszustand als Ref: Tab/Enter übernehmen und das anschließende
  // Blur-Ereignis des Eingabefelds dürfen nicht doppelt speichern bzw. die Position zurücksetzen.
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const finishEdit = (dr: number, dc: number) => {
    const cur = editingRef.current;
    if (!cur) return;
    const item = rows[cur.pos.row];
    const col = columns[cur.pos.col];
    if (!commitValue(item, col, cur.value)) return;
    editingRef.current = null;
    setEditing(null);
    setActive(cur.pos);
    move(dr, dc);
    setTimeout(() => gridRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    editingRef.current = null;
    setEditing(null);
    setTimeout(() => gridRef.current?.focus(), 0);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    if (editing || !active) return;
    const item = rows[active.row];
    const col = columns[active.col];
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); move(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); move(1, 0); break;
      case 'ArrowLeft': e.preventDefault(); move(0, -1); break;
      case 'ArrowRight': e.preventDefault(); move(0, 1); break;
      case 'Tab': e.preventDefault(); move(0, e.shiftKey ? -1 : 1); break;
      case 'Enter': case 'F2': e.preventDefault(); startEdit(active); break;
      case ' ':
        if (col && isBoolCol(col)) { e.preventDefault(); startEdit(active); }
        break;
      case 'Delete': case 'Backspace':
        if (item && col && col.kind === 'attr' && canEdit && !isBoolCol(col)) { e.preventDefault(); commitValue(item, col, ''); }
        break;
      default:
        // Losschreiben wie in Excel: Zeichen ersetzt den Zellinhalt
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && col && !isBoolCol(col)
            && col.attr?.attr_type !== 'enum') {
          e.preventDefault();
          startEdit(active, e.key);
        }
    }
  };

  useEffect(() => {
    if (active && active.row >= rows.length) setActive(rows.length ? { row: rows.length - 1, col: active.col } : null);
  }, [rows.length]);

  // Aktive Zelle sichtbar halten
  useEffect(() => {
    if (!active) return;
    gridRef.current?.querySelector(`[data-cell="${active.row}-${active.col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  // Strg+V mit einer Excel-Tabelle (außerhalb einer Zelle) öffnet den Import (U1)
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      if (importTable || editing) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== gridRef.current && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.includes('\t')) return;
      const parsed = parseClipboardTable(text);
      if (!parsed.length) return;
      e.preventDefault();
      setImportTable(parsed);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [canEdit, importTable, editing]);

  // ── Mehrfachauswahl ────────────────────────────────────────────────────────
  const toggleSel = (uid: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n;
  });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.uid));
  const toggleAllSel = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.uid)));

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  const totalWidth = 36 + 110 + columns.reduce((s, c) => s + c.width, 0) + 40;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Werkzeugleiste */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 flex-wrap">
        <input
          value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Suchen…"
          className="text-sm px-2 py-1 border border-gray-200 rounded w-56 focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
        <span className="text-xs text-gray-400">{rows.length} von {allItems.length} Einträgen</span>
        <button
          onClick={() => setOnlyIncomplete((v) => !v)}
          className={clsx('text-xs inline-flex items-center gap-1 px-2 py-1 rounded border transition-colors',
            incomplete.length === 0 ? 'border-green-200 text-green-700 bg-green-50'
              : onlyIncomplete ? 'border-red-300 bg-red-100 text-red-700' : 'border-red-200 text-red-600 hover:bg-red-50')}
          title="Anforderungen mit fehlenden Pflichtfeldern"
          disabled={incomplete.length === 0 && !onlyIncomplete}
        >
          {incomplete.length === 0
            ? <><CheckCircle className="w-3.5 h-3.5" /> Alle Pflichtfelder gesetzt</>
            : <><AlertCircle className="w-3.5 h-3.5" /> {incomplete.length} unvollständig{onlyIncomplete ? ' (gefiltert)' : ''}</>}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setImportTable([])} className="btn-secondary text-xs py-1 px-2" title="Aus Excel einfügen">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Aus Excel
            </button>
          )}
          <span className="text-[11px] text-gray-400 hidden xl:inline">
            Pfeiltasten · Enter/F2 bearbeiten · Tab weiter · Esc abbrechen
          </span>
        </div>
      </div>

      {canEdit && selected.size > 0 && (
        <BulkBar
          count={selected.size} columns={columns}
          onApply={async (col, value) => {
            const targets = allItems.filter((it) => selected.has(it.uid));
            let ok = 0;
            for (const it of targets) {
              let v = value;
              if (col.attr && typeof value === 'string') {
                const [parsed, err] = parseAttr(col.attr, value);
                if (err) { toast.error(err); return; }
                v = parsed;
              }
              if (col.required && isEmpty(v)) { toast.error(`${col.label} ist ein Pflichtattribut`); return; }
              const patch = col.attr ? { custom_attributes: { [col.attr.key]: v } } : { [col.kind]: v };
              try { replaceItem((await updateItem(projectId, it.uid, patch as any)).data); ok++; }
              catch (e: any) { toast.error(`${it.uid}: ${e.response?.data?.detail || 'Fehler'}`); }
            }
            toast.success(`${col.label} bei ${ok} Anforderungen gesetzt`);
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Tabelle */}
      <div
        ref={gridRef} tabIndex={0} onKeyDown={onGridKey}
        className="flex-1 overflow-auto focus:outline-none"
      >
        <table className="text-sm border-collapse table-fixed" style={{ width: totalWidth }}>
          <colgroup>
            <col style={{ width: 36 }} /><col style={{ width: 110 }} />
            {columns.map((c) => <col key={c.id} style={{ width: c.width }} />)}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="text-xs text-gray-500">
              <th className="border-b border-r border-gray-200 px-2 py-1.5">
                {canEdit && <input type="checkbox" checked={allSelected} onChange={toggleAllSel} className="rounded border-gray-300" />}
              </th>
              <th className="border-b border-r border-gray-200 px-2 py-1.5 text-left font-medium">UID</th>
              {columns.map((c) => (
                <th key={c.id} className="border-b border-r border-gray-200 px-2 py-1.5 text-left font-medium truncate"
                    title={c.attr?.help_text ?? (c.attr?.possible_values ? `erlaubt: ${c.attr.possible_values.join(', ')}` : undefined)}>
                  {c.label}{c.required && <span className="text-red-500"> *</span>}
                </th>
              ))}
              <th className="border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {rows.map((item, r) => (
              <tr key={item.uid} className={clsx('group', item.header && 'bg-blue-50/40', selected.has(item.uid) && 'bg-primary-50/60')}>
                <td className="border-b border-r border-gray-100 px-2 text-center">
                  {canEdit && <input type="checkbox" checked={selected.has(item.uid)} onChange={() => toggleSel(item.uid)} className="rounded border-gray-300" />}
                </td>
                <td className="border-b border-r border-gray-100 px-2 py-1 font-mono text-xs text-gray-500 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {!item.active ? <Circle className="w-3 h-3 text-gray-300" />
                      : item.reviewed && item.reviewed_current ? <CheckCircle className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-yellow-500" />}
                    {item.uid}
                  </span>
                </td>
                {columns.map((col, c) => {
                  const isActive = active?.row === r && active?.col === c;
                  const isEditing = editing?.pos.row === r && editing?.pos.col === c;
                  const missing = isMissing(item, col);
                  const locked = !cellEditable(item, col);
                  return (
                    <td
                      key={col.id} data-cell={`${r}-${c}`}
                      onMouseDown={() => { if (!isEditing) { setActive({ row: r, col: c }); } }}
                      onDoubleClick={() => startEdit({ row: r, col: c })}
                      className={clsx('border-b border-r border-gray-100 px-2 py-1 align-top relative',
                        missing && 'bg-red-50',
                        isActive && !isEditing && 'outline outline-2 -outline-offset-2 outline-primary-500',
                        locked && 'text-gray-500')}
                    >
                      {isEditing ? (
                        <CellEditor
                          col={col} value={editing!.value}
                          onChange={(v) => setEditing((e) => (e ? { ...e, value: v } : e))}
                          onCommit={finishEdit} onCancel={cancelEdit}
                        />
                      ) : (
                        <CellView item={item} col={col} missing={missing} locked={locked}
                                  onToggle={() => canEdit && commitValue(item, col, !cellValue(item, col))} />
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-gray-100 px-1 text-center">
                  <button onClick={() => onOpenItem(item.uid)} title="Im Editor öffnen"
                          className="p-1 text-gray-300 group-hover:text-gray-600 hover:!text-primary-600">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {canEdit && !onlyIncomplete && !filter && (
              <DraftRow
                columns={columns} attrs={attrs}
                onCreate={async (text, custom) => {
                  const res = await createItem(projectId, prefix, { text, custom_attributes: custom, normative: true, active: true });
                  qc.invalidateQueries({ queryKey: itemsKey });
                  toast.success(`${res.data.uid} angelegt`);
                }}
              />
            )}
          </tbody>
        </table>
        {rows.length === 0 && (onlyIncomplete || filter) && (
          <p className="text-center text-sm text-gray-400 py-8">Keine Treffer</p>
        )}
      </div>

      {importTable && (
        <ImportDialog
          projectId={projectId} prefix={prefix}
          initialTable={importTable.length ? importTable : null}
          onClose={() => setImportTable(null)}
          onImported={() => setImportTable(null)}
        />
      )}
    </div>
  );
}

// ─── Zellen ───────────────────────────────────────────────────────────────────

function CellView({ item, col, missing, locked, onToggle }: {
  item: Item; col: Column; missing: boolean; locked: boolean; onToggle: () => void;
}) {
  const v = cellValue(item, col);
  if (isBoolCol(col)) {
    return (
      <input type="checkbox" checked={!!v} onChange={onToggle} tabIndex={-1}
             className="rounded border-gray-300 text-primary-600 mt-0.5" />
    );
  }
  if (col.kind === 'level') {
    return <span className="font-mono text-xs text-gray-600" style={{ paddingLeft: levelDepth(item.level) * 10 }}>{item.level}</span>;
  }
  if (col.kind === 'text') {
    if (item.header) {
      return <span className="font-semibold text-gray-800">{plainPreview(item.text) || <i className="text-gray-400 font-normal">Abschnitt</i>}</span>;
    }
    return (
      <span className="flex gap-1">
        <span className="line-clamp-3 whitespace-pre-wrap break-words">
          {plainPreview(item.text) || (missing && <i className="text-red-400">Text fehlt</i>)}
        </span>
        {locked && <span title="Formatierter Text – im Editor bearbeiten"><Lock className="w-3 h-3 shrink-0 mt-1 text-gray-300" /></span>}
      </span>
    );
  }
  const text = formatAttr(col.attr!, v);
  return text
    ? <span className="block truncate" title={text}>{text}</span>
    : missing ? <i className="text-xs text-red-400">Pflichtfeld</i> : null;
}

function CellEditor({ col, value, onChange, onCommit, onCancel }: {
  col: Column; value: string; onChange: (v: string) => void;
  onCommit: (dr: number, dc: number) => void; onCancel: () => void;
}) {
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    else if (e.key === 'Tab') { e.preventDefault(); onCommit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter' && !(col.kind === 'text' || col.attr?.attr_type === 'text') ) { e.preventDefault(); onCommit(1, 0); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); onCommit(1, 0); }
  };
  const cls = 'w-full text-sm border border-primary-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-200 bg-white';

  if (col.attr?.attr_type === 'enum') {
    return (
      <select autoFocus className={cls} value={value} onKeyDown={onKey}
              onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit(0, 0)}>
        <option value="">—</option>
        {(col.attr.possible_values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (col.kind === 'text' || col.attr?.attr_type === 'text') {
    return (
      <textarea autoFocus className={clsx(cls, 'resize-y')} rows={Math.min(8, Math.max(2, Math.ceil(value.length / 50)))}
                value={value} onKeyDown={onKey} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit(0, 0)}
                onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
                title="Enter übernimmt, Umschalt+Enter neue Zeile" />
    );
  }
  return (
    <input autoFocus className={cls} value={value} onKeyDown={onKey}
           inputMode={col.attr?.attr_type === 'integer' ? 'numeric' : undefined}
           onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit(0, 0)}
           onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }} />
  );
}

// ─── Neue Zeile ───────────────────────────────────────────────────────────────

function DraftRow({ columns, attrs, onCreate }: {
  columns: Column[]; attrs: AttributeDefinition[];
  onCreate: (text: string, custom: Record<string, unknown>) => Promise<void>;
}) {
  const defaults = () => Object.fromEntries(
    attrs.filter((a) => !isEmpty(a.default_value)).map((a) => [a.key, formatAttr(a, a.default_value)]));
  const [text, setText] = useState('');
  const [vals, setVals] = useState<Record<string, string>>(defaults);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setVals(defaults()); }, [attrs]);

  const missing = [
    ...(!text.trim() ? ['Text'] : []),
    ...attrs.filter((a) => a.required && !String(vals[a.key] ?? '').trim()).map((a) => a.display_name),
  ];
  const errors = attrs.flatMap((a) => {
    const raw = vals[a.key];
    if (!raw || a.attr_type === 'boolean') return [];
    const [, err] = parseAttr(a, raw);
    return err ? [err] : [];
  });
  const touched = text !== '' || attrs.some((a) => (vals[a.key] ?? '') !== (defaults()[a.key] ?? ''));

  const create = async () => {
    if (missing.length || errors.length) {
      toast.error(missing.length ? `Noch offen: ${missing.join(', ')}` : errors[0]);
      return;
    }
    const custom: Record<string, unknown> = {};
    for (const a of attrs) {
      const raw = vals[a.key];
      if (a.attr_type === 'boolean') { if (raw) custom[a.key] = raw === 'Ja'; continue; }
      if (!raw) continue;
      custom[a.key] = parseAttr(a, raw)[0];
    }
    setBusy(true);
    try {
      await onCreate(text.trim(), custom);
      setText(''); setVals(defaults());
      textRef.current?.focus();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Anlegen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); create(); }
    if (e.key === 'Escape') { setText(''); setVals(defaults()); }
  };
  const inCls = (bad: boolean) => clsx('w-full text-sm border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-300 bg-white',
    bad && touched ? 'border-red-300' : 'border-gray-200');

  return (
    <tr className="bg-gray-50/80">
      <td className="border-b border-r border-gray-100 text-center"><Plus className="w-3.5 h-3.5 text-gray-400 mx-auto" /></td>
      <td className="border-b border-r border-gray-100 px-2 text-xs text-gray-400 italic">neu</td>
      {columns.map((col) => {
        if (col.kind === 'level') return <td key={col.id} className="border-b border-r border-gray-100 px-2 text-xs text-gray-400">auto</td>;
        if (col.kind === 'normative' || col.kind === 'active') return <td key={col.id} className="border-b border-r border-gray-100 px-2 text-xs text-gray-400">Ja</td>;
        if (col.kind === 'text') {
          return (
            <td key={col.id} className="border-b border-r border-gray-100 px-1 py-1">
              <textarea ref={textRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
                        placeholder="Neue Anforderung eingeben, Enter zum Anlegen" className={clsx(inCls(!text.trim()), 'resize-y')} />
            </td>
          );
        }
        const a = col.attr!;
        const v = vals[a.key] ?? '';
        const set = (x: string) => setVals((p) => ({ ...p, [a.key]: x }));
        const bad = (a.required && !v.trim()) || (!!v && a.attr_type !== 'boolean' && !!parseAttr(a, v)[1]);
        return (
          <td key={col.id} className="border-b border-r border-gray-100 px-1 py-1">
            {a.attr_type === 'enum' ? (
              <select value={v} onChange={(e) => set(e.target.value)} onKeyDown={onKey} className={inCls(bad)}>
                <option value="">{a.required ? '— Pflicht —' : '—'}</option>
                {(a.possible_values ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : a.attr_type === 'boolean' ? (
              <input type="checkbox" checked={v === 'Ja'} onChange={(e) => set(e.target.checked ? 'Ja' : 'Nein')}
                     className="rounded border-gray-300 mt-1" />
            ) : (
              <input value={v} onChange={(e) => set(e.target.value)} onKeyDown={onKey} className={inCls(bad)}
                     placeholder={a.required ? 'Pflicht' : ''} />
            )}
          </td>
        );
      })}
      <td className="border-b border-gray-100 px-1 text-center">
        <button onClick={create} disabled={busy} title={missing.length ? `Noch offen: ${missing.join(', ')}` : 'Anlegen'}
                className={clsx('p-1 rounded', missing.length || errors.length ? 'text-gray-300' : 'text-primary-600 hover:bg-primary-50')}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </td>
    </tr>
  );
}

// ─── Sammelbearbeitung ────────────────────────────────────────────────────────

function BulkBar({ count, columns, onApply, onClear }: {
  count: number; columns: Column[];
  onApply: (col: Column, value: unknown) => Promise<void>; onClear: () => void;
}) {
  const editable = columns.filter((c) => c.kind === 'attr' || c.kind === 'normative' || c.kind === 'active');
  const [colId, setColId] = useState(editable[0]?.id ?? '');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const col = editable.find((c) => c.id === colId);
  if (!col) return null;
  const bool = isBoolCol(col);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 border-b border-primary-100 text-xs">
      <span className="font-medium text-primary-800">{count} ausgewählt:</span>
      <select value={colId} onChange={(e) => { setColId(e.target.value); setValue(''); }}
              className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
        {editable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <span className="text-gray-500">setzen auf</span>
      {bool ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
          <option value="">—</option><option value="Ja">Ja</option><option value="Nein">Nein</option>
        </select>
      ) : col.attr?.attr_type === 'enum' ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
          <option value="">—</option>
          {(col.attr.possible_values ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => setValue(e.target.value)} className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white w-40" />
      )}
      <button
        disabled={busy || (bool && !value)}
        onClick={async () => { setBusy(true); try { await onApply(col, bool ? value === 'Ja' : value); } finally { setBusy(false); } }}
        className="btn-primary text-xs py-0.5 px-2 disabled:opacity-50"
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin" />} Übernehmen
      </button>
      <button onClick={onClear} className="ml-auto p-1 text-gray-400 hover:text-gray-700" title="Auswahl aufheben">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
