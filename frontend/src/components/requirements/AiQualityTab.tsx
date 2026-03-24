import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { useAiQuality, useTriggerAiQuality, useAiQualityProfiles } from '../../hooks/useAiQuality';
import type { AiQualityIssue, AiQualitySeverity } from '../../types';

interface Props {
  projectId: string;
  uid: string;
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBgColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function scoreBorderColor(score: number): string {
  if (score >= 70) return 'border-green-200 bg-green-50';
  if (score >= 40) return 'border-yellow-200 bg-yellow-50';
  return 'border-red-200 bg-red-50';
}

const SEVERITY_CONFIG: Record<AiQualitySeverity, { label: string; icon: typeof AlertCircle; classes: string }> = {
  critical: { label: 'Kritisch', icon: AlertCircle, classes: 'bg-red-100 text-red-700 border-red-200' },
  high:     { label: 'Hoch',     icon: AlertTriangle, classes: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium:   { label: 'Mittel',   icon: AlertTriangle, classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:      { label: 'Niedrig',  icon: Info,          classes: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const SEVERITY_ORDER: AiQualitySeverity[] = ['critical', 'high', 'medium', 'low'];

// ─── Score-Balken ────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value?: number }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div
          className={clsx('h-1.5 rounded-full transition-all', scoreBgColor(value))}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={clsx('text-xs font-medium w-8 text-right', scoreColor(value))}>
        {value}
      </span>
    </div>
  );
}

// ─── Issue-Karte ─────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: AiQualityIssue }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium;
  const Icon = cfg.icon;

  return (
    <div className={clsx('border rounded-lg overflow-hidden', cfg.classes)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-start gap-2"
      >
        <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {issue.category}
            </span>
            <span className="text-[10px] font-medium border rounded px-1 py-0.5 opacity-60 bg-white/50">
              {cfg.label}
            </span>
          </div>
          <p className="text-xs mt-0.5 leading-snug">{issue.description}</p>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 pt-0.5 border-t border-current/10">
          <p className="text-[11px] font-medium mb-0.5 opacity-70">Verbesserungsvorschlag:</p>
          <p className="text-xs leading-snug">{issue.suggestion}</p>
        </div>
      )}
    </div>
  );
}

// ─── Haupt-Tab-Komponente ────────────────────────────────────────────────────

export default function AiQualityTab({ projectId, uid }: Props) {
  const [selectedProfile, setSelectedProfile] = useState('standard');

  const { data: result, isLoading: isLoadingResult } = useAiQuality(projectId, uid);
  const { data: profiles } = useAiQualityProfiles();
  const triggerMut = useTriggerAiQuality(projectId, uid);

  const handleAnalyze = () => {
    triggerMut.mutate({ profile: selectedProfile });
  };

  const isAnalyzing = triggerMut.isPending;
  const error = triggerMut.error as any;

  // ── Leerzustand ────────────────────────────────────────────────────────────
  if (!isLoadingResult && !result && !isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="p-4 rounded-full bg-primary-50">
          <Sparkles className="w-8 h-8 text-primary-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Noch nicht geprüft</p>
          <p className="text-xs text-gray-500 mt-1">
            Klicke auf „Jetzt prüfen", um eine KI-Qualitätsanalyse zu starten.
          </p>
        </div>
        <ProfileSelector
          profiles={profiles}
          selected={selectedProfile}
          onChange={setSelectedProfile}
        />
        <button onClick={handleAnalyze} className="btn-primary flex items-center gap-1.5 text-sm">
          <Sparkles className="w-4 h-4" />
          Jetzt prüfen
        </button>
        {error && <ErrorBanner message={error?.response?.data?.detail || error?.message} />}
      </div>
    );
  }

  // ── Lade-Zustand (neue Analyse läuft) ─────────────────────────────────────
  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
        <p className="text-sm font-medium text-gray-600">KI analysiert Anforderung…</p>
        <p className="text-xs text-gray-400">Dies kann bis zu 15 Sekunden dauern.</p>
      </div>
    );
  }

  // ── Ergebnis-Ansicht ───────────────────────────────────────────────────────
  if (result) {
    const sortedIssues = [...result.issues].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    return (
      <div className="space-y-4">
        {/* ── Score-Header ── */}
        <div className={clsx('rounded-lg border p-4', scoreBorderColor(result.score.overall))}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className={clsx('text-3xl font-bold', scoreColor(result.score.overall))}>
                {result.score.overall}
              </span>
              <span className="text-sm text-gray-500 ml-1">/ 100</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">
                {new Date(result.timestamp).toLocaleString('de-DE')}
              </p>
              <p className="text-[10px] text-gray-400">
                {result.profile_used} · {result.model_used}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 italic">{result.summary}</p>
        </div>

        {/* ── Kategorie-Scores ── */}
        {(result.score.clarity !== undefined ||
          result.score.testability !== undefined ||
          result.score.completeness !== undefined ||
          result.score.consistency !== undefined) && (
          <div className="space-y-1.5 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Kategorien
            </p>
            <ScoreBar label="Eindeutigkeit" value={result.score.clarity} />
            <ScoreBar label="Testbarkeit" value={result.score.testability} />
            <ScoreBar label="Vollständigkeit" value={result.score.completeness} />
            <ScoreBar label="Konsistenz" value={result.score.consistency} />
          </div>
        )}

        {/* ── Issues ── */}
        {sortedIssues.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Probleme ({sortedIssues.length})
            </p>
            <div className="space-y-2">
              {sortedIssues.map((issue, i) => (
                <IssueCard key={i} issue={issue} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Sparkles className="w-4 h-4 text-green-500" />
            <p className="text-xs text-green-700">Keine Probleme gefunden. Anforderung ist qualitativ hochwertig.</p>
          </div>
        )}

        {/* ── Erneut prüfen ── */}
        <div className="flex items-center gap-2 pt-1">
          <ProfileSelector
            profiles={profiles}
            selected={selectedProfile}
            onChange={setSelectedProfile}
          />
          <button
            onClick={handleAnalyze}
            className="btn-ghost flex items-center gap-1.5 text-xs py-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Erneut prüfen
          </button>
        </div>
        {error && <ErrorBanner message={error?.response?.data?.detail || error?.message} />}
      </div>
    );
  }

  return null;
}

// ─── Hilfskomponenten ────────────────────────────────────────────────────────

function ProfileSelector({
  profiles,
  selected,
  onChange,
}: {
  profiles?: string[];
  selected: string;
  onChange: (v: string) => void;
}) {
  if (!profiles || profiles.length <= 1) return null;

  const PROFILE_LABELS: Record<string, string> = {
    standard: 'INCOSE Standard',
    do178c: 'DO-178C',
    iso26262: 'ISO 26262',
    aspice: 'ASPICE',
  };

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="input text-xs py-1"
    >
      {profiles.map((p) => (
        <option key={p} value={p}>
          {PROFILE_LABELS[p] || p}
        </option>
      ))}
    </select>
  );
}

function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg w-full">
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <p className="text-xs text-red-700">{message}</p>
    </div>
  );
}
