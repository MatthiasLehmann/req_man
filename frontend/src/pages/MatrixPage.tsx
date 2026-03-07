import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Table2, Loader2, FileText, CheckCircle2, XCircle, Minus,
  ChevronDown, ChevronRight, SlidersHorizontal, Link2,
} from 'lucide-react';
import clsx from 'clsx';
import { listDocuments, listItems, getAttributes } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import { Item, AttributeDefinition } from '../types';

// ─── Level-Hilfsfunktionen (gleiche Logik wie ItemList) ──────────────────────

function parseLevel(level: string): number[] {
  return level.split('.').map((n) => parseInt(n, 10) || 0);
}
function levelDepth(level: string): number {
  const parts = parseLevel(level);
  const effective = parts[parts.length - 1] === 0 ? parts.slice(0, -1) : parts;
  return Math.max(0, effective.length - 1);
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
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// ─── Spaltendefinition ────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  isCustom?: boolean;
  attrType?: string;
}

const FIXED_COLS: ColDef[] = [
  { key: 'level', label: 'Ebene' },
  { key: 'uid',   label: 'ID'   },
];

const STD_OPTIONAL: ColDef[] = [
  { key: 'text',      label: 'Anforderungstext' },
  { key: 'active',    label: 'Aktiv'            },
  { key: 'normative', label: 'Normativ'         },
  { key: 'reviewed',  label: 'Geprüft'          },
  { key: 'links',     label: 'Verlinkungen'     },
  { key: 'derived',   label: 'Abgeleitet'       },
  { key: 'header',    label: 'Abschnitt'        },
];

// ─── Zell-Rendering ───────────────────────────────────────────────────────────

function BoolCell({ value }: { value: boolean | null | undefined }) {
  if (value == null) return <Minus className="w-3.5 h-3.5 text-gray-300 mx-auto" />;
  return value
    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
    : <XCircle     className="w-3.5 h-3.5 text-gray-300 mx-auto" />;
}

function CellValue({ col, item }: { col: ColDef; item: Item }) {
  if (col.isCustom) {
    const val = item.custom_attributes[col.key];
    if (val == null || val === '') return <span className="text-gray-300">–</span>;
    if (typeof val === 'boolean') return <BoolCell value={val} />;
    return <span>{String(val)}</span>;
  }
  switch (col.key) {
    case 'text': {
      const plain = stripHtml(item.text);
      return plain
        ? <span title={plain} className="line-clamp-3 text-gray-700">{plain}</span>
        : <span className="text-gray-300">–</span>;
    }
    case 'active':    return <BoolCell value={item.active} />;
    case 'normative': return <BoolCell value={item.normative} />;
    case 'derived':   return <BoolCell value={item.derived} />;
    case 'header':    return <BoolCell value={item.header} />;
    case 'reviewed':
      return item.reviewed
        ? <span title={item.reviewed}><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" /></span>
        : <XCircle className="w-3.5 h-3.5 text-gray-300 mx-auto" />;
    case 'links':
      return item.links.length > 0
        ? <span className="flex items-center gap-1 justify-center text-blue-600 font-medium">
            <Link2 className="w-3 h-3" />{item.links.length}
          </span>
        : <span className="text-gray-300">–</span>;
    default:
      return <span className="text-gray-300">–</span>;
  }
}

// ─── Spalten-Auswahl-Panel ────────────────────────────────────────────────────

