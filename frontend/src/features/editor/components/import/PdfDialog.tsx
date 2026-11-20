import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  createPdf, getAttributes, getPdfSettings, listDocuments, type PdfRequest,
} from '../../../../shared/api/client';
import { useMarkedItems } from '../../../../shared/store/markedItemsStore';
import { attributesFor } from './tableParsing';

type Template = NonNullable<PdfRequest['template']>;
type Status = 'nicht geprüft' | 'geändert nach Prüfung' | 'geprüft';

const NO_UIDS: string[] = [];
const STATUS: Status[] = ['nicht geprüft', 'geändert nach Prüfung', 'geprüft'];
const APPENDICES: { id: 'trace' | 'offen' | 'glossar'; label: string }[] = [
  { id: 'trace', label: 'Trace-Tabelle' },
  { id: 'offen', label: 'Offene Punkte' },
  { id: 'glossar', label: 'Begriffe / Abkürzungen' },
];
const DOC_STATUS = [
  { id: 'entwurf', label: 'Entwurf' },
  { id: 'pruefung', label: 'Zur Prüfung' },
  { id: 'freigegeben', label: 'Freigegeben' },
] as const;

interface Props {
  projectId: string;
  /** Aktuell gewähltes Dokument; vorbelegt, wenn nichts gespeichert ist */
  selectedPrefix: string | null;
  canEdit: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function Check({ checked, onChange, children, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={clsx('inline-flex items-center gap-1.5 text-sm text-gray-700', disabled && 'opacity-40')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
             className="rounded border-gray-300" />
      {children}
    </label>
  );
}

const inputCls = 'border border-gray-300 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-200';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Dialog „PDF erstellen“: Vorlage, Umfang und Optionen wählen; PDF ansehen oder herunterladen. */
export default function PdfDialog({ projectId, selectedPrefix, canEdit, onClose }: Props) {
  const { data: docsRes } = useQuery({ queryKey: ['documents', projectId], queryFn: () => listDocuments(projectId) });
  const { data: attrsRes } = useQuery({ queryKey: ['attributes'], queryFn: getAttributes });
  const { data: settingsRes, isError: settingsFailed } = useQuery({
    queryKey: ['pdf-settings', projectId], queryFn: () => getPdfSettings(projectId), gcTime: 0,
  });
  const marked = useMarkedItems((s) => (s.projectId === projectId ? s.uids : NO_UIDS));

  const [req, setReq] = useState<PdfRequest | null>(null);
  const [useMarked, setUseMarked] = useState(false);
  const [participants, setParticipants] = useState('');
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vorbelegung aus den gespeicherten Einstellungen (oder den Vorgaben, falls das Lesen scheitert)
  useEffect(() => {
    if (req || (!settingsRes && !settingsFailed)) return;
    const s: PdfRequest = settingsRes?.data ?? {};
    const docs = s.documents?.length ? s.documents : selectedPrefix ? [selectedPrefix] : [];
    setReq({ ...s, documents: docs });
    setParticipants((s.options?.meeting?.participants ?? []).join('\n'));
  }, [settingsRes, settingsFailed, req, selectedPrefix]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const documents = docsRes?.data ?? [];
  const attrs = useMemo(() => {
    const all = attrsRes?.data ?? [];
    const chosen = req?.documents ?? [];
    const list = chosen.length ? chosen.flatMap((p) => attributesFor(p, all)) : all;
    return [...new Map(list.map((a) => [a.key, a])).values()];
  }, [attrsRes, req?.documents]);

  if (!req) {
    return (
      <Shell onClose={onClose}>
        <div className="p-10 flex justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      </Shell>
    );
  }

  const template: Template = req.template ?? 'spezifikation';
  const options = req.options ?? {};
  const meta = options.meta ?? {};
  const meeting = options.meeting ?? {};
  const filter = req.filter ?? {};
  const docIds = req.documents ?? [];

  const patch = (p: Partial<PdfRequest>) => setReq({ ...req, ...p });
  const patchOpt = (p: NonNullable<PdfRequest['options']>) => patch({ options: { ...options, ...p } });
  const patchFilter = (p: NonNullable<PdfRequest['filter']>) => patch({ filter: { ...filter, ...p } });

  /** Anfrage wie abgeschickt: Teilnehmer aus dem Textfeld, markierte UIDs nur auf Wunsch */
  const build = (): PdfRequest => ({
    ...req,
    filter: { ...filter, uids: useMarked ? marked : [] },
    options: {
      ...options,
      meeting: { ...meeting, participants: participants.split('\n').map((p) => p.trim()).filter(Boolean) },
    },
    save_defaults: canEdit && save,
  });

  const run = async (mode: 'view' | 'download') => {
    setBusy(mode);
    setError(null);
    // Neuen Tab sofort öffnen (sonst blockt der Browser das Fenster nach der Wartezeit)
    const tab = mode === 'view' ? window.open('', '_blank') : null;
    try {
      const { blob, filename } = await createPdf(projectId, build());
      const url = URL.createObjectURL(blob);
      if (mode === 'view') {
        if (tab) tab.location.href = url;
        else if (!window.open(url, '_blank')) throw new Error('Der Browser hat das neue Fenster blockiert – bitte „Herunterladen“ nutzen oder Pop-ups erlauben.');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`${filename} heruntergeladen`);
      }
      if (save && canEdit) toast.success('Als Standard für dieses Projekt gespeichert');
    } catch (e: any) {
      tab?.close();
      setError(e.message || 'PDF-Satz fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  const statusChosen = (filter.status ?? []) as Status[];
  const attrFilter = filter.attribute ?? { name: '', value: '' };

  return (
    <Shell onClose={onClose}>
      <div className="p-5 space-y-5 overflow-y-auto">
        <Section title="Vorlage">
          <div className="grid grid-cols-2 gap-2">
            {([
              ['spezifikation', 'Spezifikation', 'Lasten-/Pflichtenheft, Hochformat'],
              ['review', 'Review-Unterlage', 'Tabelle für Meetings, Querformat'],
            ] as const).map(([id, name, hint]) => (
              <button key={id} onClick={() => patch({ template: id })} aria-pressed={template === id}
                      className={clsx('text-left rounded-lg border px-3 py-2 transition-colors',
                        template === id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50')}>
                <div className="text-sm font-medium text-gray-800">{name}</div>
                <div className="text-xs text-gray-500">{hint}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Dokumente">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {documents.map((d) => (
              <Check key={d.prefix} checked={docIds.includes(d.prefix)} onChange={() => patch({ documents: toggle(docIds, d.prefix) })}>
                <span className="font-mono">{d.prefix}</span>
              </Check>
            ))}
            {!documents.length && <span className="text-sm text-gray-400">Keine Dokumente</span>}
          </div>
          <p className="text-xs text-gray-400">Ohne Auswahl: alle Dokumente.</p>
        </Section>

        <Section title="Auswahl der Anforderungen">
          <Check checked={useMarked} disabled={!marked.length} onChange={setUseMarked}>
            Nur markierte Anforderungen ({marked.length})
            {!marked.length && <span className="text-xs text-gray-400"> – in der Tabellenansicht Zeilen abhaken</span>}
          </Check>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-sm text-gray-500">Status:</span>
            {STATUS.map((s) => (
              <Check key={s} checked={statusChosen.includes(s)} onChange={() => patchFilter({ status: toggle(statusChosen, s) })}>{s}</Check>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-gray-500">Geändert seit
              <input className={inputCls} placeholder="Datum (JJJJ-MM-TT) oder Commit" value={filter.changed_since ?? ''}
                     onChange={(e) => patchFilter({ changed_since: e.target.value })} />
            </label>
            <div className="text-sm text-gray-500">Attribut = Wert
              <div className="flex gap-1">
                <select className={inputCls} value={attrFilter.name ?? ''} aria-label="Attribut"
                        onChange={(e) => patchFilter({ attribute: { name: e.target.value, value: attrFilter.value ?? '' } })}>
                  <option value="">–</option>
                  {attrs.map((a) => <option key={a.key} value={a.key}>{a.display_name}</option>)}
                </select>
                <input className={inputCls} placeholder="Wert" value={attrFilter.value ?? ''} aria-label="Wert"
                       onChange={(e) => patchFilter({ attribute: { name: attrFilter.name ?? '', value: e.target.value } })} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Optionen">
          {template === 'spezifikation' && (
            <>
              <div className="flex items-center gap-4 text-sm text-gray-700">
                <span className="text-gray-500">Darstellung:</span>
                {([['fliesstext', 'Fließtext'], ['tabelle', 'Tabelle']] as const).map(([id, name]) => (
                  <label key={id} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="layout" checked={(options.layout ?? 'fliesstext') === id} onChange={() => patchOpt({ layout: id })} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-sm text-gray-500">Anhänge:</span>
                {APPENDICES.map((a) => (
                  <Check key={a.id} checked={(options.appendices ?? []).includes(a.id)}
                         onChange={() => patchOpt({ appendices: toggle(options.appendices ?? [], a.id) })}>{a.label}</Check>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-gray-500">Dokumentnummer
                  <input className={inputCls} value={meta.doc_number ?? ''} onChange={(e) => patchOpt({ meta: { ...meta, doc_number: e.target.value } })} />
                </label>
                <label className="text-sm text-gray-500">Version
                  <input className={inputCls} value={meta.version ?? ''} onChange={(e) => patchOpt({ meta: { ...meta, version: e.target.value } })} />
                </label>
                <label className="text-sm text-gray-500">Status
                  <select className={inputCls} value={meta.status ?? 'entwurf'} onChange={(e) => patchOpt({ meta: { ...meta, status: e.target.value as typeof DOC_STATUS[number]['id'] } })}>
                    {DOC_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="text-sm text-gray-500">Vertraulichkeit
                  <input className={inputCls} placeholder="z. B. intern" value={meta.confidentiality ?? ''} onChange={(e) => patchOpt({ meta: { ...meta, confidentiality: e.target.value } })} />
                </label>
              </div>
            </>
          )}

          {template === 'review' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-gray-500 col-span-2">Titel des Termins
                <input className={inputCls} value={meeting.title ?? ''} onChange={(e) => patchOpt({ meeting: { ...meeting, title: e.target.value } })} />
              </label>
              <label className="text-sm text-gray-500">Datum
                <input className={inputCls} placeholder="JJJJ-MM-TT" value={meeting.date ?? ''} onChange={(e) => patchOpt({ meeting: { ...meeting, date: e.target.value } })} />
              </label>
              <label className="text-sm text-gray-500">Ort / Link
                <input className={inputCls} value={meeting.place ?? ''} onChange={(e) => patchOpt({ meeting: { ...meeting, place: e.target.value } })} />
              </label>
              <label className="text-sm text-gray-500 col-span-2">Teilnehmer (einer je Zeile, leer = zum Ausfüllen)
                <textarea className={inputCls} rows={3} value={participants} onChange={(e) => setParticipants(e.target.value)} />
              </label>
            </div>
          )}

          {!!attrs.length && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-sm text-gray-500">Attribute im PDF:</span>
              {attrs.map((a) => (
                <Check key={a.key} checked={(options.attributes ?? []).includes(a.key)}
                       onChange={() => patchOpt({ attributes: toggle(options.attributes ?? [], a.key) })}>{a.display_name}</Check>
              ))}
            </div>
          )}
        </Section>

      </div>

      {error && (
        <div role="alert" className="mx-5 mb-3 shrink-0 flex gap-2 items-start rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
        <Check checked={save && canEdit} disabled={!canEdit} onChange={setSave}>Als Standard speichern</Check>
        <span className="flex-1" />
        <button onClick={() => run('view')} disabled={!!busy}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50">
          {busy === 'view' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Ansehen
        </button>
        <button onClick={() => run('download')} disabled={!!busy}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
          {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Herunterladen
        </button>
      </div>
    </Shell>
  );
}

function Shell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="PDF erstellen" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <FileText className="w-5 h-5 text-primary-600" />
          <h2 className="flex-1 text-sm font-semibold text-gray-800">PDF erstellen</h2>
          <button onClick={onClose} aria-label="Schließen" className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
