import { useQuery } from '@tanstack/react-query';
import { GitCommit, RefreshCw, Info } from 'lucide-react';
import { getItemCommits } from '../../api/client';

interface Props {
  projectId: string;
  uid: string;
}

interface CommitInfo {
  hash: string;
  hash_short: string;
  date: string;
  author: string;
  message: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function GitHistoryTab({ projectId, uid }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['item-commits', projectId, uid],
    queryFn: async () => {
      const res = await getItemCommits(projectId, uid);
      return (res.data ?? []) as CommitInfo[];
    },
    enabled: !!projectId && !!uid,
  });

  const commits = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <GitCommit className="w-4 h-4" />
          Git-Historie
          {commits.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              ({commits.length} Commit{commits.length !== 1 ? 's' : ''})
            </span>
          )}
        </h3>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
          title="Aktualisieren"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Lade Commits …</div>
      ) : isError ? (
        <div className="text-sm text-red-600 py-8 text-center">
          Git-Historie konnte nicht geladen werden.
        </div>
      ) : commits.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-6 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Keine Commits gefunden, die <span className="font-mono font-medium">{uid}</span> referenzieren.
          </p>
          <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Tipp: Erwähne die UID in der Commit-Message, z.&nbsp;B.
            <span className="font-mono bg-gray-100 px-1 rounded">fix: Timeout korrigiert ({uid})</span>
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {commits.map((c) => (
            <li
              key={c.hash}
              className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <GitCommit className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 whitespace-pre-line break-words">
                    {c.message}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                    <span
                      className="font-mono bg-gray-100 px-1.5 py-0.5 rounded"
                      title={c.hash}
                    >
                      {c.hash_short}
                    </span>
                    <span>{c.author}</span>
                    <span>{formatDate(c.date)}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
