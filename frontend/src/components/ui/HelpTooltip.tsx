import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
  title?: string;
  /** Bevorzugte Anzeigerichtung: 'top' | 'bottom' | 'right'. Standard: 'top' */
  placement?: 'top' | 'bottom' | 'right';
  className?: string;
}

const TOOLTIP_WIDTH = 256; // w-64
const TOOLTIP_GAP = 10;   // Abstand zwischen Icon und Tooltip

/**
 * Zeigt ein ⓘ-Icon, das beim Hovern/Klicken einen Hilfetext als Tooltip anzeigt.
 * Der Tooltip wird via Portal in document.body gerendert, damit kein übergeordnetes
 * overflow:hidden oder Stacking-Context ihn abschneiden kann.
 */
export default function HelpTooltip({
  text,
  title,
  placement = 'top',
  className = '',
}: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  /** Berechnet Position und Richtung anhand von getBoundingClientRect + scroll. */
  const recalc = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Verfügbarer Platz in jede Richtung
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceRight = window.innerWidth - r.right;

    let dir = placement;
    if (placement === 'top' && spaceAbove < 130)
      dir = spaceBelow >= 130 ? 'bottom' : 'right';
    else if (placement === 'bottom' && spaceBelow < 130)
      dir = spaceAbove >= 130 ? 'top' : 'right';
    else if (placement === 'right' && spaceRight < TOOLTIP_WIDTH + TOOLTIP_GAP)
      dir = spaceAbove >= 130 ? 'top' : 'bottom';

    setResolvedPlacement(dir);

    let top = 0;
    let left = 0;

    if (dir === 'top') {
      // Tooltip erscheint oberhalb; wir kennen die Höhe noch nicht →
      // setzen erst mal; nach Render wird ggf. nachjustiert (s. useEffect unten)
      top = r.top + scrollY - TOOLTIP_GAP;   // wird nach Render mit echter Höhe korrigiert
      left = r.left + scrollX + r.width / 2 - TOOLTIP_WIDTH / 2;
    } else if (dir === 'bottom') {
      top = r.bottom + scrollY + TOOLTIP_GAP;
      left = r.left + scrollX + r.width / 2 - TOOLTIP_WIDTH / 2;
    } else {
      // right
      top = r.top + scrollY + r.height / 2;  // wird nach Render mit echter Höhe korrigiert
      left = r.right + scrollX + TOOLTIP_GAP;
    }

    // Horizontal nicht über den Viewport laufen lassen
    left = Math.max(8 + scrollX, Math.min(left, window.innerWidth + scrollX - TOOLTIP_WIDTH - 8));

    setCoords({ top, left });
  }, [placement]);

  /** Nach dem Rendern des Tooltips echte Höhe verwenden, um top zu korrigieren. */
  useEffect(() => {
    if (!visible || !tooltipRef.current || !coords) return;
    const h = tooltipRef.current.offsetHeight;
    if (resolvedPlacement === 'top') {
      setCoords((c) => c ? { ...c, top: c.top - h } : c);
    } else if (resolvedPlacement === 'right') {
      setCoords((c) => c ? { ...c, top: c.top - h / 2 } : c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resolvedPlacement]);

  const show = useCallback(() => {
    recalc();
    setVisible(true);
  }, [recalc]);

  const hide = useCallback(() => setVisible(false), []);

  // Klick außerhalb schließt Tooltip
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) === false &&
        tooltipRef.current?.contains(e.target as Node) === false
      ) setVisible(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  // Pfeil-Klassen (zeigt vom Tooltip zum Icon)
  const arrowClass: Record<string, string> = {
    top:    'top-full left-1/2 -translate-x-1/2 border-l border-b',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-r border-t',
    right:  'right-full top-1/2 -translate-y-1/2 border-b border-l',
  };

  const tooltip =
    visible && coords
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'absolute',
              top: coords.top,
              left: coords.left,
              width: TOOLTIP_WIDTH,
              zIndex: 99999,
            }}
            className="bg-white border border-blue-200 rounded-lg shadow-2xl pointer-events-auto"
          >
            {/* Pfeil */}
            <span
              className={`
                absolute w-2.5 h-2.5 bg-white rotate-45
                border-blue-200
                ${arrowClass[resolvedPlacement]}
              `}
            />
            {/* Inhalt */}
            <div className="relative p-3">
              {title && (
                <p className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 shrink-0" />
                  {title}
                </p>
              )}
              <p className="text-xs text-gray-600 leading-relaxed whitespace-normal break-words">
                {text}
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (visible ? hide() : show())}
        className="inline-flex items-center justify-center text-gray-400 hover:text-primary-500
                   focus:outline-none focus:text-primary-500 transition-colors rounded-full"
        aria-label="Hilfe anzeigen"
        aria-expanded={visible}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {tooltip}
    </span>
  );
}

// ─── FieldLabel: Label + optionaler Pflichtmarkierung + Tooltip ──────────────

interface FieldLabelProps {
  children: React.ReactNode;
  helpText?: string;
  helpTitle?: string;
  required?: boolean;
  htmlFor?: string;
  placement?: HelpTooltipProps['placement'];
}

/**
 * Kombiniertes Label mit optionalem Hilfe-Tooltip.
 * Ersetzt das manuelle <label>-Tag überall im ItemEditor.
 */
export function FieldLabel({
  children,
  helpText,
  helpTitle,
  required,
  htmlFor,
  placement,
}: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1 mb-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-gray-600 select-none"
      >
        {children}
      </label>
      {required && (
        <span className="text-red-500 text-xs" title="Pflichtfeld">*</span>
      )}
      {helpText && (
        <HelpTooltip text={helpText} title={helpTitle} placement={placement} />
      )}
    </div>
  );
}
