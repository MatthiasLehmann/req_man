import { useQuery } from '@tanstack/react-query';
import { GitCommit, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { getValidationHistory } from '../../api/client';
import { ValidationReport, ValidationStatus } from '../../types';

const STATUS_STYLE: Record<ValidationStatus, string> = {
  APPROVED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  NEEDS_REVISION: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const STATUS_LABEL: Record<ValidationStatus, string> = {
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  NEEDS_REVISION: 'Revision nötig',
};

const CHECKLIST_LABELS: Record<string, string> = {
  requirement_complete: 'Anforderung vollständig',
  acceptance_criteria_defined: 'Akzeptanzkriterien',
  implementation_linked: 'Implementierung verlinkt',
  tests_passed: 'Tests bestanden',
  peer_review: 'Peer-Review',
  security_audit: 'Sicherheitsaudit',
};

interface ReportCardProps {
  report: ValidationReport;
  isLatest: boolean;
}

function ReportCard({ report, isLatest }: ReportCardProps) {
  const [expanded, setExpanded] = useState(isLatest);

  const checkedCount = Object.values(report.checklist).filter(
    (item) => item.value || item.applicable === false,
  ).length;
  const totalCount = Object.keys(report.checklist).length;

  return (
    <div className={clsx(
      'rounded-lg border overflow-hidden',
      isLatest ? 'border-primary-200 shadow-sm' : 'border-gray-200',
    )}>
      {/* Card-Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <GitCommit className="w-3.5 h-3.5 text-gray-400 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx(
              'inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border',
              STATUS_STYLE[report.status],
            )}>
              {STATUS_LABEL[report.status]}
            </span>
            {isLatest && (
              <span className="text-xs bg-primary-50 text-primary-700 border border-primary-200 px-1.5 py-0.5 rounded">
                Aktuell
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {report.validation_date} · {report.validator.display_name}
            · {checkedCount}/{totalCount} Checks
          </p>
        </div>

        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
      </button>

      {/* Card-Body */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3 bg-gray-50">

          {/* Checkliste */}
          <div className="space-y-1">
            {Object.entries(report.checklist).map(([key, item]) => {
              const na = item.applicable === false;
              return (
                <div key={key} className="flex items-start gap-2">
                  <span className={clsx(
                    'mt-0.5 text-sm shrink-0',
                    na ? 'text-gray-300' : item.value ? 'text-green-500' : 'text-red-400',
                  )}>
                    {na ? '—' : item.value ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={clsx(
                      'text-xs',
                      na ? 'text-gray-400 line-through' : 'text-gray-700',
                    )}>
                      {CHECKLIST_LABELS[key] || key}
                    </span>
                    {item.refs && item.refs.length > 0 && (
                      <span className="ml-2 text-xs text-blue-600 font-mono">
                        {item.refs.join(', ')}
                      </span>
                    )}
                    {item.coverage_percent !== undefined && (
                      <span className="ml-2 text-xs text-gray-400">
                        {item.coverage_percent}%
                      </span>
                    )}
                    {item.reviewer_username && (
                      <span className="ml-2 text-xs text-gray-400">
                        @{item.reviewer_username}
                      </span>
                    )}
                    {na && <span className="ml-1 text-xs text-gray-400">(N/A)</span>}
                    {item.note && (
                      <p className="text-xs text-gray-400 italic mt-0.5">{item.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zusammenfassung */}
          {report.summary && (
            <div className="text-xs text-gray-600 bg-white rounded p-2 border border-gray-100">
              {report.summary}
            </div>
          )}

          {/* Fingerprint */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Fingerprint:</span>
            <span className="font-mono text-xs text-gray-500 truncate">
              {report.requirement_text_hash || '—'}
            </span>
          </div>

          <p className="text-xs text-gray-400 font-mono">{report.validation_id}</p>
        </div>
      )}
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  uid: string;
}

export default function ValidationHistory({ projectId, uid }: Props) {
  const { data, isLoading } = useQuery<ValidationReport[]>({
    queryKey: ['validation-history', projectId, uid],
    queryFn: () => getValidationHistory(projectId, uid).then((r) => r.data),
    enabled: !!projectId && !!uid,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic text-center py-4">
        Noch keine Reviews vorhanden
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((report, idx) => (
        <ReportCard key={report.validation_id} report={report} isLatest={idx === 0} />
      ))}
    </div>
  );
}
