import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Link2, Loader2, GripVertical, X, ArrowRight,
  Search, FileText, CheckCircle, AlertCircle, Circle,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { listDocuments, listItems, addLink, removeLink } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import { Item } from '../types';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function parseLevel(level: string): number[] {
  return level.split('.').map((n) => parseInt(n, 10) || 0);
}
function compareLevel(a: string, b: string): number {
  const la = parseLevel(a);
  const lb = parseLevel(b);
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const diff = (la[i] ?? 0) - (lb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sortByLevel(items: Item[]): Item[] {
  return [...items].sort((a, b) => compareLevel(a.level, b.level));
}

function filterItems(items: Item[], q: string): Item[] {
  if (!q.trim()) return items;
  const lower = q.toLowerCase();
  return items.filter(
    (it) =>
      it.uid.toLowerCase().includes(lower) ||
      it.level.toLowerCase().includes(lower) ||
      stripHtml(it.text).toLowerCase().includes(lower),
  );
}

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusIcon({ item }: { item: Item }) {
  if (!item.active) return <Circle className="w-3 h-3 text-gray-300 shrink-0" />;
  if (item.reviewed) return <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />;
  return <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" />;
}

// ─── DraggableRow (linkes Panel) ──────────────────────────────────────────────

interface DraggableRowProps {
  item: Item;
  canDrag: boolean;
  rightPrefix: string;
  isLinkedToRight: boolean;    // hat mindestens einen Link auf das rechte Dokument
  rightLinkedUids: string[];   // konkrete UIDs im rechten Dok, zu denen Links bestehen
  onRemoveLink: (targetUid: string) => void;
}

function DraggableRow({
  item, canDrag, rightPrefix, rightLinkedUids, onRemoveLink,
}: DraggableRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.uid,
    disabled: !canDrag,
  });

  const style = { transform: CSS.Translate.toString(transform) };
  const plain = stripHtml(item.text);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 group transition-colors select-none',
        isDragging
          ? 'opacity-30 bg-primary-50'
          : item.header
            ? 'bg-blue-50/60 hover:bg-blue-100/60'
            : 'bg-white hover:bg-gray-50',
      )}
    >
      {/* Drag-Handle */}
      <div
        {...listeners}
        {...attributes}
        className={clsx(
          'mt-0.5 shrink-0 transition-colors',
          canDrag
            ? 'cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500'
            : 'cursor-default text-gray-200',
        )}
        title={canDrag ? 'Ziehen um zu verlinken' : 'Zieldokument wählen'}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Status */}
      <div className="mt-0.5 shrink-0">
        <StatusIcon item={item} />
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={clsx(
            'font-mono text-xs font-semibold shrink-0',
            item.header ? 'text-blue-700' : 'text-primary-700',
          )}>
            {item.uid}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{item.level}</span>
          {item.header && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded-full shrink-0">Abschnitt</span>
          )}
        </div>

        {plain && (
          <p className={clsx(
            'text-xs mt-0.5 truncate',
            item.header ? 'font-medium text-gray-700' : 'text-gray-500',
          )}>
            {plain}
          </p>
        )}

        {/* Link-Badges → rechtes Dokument */}
        {rightLinkedUids.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {rightLinkedUids.map((target) => (
              <span
                key={target}
                className="inline-flex items-center gap-1 text-[11px] bg-blue-100 text-blue-700
                           px-1.5 py-0.5 rounded-full font-medium"
              >
                <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                {target}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveLink(target); }}
                  className="text-blue-400 hover:text-red-500 transition-colors ml-0.5"
                  title={`Link zu ${target} entfernen`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Alle anderen Links (anderes Dokument) als blasser Hinweis */}
        {rightPrefix && item.links.filter((l) => !l.startsWith(rightPrefix)).length > 0 && (
          <p className="text-[11px] text-gray-300 mt-0.5">
            + {item.links.filter((l) => !l.startsWith(rightPrefix)).length} weitere Link(s)
          </p>
        )}
      </div>
    </div>
  );
}

// ─── DroppableRow (rechtes Panel) ────────────────────────────────────────────

