import clsx from 'clsx';
import { CheckCircle, XCircle, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import { ValidationStatusInfo } from '../../types';

interface Props {
  info: ValidationStatusInfo | null | undefined;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG = {
  APPROVED: {
    label: 'Validiert',
    icon: CheckCircle,
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  REJECTED: {
    label: 'Abgelehnt',
    icon: XCircle,
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  NEEDS_REVISION: {
    label: 'Revision nötig',
    icon: AlertCircle,
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
} as const;

export default function ValidationBadge({ info, size = 'sm' }: Props) {
  const isOutdated = info?.status === 'APPROVED' && !info.fingerprint_is_current;
  const status = info?.status;

  if (!status) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded border font-medium',
          size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
          'bg-gray-50 text-gray-500 border-gray-200',
        )}
        title="Noch nicht validiert"
      >
        <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Nicht validiert
      </span>
    );
  }

  if (isOutdated) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded border font-medium',
          size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
          'bg-orange-50 text-orange-700 border-orange-200',
        )}
        title="Anforderung wurde nach der Validierung geändert – Re-Validierung erforderlich"
      >
        <AlertTriangle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Veraltet
      </span>
    );
  }

  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        cfg.className,
      )}
      title={info?.validation_date ? `Validiert am ${info.validation_date}` : undefined}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {cfg.label}
    </span>
  );
}
