import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import type { Item } from '../../../../shared/types';

/** Struktur, die die Tabelle an die Ansicht übergibt (Spalten aus RequirementsTable). */
interface ColLike { id: string; label: string; kind: string; required?: boolean }

export interface SortState { id: string; dir: 1 | -1 }

interface Saved { hidden: string[]; filtersOpen: boolean }

const keyFor = (prefix: string) => `reqman_table_view_${prefix}`;

function load(prefix: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(prefix)) || '{}');
    return { hidden: Array.isArray(raw.hidden) ? raw.hidden : [], filtersOpen: !!raw.filtersOpen };
  } catch { return { hidden: [], filtersOpen: false }; }
}

/**
 * Spaltenwahl, Spaltenfilter und Sortierung der Tabellenansicht (D3). Sichtbare Spalten und die Filterleiste
 * werden je Dokument im Browser gemerkt; Filtertexte und Sortierung gelten nur für die Sitzung.
 * Pflichtspalten lassen sich nicht ausblenden, damit die Zeile „neu“ immer vollständig bleibt.
 */
export function useColumnView<C extends ColLike>(prefix: string, all: C[]) {
  const [saved, setSaved] = useState<Saved>(() => load(prefix));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState | null>(null);

  const persist = (next: Saved) => {
    setSaved(next);
    try { localStorage.setItem(keyFor(prefix), JSON.stringify(next)); } catch { /* nur für diese Sitzung */ }
  };

  const hidden = new Set(saved.hidden.filter((id) => all.some((c) => c.id === id && !c.required)));
  const shown = all.filter((c) => !hidden.has(c.id));

  return {
    shown, hidden, filters, sort,
    filtersOpen: saved.filtersOpen,
    setFiltersOpen: (v: boolean) => persist({ ...saved, filtersOpen: v }),
    toggle: (id: string) => persist({
      ...saved,
      hidden: hidden.has(id) ? [...hidden].filter((h) => h !== id) : [...hidden, id],
    }),
    reset: () => persist({ ...saved, hidden: [] }),
    setFilter: (id: string, v: string) => setFilters((f) => ({ ...f, [id]: v })),
    /** Klick auf den Spaltenkopf: aufsteigend → absteigend → Standardreihenfolge (Level) */
    cycleSort: (id: string) => setSort((s) =>
      s?.id !== id ? { id, dir: 1 } : s.dir === 1 ? { id, dir: -1 } : null),
  };
}

type Getter<C> = (item: Item, col: C) => unknown;

/** Passt die Zeile zum Filtertext der Spalte? (Teiltext ohne Groß-/Kleinschreibung; Ja/Nein-Spalten: true/false) */
export function columnMatches<C extends ColLike>(
  item: Item, col: C | null, raw: string, value: Getter<C>,
  isBool: (c: C) => boolean,
): boolean {
  const f = raw.trim().toLowerCase();
  if (!f) return true;
  if (!col) return item.uid.toLowerCase().includes(f);
  const v = value(item, col);
  if (isBool(col)) return f === 'true' ? !!v : f === 'false' ? !v : true;
  const text = Array.isArray(v) ? v.join(', ')
    : col.kind === 'text' ? String(v ?? '').replace(/<[^>]*>/g, '')
    : String(v ?? '');
  return text.toLowerCase().includes(f);
}

/** Vergleich zweier Zeilen für die Spaltensortierung (Level und Zahlen numerisch, sonst natürlich nach Text) */
export function compareCells<C extends ColLike>(
  a: Item, b: Item, col: C | null, value: Getter<C>, compareLevel: (x: string, y: string) => number,
): number {
  if (!col) return a.uid.localeCompare(b.uid, 'de', { numeric: true });
  if (col.kind === 'level') return compareLevel(a.level, b.level);
  const va = value(a, col), vb = value(b, col);
  const empty = (v: unknown) => v === undefined || v === null || v === '';
  if (empty(va) !== empty(vb)) return empty(va) ? 1 : -1; // Leere immer ans Ende der Aufsteigend-Sortierung
  if (typeof va === 'boolean' || typeof vb === 'boolean') return Number(!!va) - Number(!!vb);
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  const s = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).replace(/<[^>]*>/g, '');
  return s(va).localeCompare(s(vb), 'de', { numeric: true, sensitivity: 'base' });
}

/** Menü „Spalten“: Häkchen je Spalte. */
export function ColumnPicker<C extends ColLike>({ columns, hidden, onToggle, onReset }: {
  columns: C[]; hidden: Set<string>; onToggle: (id: string) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        title="Spalten ein- und ausblenden"
      >
        <Columns3 className="w-3.5 h-3.5" /> Spalten{hidden.size ? ` (${columns.length - hidden.size}/${columns.length})` : ''}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-60 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">Sichtbare Spalten</span>
            {hidden.size > 0 && <button onClick={onReset} className="text-primary-600 hover:underline">Alle zeigen</button>}
          </div>
          {columns.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-gray-700"
                   title={c.required ? 'Pflichtspalte – bleibt sichtbar' : undefined}>
              <input type="checkbox" checked={!hidden.has(c.id)} disabled={c.required}
                     onChange={() => onToggle(c.id)} className="accent-primary-600" />
              {c.label}{c.required && <span className="text-red-500">*</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
