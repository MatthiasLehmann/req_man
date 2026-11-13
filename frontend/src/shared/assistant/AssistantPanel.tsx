import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, FileText, Loader2, Send, X } from 'lucide-react';
import clsx from 'clsx';
import { askAssistant, getNextSteps, type AssistantSource } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import { useOpenRequirement } from '../search';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: AssistantSource[];
  error?: boolean;
}

/** Drei Beispiel-Fragen passend zur aktuellen Seite. */
function exampleQuestions(path: string, projectName?: string): string[] {
  const topic = projectName ? projectName.split(/[\s_-]+/).find((w) => w.length >= 4) : undefined;
  const projectQuestion = topic ? `Welche Anforderungen betreffen ${topic}?` : 'Was ist doorstop und wo liegen meine Dateien?';
  if (path.startsWith('/requirements')) {
    return ['Wie verlinke ich eine Anforderung?', 'Was bedeutet OUTDATED?', projectQuestion];
  }
  if (path.startsWith('/linking')) {
    return ['Wie verlinke ich Anforderungen?', 'Wie lese ich die Matrix?', projectQuestion];
  }
  if (path.startsWith('/matrix') || path.startsWith('/traceability') || path.startsWith('/metrics')) {
    return ['Wie lese ich Traceability und Matrix?', 'Was bedeutet „ohne Ableitung“?', projectQuestion];
  }
  if (path.startsWith('/document-structure')) {
    return ['Wie lege ich ein Dokument an?', 'Was ist ein Eltern-Dokument?', projectQuestion];
  }
  if (path.startsWith('/admin')) {
    return ['Wie lege ich eigene Attribute an?', 'Welche Rollen gibt es?', 'Wie lege ich Benutzer an?'];
  }
  return ['Wie lege ich ein neues Projekt an?', 'Wie lade ich eine Excel-Datei?', projectQuestion];
}

/** Antworttext mit anklickbaren Verweisen [SRS012] / [H2]. */
function AnswerText({ text, sources, onSource }: {
  text: string;
  sources: AssistantSource[];
  onSource: (s: AssistantSource) => void;
}) {
  const byRef = new Map(sources.map((s) => [s.ref.toUpperCase(), s]));
  const parts = text.split(/(\[[^\[\]\s]{1,40}\])/g);
  return (
    <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(/^\[([^\]]+)\]$/);
        const src = m ? byRef.get(m[1].toUpperCase()) : undefined;
        if (!src) return <Fragment key={i}>{part}</Fragment>;
        return (
          <button
            key={i}
            onClick={() => onSource(src)}
            title={src.title}
            className={clsx(
              'inline-flex items-center rounded px-1 mx-0.5 text-xs font-mono font-semibold align-baseline',
              src.kind === 'item' ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
            )}
          >
            {src.ref}
          </button>
        );
      })}
    </p>
  );
}

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const openRequirement = useOpenRequirement();
  const project = useProjectStore((s) => s.currentProject);
  const prefix = useProjectStore((s) => (project ? s.requirementsPrefix[project.id] : undefined));
  const uid = useProjectStore((s) => (project ? s.requirementsUid[project.id] : undefined));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: steps, isLoading: stepsLoading } = useQuery({
    queryKey: ['next-steps', project?.id],
    queryFn: async () => (await getNextSteps(project!.id)).data,
    enabled: !!project,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [turns, busy]);

  const onRequirementsPage = location.pathname.startsWith('/requirements');

  const openSource = (s: AssistantSource) => {
    if (s.kind === 'item' && project && s.uid) {
      openRequirement(project.id, s.prefix ?? '', s.uid);
    } else if (s.kind === 'help') {
      navigate(`/help#${s.anchor ?? ''}`);
    }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await askAssistant({
        project_id: project?.id ?? null,
        question: q,
        context: {
          route: location.pathname,
          prefix: onRequirementsPage ? prefix ?? null : null,
          uid: onRequirementsPage ? uid ?? null : null,
        },
        history,
      });
      setTurns((t) => [...t, { role: 'assistant', content: res.data.answer, sources: res.data.sources }]);
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      const msg = status === 503
        ? 'Die Suche ist nicht verfügbar (Embedding-Modell nicht erreichbar).'
        : 'Das Sprachmodell ist nicht erreichbar.';
      setTurns((t) => [...t, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 w-[400px] max-w-full bg-white border-l border-gray-200 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Frag ReqMan</h2>
          <p className="text-xs text-gray-500">Antworten aus der Hilfe und deinem Projekt, mit Quellen</p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5" title="Schließen">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Was steht als Nächstes an? – sofort, ohne Sprachmodell */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Was steht als Nächstes an?</h3>
          {!project && <p className="text-sm text-gray-600">Wähle zuerst ein Projekt im Dashboard.</p>}
          {project && stepsLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {project && steps && steps.length === 0 && (
            <p className="text-sm text-gray-600">Nichts Offenes – alles verlinkt, gestempelt und geprüft.</p>
          )}
          <div className="space-y-1.5">
            {steps?.slice(0, 4).map((s) => (
              <button
                key={s.key}
                onClick={() => navigate(s.route)}
                title={s.explanation}
                className="w-full text-left flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
              >
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-primary-500 shrink-0" />
                <span>
                  <span className="block text-sm text-gray-800">{s.title}</span>
                  {s.uids.length > 0 && (
                    <span className="block text-[11px] font-mono text-gray-400 truncate">{s.uids.slice(0, 5).join(', ')}{s.count > 5 ? ' …' : ''}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        {turns.length === 0 && (
          <section>
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Beispiel-Fragen</h3>
            <div className="flex flex-col gap-1.5">
              {exampleQuestions(location.pathname, project?.name).map((q) => (
                <button key={q} onClick={() => ask(q)} className="btn-secondary text-left text-sm justify-start">
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}

        {turns.map((t, i) => (
          <div key={i} className={clsx('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            {t.role === 'user' ? (
              <p className="max-w-[85%] rounded-lg bg-primary-600 text-white text-sm px-3 py-2">{t.content}</p>
            ) : (
              <div className={clsx('max-w-[95%] rounded-lg border px-3 py-2 space-y-2',
                t.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50')}>
                <AnswerText text={t.content} sources={t.sources ?? []} onSource={openSource} />
                {t.sources && t.sources.length > 0 && (
                  <ul className="border-t border-gray-200 pt-2 space-y-1">
                    {t.sources.map((s) => (
                      <li key={s.ref}>
                        <button onClick={() => openSource(s)} className="flex items-start gap-1.5 text-left text-xs text-gray-600 hover:text-primary-700">
                          {s.kind === 'item' ? <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                          <span><span className="font-mono font-semibold">{s.ref}</span> {s.kind === 'help' ? s.title : s.snippet.slice(0, 90)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> ReqMan sucht und antwortet …
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-gray-200 p-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
      >
        <input
          className="input flex-1 text-sm"
          placeholder="Frage zu ReqMan oder zum Projekt …"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary px-3" disabled={busy || !input.trim()} title="Senden">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