function ColumnPanel({
  stdOptions,
  customOptions,
  visible,
  onToggle,
  onClose,
}: {
  stdOptions: ColDef[];
  customOptions: ColDef[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white border border-gray-200
                    rounded-xl shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Sichtbare Spalten</span>
        <button onClick={onClose} className="text-xs text-primary-600 hover:underline">
          Schließen
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Standard</p>
        {stdOptions.map((col) => (
          <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
            <input
              type="checkbox"
              checked={visible.has(col.key)}
              onChange={() => onToggle(col.key)}
              className="accent-primary-600"
            />
            {col.label}
          </label>
        ))}
      </div>

      {customOptions.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Benutzerdefiniert</p>
          {customOptions.map((col) => (
            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="accent-primary-600"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function MatrixPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentProject } = useProjectStore();
  const navigate = useNavigate();

  const [selectedPrefix, setSelectedPrefix] = useState<string>('');
  const [showColPanel, setShowColPanel] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(['text', 'active', 'normative', 'reviewed', 'links'])
  );

  const pid = projectId ?? currentProject?.id ?? '';

  // Daten laden
  const { data: docsRes, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', pid],
    queryFn: () => listDocuments(pid),
    enabled: !!pid,
  });
  const documents = docsRes?.data ?? [];

  const { data: itemsRes, isLoading: itemsLoading } = useQuery({
    queryKey: ['items', pid, selectedPrefix],
    queryFn: () => listItems(pid, selectedPrefix),
    enabled: !!pid && !!selectedPrefix,
  });
  const rawItems: Item[] = itemsRes?.data ?? [];

  const { data: attrsRes } = useQuery({
    queryKey: ['attributes'],
    queryFn: getAttributes,
  });
  const attrDefs: AttributeDefinition[] = attrsRes?.data ?? [];

  // Benutzerdefinierte Spalten ableiten
  const customCols: ColDef[] = attrDefs.map((a) => ({
    key: a.key,
    label: a.display_name,
    isCustom: true,
    attrType: a.attr_type,
  }));

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Items sortiert nach Ebene
  const sortedItems = useMemo(
    () => [...rawItems].sort((a, b) => compareLevel(a.level, b.level)),
    [rawItems]
  );

  // Spalten die angezeigt werden (in fester Reihenfolge)
  const activeCols: ColDef[] = [
    ...STD_OPTIONAL.filter((c) => visibleCols.has(c.key)),
    ...customCols.filter((c) => visibleCols.has(c.key)),
  ];

  if (!pid) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Table2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Kein Projekt ausgewählt</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            Zur Projektübersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
        <Table2 className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 shrink-0">Matrix</span>

        {/* Dokument-Auswahl */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {docsLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <select
              className="input max-w-xs py-1 text-sm"
              value={selectedPrefix}
              onChange={(e) => setSelectedPrefix(e.target.value)}
            >
              <option value="">– Dokument wählen –</option>
              {documents.map((doc: any) => (
                <option key={doc.prefix} value={doc.prefix}>
                  {doc.prefix} ({doc.item_count} Items)
                </option>
              ))}
            </select>
          )}

          {selectedPrefix && (
            <span className="text-xs text-gray-400">
              {itemsLoading ? 'Lädt…' : `${sortedItems.length} Anforderungen`}
            </span>
          )}
        </div>

        {/* Spaltenauswahl */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowColPanel((v) => !v)}
            className="btn-secondary py-1 text-xs gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Spalten
            {showColPanel
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />}
          </button>

          {showColPanel && (
            <ColumnPanel
              stdOptions={STD_OPTIONAL}
              customOptions={customCols}
              visible={visibleCols}
              onToggle={toggleCol}
              onClose={() => setShowColPanel(false)}
            />
          )}
        </div>
      </div>

      {/* ── Inhalt ── */}
      {!selectedPrefix ? (
        <div className="flex items-center justify-center flex-1 text-gray-400">
          <div className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Dokument auswählen, um die Matrix anzuzeigen</p>
          </div>
        </div>
      ) : itemsLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
          Keine Anforderungen in diesem Dokument
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            {/* ── Tabellenkopf ── */}
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                {/* Feste Spalten */}
                <th className="sticky top-0 z-10 bg-gray-100 px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap w-24">
                  Ebene
                </th>
                <th className="sticky top-0 z-10 bg-gray-100 px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap w-36">
                  ID
                </th>

                {/* Optionale Spalten */}
                {activeCols.map((col) => (
                  <th
                    key={col.key}
                    className={clsx(
                      'sticky top-0 z-10 bg-gray-100 px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap',
                      col.key === 'text'
                        ? 'text-left min-w-[280px]'
                        : 'text-center w-24'
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Tabelleninhalt ── */}
            <tbody>
              {sortedItems.map((item, idx) => {
                const depth = levelDepth(item.level);
                const isHeader = item.header;
                const isInactive = !item.active;

                return (
                  <tr
                    key={item.uid}
                    className={clsx(
                      'border-b border-gray-100 transition-colors group',
                      isHeader
                        ? 'bg-blue-50 hover:bg-blue-100'
                        : idx % 2 === 0
                          ? 'bg-white hover:bg-primary-50'
                          : 'bg-gray-50/50 hover:bg-primary-50',
                      isInactive && 'opacity-50',
                    )}
                  >
                    {/* Ebene */}
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap align-top">
                      <span
                        style={{ paddingLeft: `${depth * 12}px` }}
                        className="inline-block"
                      >
                        {item.level}
                      </span>
                    </td>

                    {/* UID */}
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <span className={clsx(
                        'font-mono text-xs font-semibold',
                        isHeader ? 'text-blue-700' : 'text-primary-700',
                      )}>
                        {item.uid}
                      </span>
                    </td>

                    {/* Optionale Spalten */}
                    {activeCols.map((col) => (
                      <td
                        key={col.key}
                        className={clsx(
                          'px-3 py-2 align-top text-xs',
                          col.key === 'text' ? 'text-left' : 'text-center',
                          isHeader && col.key === 'text' && 'font-semibold text-blue-800',
                        )}
                      >
                        <CellValue col={col} item={item} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
