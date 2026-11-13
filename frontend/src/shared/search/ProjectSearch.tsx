import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import { ragSearch } from '../api/client';
import { useDebounced } from './useDebounced';
import { useOpenRequirement } from './openRequirement';

/** Suche nach Bedeutung im ganzen Projekt (Kopfzeile). */
export default function ProjectSearch({ projectId }: { projectId: string }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = useDebounced(text.trim(), 400);
  const openRequirement = useOpenRequirement();

  const { data, isFetching, error } = useQuery({
    queryKey: ['rag-search', projectId, q],
    queryFn: async () => (await ragSearch(projectId, q, 8)).data,
    enabled: q.length >= 3,
    staleTime: 30_000,
    retry: false,
  });
  const unavailable = (error as { response?: { status?: number } } | null)?.response?.status === 503;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative w-72" ref={boxRef}>
      <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
      <input
        className="input text-sm py-1 pl-8 w-full"
        placeholder="Im Projekt suchen …"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 absolute right-2.5 top-2.5" />}
      {open && q.length >= 3 && (
        <div className="absolute z-50 mt-1 w-[28rem] max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {unavailable && (
            <p className="p-3 text-xs text-gray-500">Suche nicht verfügbar (Embedding-Modell nicht erreichbar).</p>
          )}
          {!unavailable && data && data.length === 0 && <p className="p-3 text-xs text-gray-500">Keine Treffer.</p>}
          {data?.map((hit) => (
            <button
              key={hit.uid}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              onClick={() => { setOpen(false); setText(''); openRequirement(projectId, hit.prefix, hit.uid); }}
            >
              <span className="font-mono text-xs font-semibold text-primary-600">{hit.uid}</span>
              <span className="block text-xs text-gray-600 line-clamp-2">{hit.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
