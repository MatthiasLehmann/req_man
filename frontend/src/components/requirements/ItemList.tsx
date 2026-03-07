import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Loader2, CheckCircle, Circle, AlertCircle,
  Tag, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listItems, createItem, deleteItem } from '../../api/client';
import { Item } from '../../types';
import { useAuthStore } from '../../store/authStore';

// ─── Level-Hilfsfunktionen ────────────────────────────────────────────────────

/** Wandelt "1.2.3" in [1, 2, 3] um */
function parseLevel(level: string): number[] {
  return level.split('.').map((n) => parseInt(n, 10) || 0);
}

/** Vergleichsfunktion für Level-Sortierung */
function compareLevel(a: string, b: string): number {
  const la = parseLevel(a);
  const lb = parseLevel(b);
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const diff = (la[i] ?? 0) - (lb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ─── Baum-Datenstruktur ───────────────────────────────────────────────────────

interface FlatNode {
  item: Item;
  depth: number;       // Tiefe im Baum (0 = Wurzel)
  hasChildren: boolean;
}

function buildFlatTree(items: Item[]): FlatNode[] {
  const sorted = [...items].sort((a, b) => compareLevel(a.level, b.level));

  const nodes: FlatNode[] = sorted.map((item) => ({
    item,
    depth: Math.max(0, parseLevel(item.level).length - 1),
    hasChildren: false,
  }));

  // Ein Knoten hat Kinder, wenn der nächste Knoten tiefer liegt
  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i + 1].depth > nodes[i].depth) {
      nodes[i].hasChildren = true;
    }
  }

  return nodes;
}

/** Gibt nur sichtbare Knoten zurück (versteckt Kinder von eingeklappten Eltern) */
function getVisibleNodes(nodes: FlatNode[], collapsed: Set<string>): FlatNode[] {
  const visible: FlatNode[] = [];
  let hiddenBelowDepth: number | null = null;

  for (const node of nodes) {
    if (hiddenBelowDepth !== null) {
      if (node.depth > hiddenBelowDepth) continue; // versteckt
      hiddenBelowDepth = null;
    }
    visible.push(node);
    if (node.hasChildren && collapsed.has(node.item.uid)) {
      hiddenBelowDepth = node.depth;
    }
  }

  return visible;
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  prefix: string;
  selectedUid: string | null;
  onSelectItem: (uid: string) => void;
}

