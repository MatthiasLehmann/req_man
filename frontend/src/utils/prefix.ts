/**
 * Dokument-Präfixe folgen der doorstop-UID-Grammatik: Buchstaben, Zahlen
 * sowie '_', '-' und '.'. Sie müssen mit einem Buchstaben beginnen und
 * dürfen nicht mit einem Trennzeichen enden. Muss zur serverseitigen
 * Validierung in backend/models.py (validate_prefix) passen.
 */

/** Filtert beim Tippen unzulässige Zeichen heraus und schreibt groß. */
export const sanitizePrefixInput = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9_.-]/g, '');

/** Vollständige Prüfung beim Absenden. Gibt eine Fehlermeldung oder null zurück. */
export const validatePrefix = (prefix: string): string | null => {
  const p = prefix.trim();
  if (!p) return 'Präfix darf nicht leer sein';
  if (!/^[A-Z][A-Z0-9_.-]*$/i.test(p)) {
    return "Präfix muss mit einem Buchstaben beginnen und darf nur Buchstaben, Zahlen, '_', '-' und '.' enthalten";
  }
  if (/[-_.]$/.test(p)) return "Präfix darf nicht mit '-', '_' oder '.' enden";
  if (p.toLowerCase() === 'all') return "'ALL' ist in doorstop reserviert und kein gültiges Präfix";
  return null;
};

/** UID-Trennzeichen zwischen Präfix und Nummer (doorstop SEP_CHARS plus "kein"). */
export const SEP_OPTIONS: { value: string; label: string }[] = [
  { value: '-', label: 'Bindestrich (REQ-001)' },
  { value: '_', label: 'Unterstrich (REQ_001)' },
  { value: '.', label: 'Punkt (REQ.001)' },
  { value: '', label: 'Kein Trennzeichen (REQ001)' },
];

/**
 * Prüft, ob das gewählte Trennzeichen zum Präfix passt. Ohne Trennzeichen
 * kann doorstop UIDs wie "REQ2001" oder "MY_DOC001" nicht eindeutig in
 * Präfix und Nummer zerlegen.
 */
export const validateSepForPrefix = (prefix: string, sep: string): string | null => {
  if (sep === '' && (/\d$/.test(prefix) || /[-_.]/.test(prefix))) {
    return "Endet das Präfix auf eine Zahl oder enthält es '-', '_' oder '.', ist ein Trennzeichen erforderlich";
  }
  return null;
};
