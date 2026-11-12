import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, MessageSquare, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { applyRoundtrip, compareRoundtrip, type RoundtripCompare } from '../../../../shared/api/client';

interface Props {
  projectId: string;
  file: File;
  onClose: () => void;
  onApplied: (prefix: string) => void;
}

type Change = RoundtripCompare['changes'][number];

/**
 * Excel-Rückweg: zeigt jede Änderung aus der Excel-Datei gegenüber dem aktuellen ReqMan-Stand.
 * Übernommen wird nur, was angehakt ist; fehlerhafte Zeilen lassen sich nicht anhaken.
 * Konflikte (seit dem Export auch in ReqMan geändert) sind zunächst nicht angehakt.
 */
export default function RoundtripDialog({ projectId, file, onClose, onApplied }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['roundtrip-compare', projectId, file.name, file.lastModified, file.size],
    queryFn: async () => (await compareRoundtrip(projectId, file)).data,
    retry: false,
    gcTime: 0,
  });

  const edits = useMemo(() => (data?.changes ?? []).filter((c) => c.fields.length || c.errors.length), [data]);
  const commentsOnly = useMemo(() => (data?.changes ?? []).filter((c) => !c.fields.length && !c.errors.length && c.comment), [data]);
  const newRows = data?.new ?? [];

  const [uids, setUids] = useState<Set<string> | null>(null);
  const [rows, setRows] = useState<Set<number> | null>(null);
  // Vorauswahl: alles Gültige ohne Konflikt
  const selUids = uids ?? new Set(edits.filter((c) => c.patch && !c.conflicts.length).map((c) => c.uid));
  const selRows = rows ?? new Set(newRows.filter((n) => n.item).map((n) => n.row));
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    apply(next);
  };

  const [busy, setBusy] = useState(false);
  const count = selUids.size + selRows.size;
  const errorCount = edits.filter((c) => c.errors.length).length + newRows.filter((n) => n.errors.length).length;

  const apply = async () => {
    if (!data || !count) return;
    setBusy(true);
    try {
      const res = await applyRoundtrip(projectId, file, [...selUids], [...selRows]);
      const { updated, created } = res.data;
      toast.success(`${updated.length} geändert, ${created.length} neu angelegt`);
      qc.invalidateQueries({ queryKey: ['items', projectId, data.prefix] });
      qc.invalidateQueries({ queryKey: ['item', projectId] });
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      onApplied(data.prefix);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Übernahme fehlgeschlagen – es wurde nichts geändert');
    } finally {
      setBusy(false);
    }
  };

  const detail = (error as any)?.response?.data?.detail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">
              Änderungen aus Excel{data ? ` – Dokument ${data.prefix}` : ''}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {file.name}{data?.exported ? ` · exportiert am ${new Date(data.exported).toLocaleString('de-DE')}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5 text-sm">
          {isLoading && <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Datei wird mit ReqMan verglichen …</div>}
          {error && <div className="text-red-600">{detail || 'Datei konnte nicht verglichen werden'}</div>}

          {data && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Chip tone="blue">{edits.length} geändert</Chip>
                <Chip tone="green">{newRows.length} neu</Chip>
                <Chip tone="yellow">{data.changes.filter((c) => c.comment).length + newRows.filter((n) => n.comment).length} Kommentare</Chip>
                {errorCount > 0 && <Chip tone="red">{errorCount} mit Fehlern</Chip>}
                <Chip tone="gray">{data.unchanged} unverändert</Chip>
              </div>

              {!edits.length && !newRows.length && !commentsOnly.length && (
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" /> Die Datei enthält keine Änderungen gegenüber ReqMan.
                </div>
              )}

              {edits.length > 0 && (
                <Section title="Geänderte Anforderungen">
                  {edits.map((c) => (
                    <EditCard key={c.uid + c.row} change={c} checked={selUids.has(c.uid)}
                              onToggle={() => toggle(selUids, c.uid, setUids)} />
                  ))}
                </Section>
              )}

              {newRows.length > 0 && (
                <Section title="Neue Zeilen (ohne ID)">
                  {newRows.map((n) => (
                    <Card key={n.row} disabled={!n.item} checked={selRows.has(n.row)}
                          onToggle={() => toggle(selRows, n.row, setRows)}
                          head={<><span className="text-xs text-gray-400">Zeile {n.row}</span><span className="text-green-700 text-xs font-medium">neu</span></>}>
                      <p className="text-gray-800 whitespace-pre-wrap">{n.text}</p>
                      <Messages errors={n.errors} notes={n.notes.filter((t) => !t.startsWith('Level '))} />
                      {n.comment && <Comment text={n.comment} />}
                    </Card>
                  ))}
                </Section>
              )}

              {commentsOnly.length > 0 && (
                <Section title="Nur kommentiert">
                  {commentsOnly.map((c) => (
                    <div key={c.uid} className="rounded-lg border border-gray-200 px-3 py-2">
                      <div className="text-xs"><span className="font-mono font-semibold text-gray-700">{c.uid}</span>
                        <span className="text-gray-500 ml-2">{c.label}</span></div>
                      <Comment text={c.comment} />
                    </div>
                  ))}
                </Section>
              )}

              {(data.not_in_file.length > 0 || data.ignored_columns.length > 0 || data.changes.some((c) => c.comment) || newRows.some((n) => n.comment)) && (
                <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
                  {data.not_in_file.length > 0 && (
                    <p>{data.not_in_file.length} Anforderung(en) fehlen in der Datei ({data.not_in_file.join(', ')}) – sie werden in ReqMan <b>nicht</b> gelöscht.</p>
                  )}
                  {data.ignored_columns.length > 0 && <p>Nicht berücksichtigte Spalten: {data.ignored_columns.join(', ')}</p>}
                  <p>Kommentare werden nicht in ReqMan gespeichert; sie dienen hier als Hinweis für die Übernahme.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500 mr-auto">Jede Änderung wurde geprüft. Übernommen wird nur, was angehakt ist – alles oder nichts.</span>
          <button onClick={onClose} className="btn-secondary text-sm py-2">Abbrechen</button>
          <button onClick={apply} disabled={!count || busy} className="btn-primary text-sm py-2 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {count} übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bausteine ─────────────────────────────────────────────────────────────────

function Chip({ tone, children }: { tone: 'blue' | 'green' | 'yellow' | 'red' | 'gray'; children: React.ReactNode }) {
  const cls = {
    blue: 'bg-blue-50 text-blue-700', green: 'bg-green-50 text-green-700', yellow: 'bg-yellow-50 text-yellow-800',
    red: 'bg-red-50 text-red-700', gray: 'bg-gray-100 text-gray-600',
  }[tone];
  return <span className={clsx('px-2 py-0.5 rounded-full font-medium', cls)}>{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Card({ checked, disabled, onToggle, head, children }: {
  checked: boolean; disabled: boolean; onToggle: () => void; head: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <label className={clsx('flex gap-3 rounded-lg border px-3 py-2',
      disabled ? 'border-red-200 bg-red-50/40' : checked ? 'border-blue-300 bg-blue-50/40 cursor-pointer' : 'border-gray-200 cursor-pointer')}>
      <input type="checkbox" className="mt-1" checked={checked && !disabled} disabled={disabled} onChange={onToggle} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">{head}</div>
        {children}
      </div>
    </label>
  );
}

function EditCard({ change: c, checked, onToggle }: { change: Change; checked: boolean; onToggle: () => void }) {
  return (
    <Card checked={checked} disabled={!c.patch} onToggle={onToggle}
          head={<><span className="font-mono text-xs font-semibold text-gray-700">{c.uid}</span>
            <span className="text-xs text-gray-500 truncate">{c.label}</span></>}>
      {c.fields.length > 0 && (
        <table className="w-full text-xs table-fixed">
          <thead><tr className="text-gray-400 text-left">
            <th className="font-normal w-36 pr-2">Feld</th><th className="font-normal pr-2 w-[42%]">jetzt in ReqMan</th><th className="font-normal">aus Excel</th>
          </tr></thead>
          <tbody>
            {c.fields.map((f) => (
              <tr key={f.field} className="align-top">
                <td className="pr-2 py-0.5 text-gray-600">
                  {f.label}
                  {f.conflict && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-amber-500" />}
                </td>
                <td className="pr-2 py-0.5 text-red-700/80 line-through decoration-red-300 whitespace-pre-wrap">{f.old || <i className="no-underline text-gray-400">leer</i>}</td>
                <td className="py-0.5 text-green-800 whitespace-pre-wrap">{f.new || <i className="text-gray-400">leer</i>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.conflicts.length > 0 && (
        <p className="text-xs text-amber-700 flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {c.conflicts.join('; ')} – mit Haken wird der ReqMan-Wert durch den Excel-Wert ersetzt.
        </p>
      )}
      <Messages errors={c.errors} notes={[]} />
      {c.comment && <Comment text={c.comment} />}
    </Card>
  );
}

function Messages({ errors, notes }: { errors: string[]; notes: string[] }) {
  if (!errors.length && !notes.length) return null;
  return (
    <ul className="text-xs space-y-0.5">
      {errors.map((e) => <li key={e} className="text-red-700 flex items-start gap-1"><XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e}</li>)}
      {notes.map((n) => <li key={n} className="text-gray-500">{n}</li>)}
    </ul>
  );
}

function Comment({ text }: { text: string }) {
  return (
    <p className="text-xs bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-yellow-900 flex items-start gap-1.5 whitespace-pre-wrap">
      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />{text}
    </p>
  );
}