export default function ItemList({ projectId, prefix, selectedUid, onSelectItem }: Props) {
  const { user } = useAuthStore();
  const canEdit = user?.role !== 'viewer';
  const qc = useQueryClient();

  const { data: itemsRes, isLoading } = useQuery({
    queryKey: ['items', projectId, prefix],
    queryFn: () => listItems(projectId, prefix),
    enabled: !!prefix,
  });
  const items: Item[] = itemsRes?.data || [];

  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Baum aus Items bauen
  const flatTree = useMemo(() => buildFlatTree(items), [items]);

  // IDs aller Knoten mit Kindern (für Alles-Auf-/Zuklappen)
  const parentUids = useMemo(
    () => new Set(flatTree.filter((n) => n.hasChildren).map((n) => n.item.uid)),
    [flatTree]
  );

  const allCollapsed = parentUids.size > 0 && collapsed.size === parentUids.size;
  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(parentUids));
  };

  const toggleNode = (uid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  // Bei aktiver Suche: flach gefilterte Liste ohne Baum
  const filteredFlat = useMemo(() => {
    if (!filter) return null;
    const q = filter.toLowerCase();
    return flatTree.filter(
      ({ item }) =>
        item.uid.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q) ||
        item.level.includes(q)
    );
  }, [filter, flatTree]);

  // Im Baum-Modus: nur sichtbare Knoten
  const visibleTree = useMemo(
    () => (filter ? null : getVisibleNodes(flatTree, collapsed)),
    [filter, flatTree, collapsed]
  );

  const displayNodes = filteredFlat ?? visibleTree ?? [];

  // Mutationen
  const createMut = useMutation({
    mutationFn: () => createItem(projectId, prefix, { text: '', normative: true, active: true }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['items', projectId, prefix] });
      toast.success(`${res.data.uid} erstellt`);
      onSelectItem(res.data.uid);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Erstellen'),
  });

  const deleteMut = useMutation({
    mutationFn: (uid: string) => deleteItem(projectId, uid),
    onSuccess: (_, uid) => {
      qc.invalidateQueries({ queryKey: ['items', projectId, prefix] });
      toast.success(`${uid} gelöscht`);
      if (selectedUid === uid) onSelectItem('');
    },
    onError: () => toast.error('Fehler beim Löschen'),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Suchen..."
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded
                     focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
        {/* Alles auf-/zuklappen (nur im Baum-Modus sinnvoll) */}
        {!filter && parentUids.size > 0 && (
          <button
            onClick={toggleAll}
            title={allCollapsed ? 'Alles aufklappen' : 'Alles zuklappen'}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
          >
            {allCollapsed
              ? <ChevronsUpDown className="w-3.5 h-3.5" />
              : <ChevronsDownUp className="w-3.5 h-3.5" />}
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="btn-primary text-xs py-1 px-2"
            title="Neue Anforderung"
          >
            {createMut.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Plus className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Zähler */}
      <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
        {filter
          ? `${displayNodes.length} von ${items.length} Anforderungen`
          : `${items.length} Anforderungen`}
      </div>

      {/* Liste / Baum */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : displayNodes.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {filter ? 'Keine Treffer' : 'Keine Anforderungen'}
          </div>
        ) : (
          displayNodes.map(({ item, depth, hasChildren }) => (
            <TreeRow
              key={item.uid}
              item={item}
              depth={filter ? 0 : depth}
              hasChildren={hasChildren && !filter}
              isCollapsed={collapsed.has(item.uid)}
              isSelected={selectedUid === item.uid}
              onToggle={() => toggleNode(item.uid)}
              onClick={() => onSelectItem(item.uid)}
              onDelete={
                canEdit
                  ? () => { if (confirm(`${item.uid} löschen?`)) deleteMut.mutate(item.uid); }
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── TreeRow ──────────────────────────────────────────────────────────────────

interface TreeRowProps {
  item: Item;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onDelete?: () => void;
}

function TreeRow({
  item, depth, hasChildren, isCollapsed, isSelected, onToggle, onClick, onDelete,
}: TreeRowProps) {
  const textPreview = item.text.replace(/<[^>]*>/g, '').slice(0, 80);
  const isHeader = item.header;

  return (
    <div
      className={clsx(
        'flex items-start gap-1 py-2 pr-2 border-b border-gray-100 cursor-pointer group transition-colors',
        isSelected
          ? 'bg-primary-50 border-l-2 border-l-primary-500'
          : isHeader
            ? 'hover:bg-blue-50 bg-gray-50/60'
            : 'hover:bg-gray-50',
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={onClick}
    >
      {/* Auf-/Zuklapp-Pfeil */}
      <button
        className={clsx(
          'shrink-0 mt-0.5 rounded transition-colors',
          hasChildren
            ? 'text-gray-400 hover:text-gray-700'
            : 'text-transparent pointer-events-none',
        )}
        style={{ width: 14, height: 14 }}
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(); }}
        tabIndex={-1}
      >
        {hasChildren && (
          isCollapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Status-Icon */}
      <div className="shrink-0 mt-0.5">
        {!item.active ? (
          <Circle className="w-3.5 h-3.5 text-gray-300" />
        ) : item.reviewed ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
        )}
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={clsx(
            'text-xs font-mono font-semibold shrink-0',
            isSelected ? 'text-primary-700' : 'text-gray-500',
          )}>
            {item.uid}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{item.level}</span>
          {isHeader && (
            <span className="badge-blue text-xs shrink-0">Abschnitt</span>
          )}
          {!item.normative && (
            <span className="badge-yellow text-xs shrink-0">Info</span>
          )}
          {item.links.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-blue-500 shrink-0">
              <Tag className="w-3 h-3" />{item.links.length}
            </span>
          )}
        </div>
        {textPreview && !isHeader && (
          <p className="text-xs text-gray-500 truncate leading-relaxed">{textPreview}</p>
        )}
        {isHeader && textPreview && (
          <p className={clsx(
            'text-xs font-medium truncate',
            isSelected ? 'text-primary-700' : 'text-gray-700',
          )}>
            {textPreview}
          </p>
        )}
      </div>

      {/* Löschen */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500
                     p-0.5 transition-opacity shrink-0 mt-0.5"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