interface DroppableRowProps {
  item: Item;
  incomingUids: string[];   // UIDs aus dem linken Dok, die auf dieses Item zeigen
  isAlreadyLinked: boolean; // aktiv draggender linker Item ist bereits mit diesem verknüpft
}

function DroppableRow({ item, incomingUids, isAlreadyLinked }: DroppableRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: item.uid });
  const plain = stripHtml(item.text);

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 transition-all',
        isOver
          ? isAlreadyLinked
            ? 'bg-yellow-50 ring-1 ring-inset ring-yellow-400'
            : 'bg-primary-50 ring-1 ring-inset ring-primary-400'
          : item.header
            ? 'bg-blue-50/60'
            : 'bg-white',
      )}
    >
      {/* Status */}
      <div className="mt-0.5 shrink-0">
        <StatusIcon item={item} />
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={clsx(
            'font-mono text-xs font-semibold shrink-0',
            item.header ? 'text-blue-700' : 'text-gray-700',
          )}>
            {item.uid}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{item.level}</span>
          {item.header && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded-full shrink-0">Abschnitt</span>
          )}
        </div>

        {plain && (
          <p className={clsx(
            'text-xs mt-0.5 truncate',
            item.header ? 'font-medium text-gray-700' : 'text-gray-500',
          )}>
            {plain}
          </p>
        )}

        {/* Eingehende Links aus dem linken Panel */}
        {incomingUids.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {incomingUids.map((src) => (
              <span
                key={src}
                className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700
                           px-1.5 py-0.5 rounded-full font-medium"
              >
                ← {src}
              </span>
            ))}
          </div>
        )}

        {/* Drop-Hinweis */}
        {isOver && (
          <p className={clsx(
            'text-[11px] font-semibold mt-1',
            isAlreadyLinked ? 'text-yellow-600' : 'text-primary-600',
          )}>
            {isAlreadyLinked ? 'ℹ bereits verknüpft' : '＋ Link erstellen'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Panel-Kopf ───────────────────────────────────────────────────────────────

function PanelHeader({
  label, value, options, onChange, search, onSearch, isLoading, count, total,
}: {
  label: string;
  value: string;
  options: { prefix: string; item_count: number }[];
  onChange: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  isLoading: boolean;
  count: number;
  total: number;
}) {
  return (
    <div className="shrink-0 border-b border-gray-200 bg-gray-50">
      <div className="px-3 pt-2 pb-1.5">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input py-1 text-sm w-full"
        >
          <option value="">– Dokument wählen –</option>
          {options.map((d) => (
            <option key={d.prefix} value={d.prefix}>
              {d.prefix} ({d.item_count})
            </option>
          ))}
        </select>
      </div>
      {value && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Suchen…"
              className="input pl-6 py-0.5 text-xs w-full"
            />
            {search && (
              <button
                onClick={() => onSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
            {isLoading ? '…' : `${count} / ${total}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function LinkingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    currentProject,
    linkingLeftPrefix:  storedLeft,
    linkingRightPrefix: storedRight,
    setLinkingLeftPrefix,
    setLinkingRightPrefix,
  } = useProjectStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const pid = projectId ?? currentProject?.id ?? '';

  // UI-State – aus Store wiederherstellen
  const [leftPrefixState,  setLeftPrefixState]  = useState(() => storedLeft[pid]  ?? '');
  const [rightPrefixState, setRightPrefixState] = useState(() => storedRight[pid] ?? '');
  const [leftSearch,  setLeftSearch]  = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [activeItem,  setActiveItem]  = useState<Item | null>(null);

  // Wrapper, die Zustand + Store synchron halten
  const setLeftPrefix = (v: string) => {
    setLeftPrefixState(v);
    if (pid) setLinkingLeftPrefix(pid, v);
  };
  const setRightPrefix = (v: string) => {
    setRightPrefixState(v);
    if (pid) setLinkingRightPrefix(pid, v);
  };

  const leftPrefix  = leftPrefixState;
  const rightPrefix = rightPrefixState;

  // Sensor: min. 5 px Bewegung, damit normales Klicken weiterhin funktioniert
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Daten laden ──────────────────────────────────────────────────────────────
  const { data: docsRes, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', pid],
    queryFn: () => listDocuments(pid),
    enabled: !!pid,
  });
  const documents: { prefix: string; item_count: number }[] = docsRes?.data ?? [];

  const { data: leftRes, isLoading: leftLoading } = useQuery({
    queryKey: ['items', pid, leftPrefix],
    queryFn: () => listItems(pid, leftPrefix),
    enabled: !!leftPrefix,
  });
  const leftItemsRaw: Item[] = leftRes?.data ?? [];

  const { data: rightRes, isLoading: rightLoading } = useQuery({
    queryKey: ['items', pid, rightPrefix],
    queryFn: () => listItems(pid, rightPrefix),
    enabled: !!rightPrefix,
  });
  const rightItemsRaw: Item[] = rightRes?.data ?? [];

  // ── Verarbeitung ─────────────────────────────────────────────────────────────

  const leftItems  = useMemo(() => filterItems(sortByLevel(leftItemsRaw), leftSearch), [leftItemsRaw, leftSearch]);
  const rightItems = useMemo(() => filterItems(sortByLevel(rightItemsRaw), rightSearch), [rightItemsRaw, rightSearch]);

  /** Map: targetUid → [sourceUid, ...] — alle Links vom linken ins rechte Dok */
  const reverseMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of leftItemsRaw) {
      for (const link of item.links) {
        if (!rightPrefix || link.startsWith(rightPrefix)) {
          const list = map.get(link) ?? [];
          list.push(item.uid);
          map.set(link, list);
        }
      }
    }
    return map;
  }, [leftItemsRaw, rightPrefix]);

  /** Links des gerade gezogenen Items auf das rechte Dok */
  const activeLinks = useMemo(
    () => new Set(activeItem?.links.filter((l) => !rightPrefix || l.startsWith(rightPrefix)) ?? []),
    [activeItem, rightPrefix],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const addLinkMut = useMutation({
    mutationFn: ({ sourceUid, targetUid }: { sourceUid: string; targetUid: string }) =>
      addLink(pid, sourceUid, targetUid),
    onSuccess: (_, { sourceUid, targetUid }) => {
      qc.invalidateQueries({ queryKey: ['items', pid, leftPrefix] });
      toast.success(`${sourceUid} → ${targetUid}`);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'Verknüpfung fehlgeschlagen'),
  });

  const removeLinkMut = useMutation({
    mutationFn: ({ sourceUid, targetUid }: { sourceUid: string; targetUid: string }) =>
      removeLink(pid, sourceUid, targetUid),
    onSuccess: (_, { sourceUid, targetUid }) => {
      qc.invalidateQueries({ queryKey: ['items', pid, leftPrefix] });
      toast.success(`${sourceUid} → ${targetUid} entfernt`);
    },
    onError: () => toast.error('Entfernen fehlgeschlagen'),
  });

  // ── DnD-Handler ───────────────────────────────────────────────────────────────

  const handleDragStart = ({ active }: DragStartEvent) => {
    const found = leftItemsRaw.find((i) => i.uid === active.id);
    setActiveItem(found ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveItem(null);
    if (!over) return;

    const sourceUid = String(active.id);
    const targetUid = String(over.id);

    const source = leftItemsRaw.find((i) => i.uid === sourceUid);
    if (!source) return;

    if (source.links.includes(targetUid)) {
      toast('Bereits verknüpft', { icon: 'ℹ️' });
      return;
    }

    addLinkMut.mutate({ sourceUid, targetUid });
  };

  // ── Kein Projekt ─────────────────────────────────────────────────────────────

  if (!pid) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Link2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Kein Projekt ausgewählt</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            Zur Projektübersicht
          </button>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const canDrag = !!rightPrefix && !!leftPrefix;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Toolbar ── */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
          <Link2 className="w-4 h-4 text-primary-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-700">Verlinkung</span>

          {docsLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}

          <span className="text-xs text-gray-400 ml-1">
            {canDrag
              ? 'Anforderung von links nach rechts ziehen um einen Link zu erstellen · ✕ auf Badge um Link zu entfernen'
              : 'Bitte beide Dokumente auswählen'}
          </span>

          {/* Link-Zähler */}
          {leftPrefix && rightPrefix && !leftLoading && (
            <span className="ml-auto text-xs text-gray-500 shrink-0">
              {leftItemsRaw.filter((i) =>
                i.links.some((l) => l.startsWith(rightPrefix)),
              ).length}{' '}
              von {leftItemsRaw.length} Items verknüpft
            </span>
          )}
        </div>

        {/* ── Zwei Panels ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Linkes Panel: Quelldokument ── */}
          <div className="flex flex-col w-1/2 overflow-hidden border-r border-gray-200">
            <PanelHeader
              label="Quelldokument (ziehbar)"
              value={leftPrefix}
              options={documents.filter((d) => d.prefix !== rightPrefix)}
              onChange={(v) => { setLeftPrefix(v); setLeftSearch(''); }}
              search={leftSearch}
              onSearch={setLeftSearch}
              isLoading={leftLoading}
              count={leftItems.length}
              total={leftItemsRaw.length}
            />

            <div className="flex-1 overflow-y-auto">
              {!leftPrefix ? (
                <EmptyHint text="Quelldokument wählen" />
              ) : leftLoading ? (
                <SpinnerCenter />
              ) : leftItems.length === 0 ? (
                <EmptyHint text="Keine Treffer" />
              ) : (
                leftItems.map((item) => {
                  const rightLinkedUids = item.links.filter(
                    (l) => !rightPrefix || l.startsWith(rightPrefix),
                  );
                  return (
                    <DraggableRow
                      key={item.uid}
                      item={item}
                      canDrag={canDrag}
                      rightPrefix={rightPrefix}
                      isLinkedToRight={rightLinkedUids.length > 0}
                      rightLinkedUids={rightLinkedUids}
                      onRemoveLink={(targetUid) =>
                        removeLinkMut.mutate({ sourceUid: item.uid, targetUid })
                      }
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* ── Rechtes Panel: Zieldokument ── */}
          <div className="flex flex-col w-1/2 overflow-hidden">
            <PanelHeader
              label="Zieldokument (Drop-Zone)"
              value={rightPrefix}
              options={documents.filter((d) => d.prefix !== leftPrefix)}
              onChange={(v) => { setRightPrefix(v); setRightSearch(''); }}
              search={rightSearch}
              onSearch={setRightSearch}
              isLoading={rightLoading}
              count={rightItems.length}
              total={rightItemsRaw.length}
            />

            <div className="flex-1 overflow-y-auto">
              {!rightPrefix ? (
                <EmptyHint text="Zieldokument wählen" />
              ) : rightLoading ? (
                <SpinnerCenter />
              ) : rightItems.length === 0 ? (
                <EmptyHint text="Keine Treffer" />
              ) : (
                rightItems.map((item) => (
                  <DroppableRow
                    key={item.uid}
                    item={item}
                    incomingUids={reverseMap.get(item.uid) ?? []}
                    isAlreadyLinked={activeLinks.has(item.uid)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Drag-Overlay (schwebendes Vorschau-Karte) ── */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeItem && (
          <div className="bg-white border-2 border-primary-500 rounded-xl px-3 py-2.5
                          shadow-2xl opacity-95 max-w-xs pointer-events-none">
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 text-primary-400" />
              <span className="font-mono text-xs font-bold text-primary-700">
                {activeItem.uid}
              </span>
              <span className="text-xs text-gray-400">{activeItem.level}</span>
            </div>
            {stripHtml(activeItem.text) && (
              <p className="text-xs text-gray-600 mt-1 max-w-[220px] line-clamp-2">
                {stripHtml(activeItem.text)}
              </p>
            )}
            <p className="text-[10px] text-primary-500 mt-1.5 font-medium">
              Auf Ziel-Anforderung ablegen →
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Kleine Hilfskomponenten ──────────────────────────────────────────────────

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
      <FileText className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function SpinnerCenter() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  );
}
