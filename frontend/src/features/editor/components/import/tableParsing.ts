// Hilfsfunktionen für den Tabellen-Import: Zwischenablage lesen und Spalten zuordnen.

import type { AttributeDefinition } from '../../../../shared/types';

/**
 * Liest Text aus der Zwischenablage, wie Excel/LibreOffice/Google Sheets ihn liefern:
 * Spalten per Tab, Zeilen per Zeilenumbruch, Zellen mit Umbruch/Tab/Anführungszeichen
 * in "…" mit verdoppelten Anführungszeichen. Ohne Tab im Text wird ';' bzw. ',' als
 * Trennzeichen versucht (CSV aus einem Texteditor).
 */
export function parseClipboardTable(raw: string): string[][] {
  const text = raw.replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n', 1)[0];
  const sep = text.includes('\t')
    ? '\t'
    : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const singleColumn = !text.includes('\t') && !firstLine.includes(sep);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    if (!singleColumn && c === sep) { row.push(cell); cell = ''; atCellStart = true; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true; continue; }
    cell += c;
    atCellStart = false;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  const cleaned = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
  const width = Math.max(0, ...cleaned.map((r) => r.length));
  return cleaned.map((r) => [...r, ...Array(width - r.length).fill('')]);
}

// ─── Zielfelder ───────────────────────────────────────────────────────────────

export interface TargetField {
  key: string;            // text | header | level | normative | active | links | attr:<key> | '' (ignorieren)
  label: string;
  hint?: string;
  required?: boolean;
}

const STANDARD: TargetField[] = [
  { key: 'text', label: 'Anforderungstext', required: true },
  { key: 'header', label: 'Abschnittsüberschrift', hint: 'Zeile wird zum Abschnitt mit diesem Titel' },
  { key: 'level', label: 'Level (z. B. 1.2)', hint: 'leer = ReqMan vergibt das nächste Level' },
  { key: 'normative', label: 'Normativ (Ja/Nein)' },
  { key: 'active', label: 'Aktiv (Ja/Nein)' },
  { key: 'links', label: 'Links (UIDs)', hint: 'mehrere durch Komma/Semikolon getrennt' },
];

/** Attribute, die für dieses Dokument gelten (applies_to leer = alle). */
export function attributesFor(prefix: string, attrs: AttributeDefinition[]) {
  return attrs.filter((a) => !a.applies_to?.length || a.applies_to.includes(prefix));
}

export function targetFields(prefix: string, attrs: AttributeDefinition[]): TargetField[] {
  return [
    ...STANDARD,
    ...attributesFor(prefix, attrs).map((a) => ({
      key: `attr:${a.key}`,
      label: a.display_name,
      required: a.required,
      hint: a.attr_type === 'enum' && a.possible_values?.length
        ? `erlaubt: ${a.possible_values.join(', ')}`
        : a.help_text ?? undefined,
    })),
  ];
}

// ─── Automatische Zuordnung über Spaltennamen ─────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  text: ['text', 'anforderung', 'anforderungstext', 'beschreibung', 'requirement', 'description', 'inhalt', 'req'],
  header: ['überschrift', 'ueberschrift', 'abschnitt', 'kapitel', 'header', 'heading', 'titel', 'title'],
  level: ['level', 'ebene', 'gliederung', 'kapitelnummer', 'nummerierung', 'abschnittsnummer'],
  normative: ['normativ', 'normative'],
  active: ['aktiv', 'active'],
  links: ['links', 'link', 'verlinkung', 'verweis', 'verweise', 'parent', 'eltern', 'übergeordnet', 'trace', 'quelle'],
};

/** Spaltennamen, die ReqMan bewusst nicht übernimmt (UIDs vergibt doorstop). */
const ID_NAMES = ['id', 'uid', 'nr', 'nr.', 'nummer', 'req-id', 'req id', 'anforderungs-id', 'kennung'];

const norm = (s: string) => s.toLowerCase().replace(/[\s_*:]+/g, ' ').trim();

export function isIdColumn(header: string) {
  return ID_NAMES.includes(norm(header));
}

export function suggestField(header: string, fields: TargetField[]): string {
  const h = norm(header);
  if (!h || isIdColumn(header)) return '';
  for (const f of fields) {
    if (f.key.startsWith('attr:')) {
      const key = f.key.slice(5).toLowerCase();
      if (h === key || h === norm(f.label)) return f.key;
    }
  }
  for (const [key, words] of Object.entries(SYNONYMS)) {
    if (words.includes(h)) return key;
  }
  return '';
}

/** Sieht die erste Zeile wie eine Überschriftenzeile aus? */
export function looksLikeHeaderRow(first: string[], fields: TargetField[]) {
  return first.some((c) => isIdColumn(c) || suggestField(c, fields) !== '');
}

// ─── Gemerkte Zuordnungen (pro Dokument, nach Spaltenname) ────────────────────

const STORE_KEY = (prefix: string) => `reqman_import_mapping:${prefix}`;

export function loadRememberedMapping(prefix: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY(prefix)) || '{}'); }
  catch { return {}; }
}

export function rememberMapping(prefix: string, headers: string[], mapping: string[]) {
  try {
    const prev = loadRememberedMapping(prefix);
    headers.forEach((h, i) => { if (h) prev[norm(h)] = mapping[i] ?? ''; });
    localStorage.setItem(STORE_KEY(prefix), JSON.stringify(prev));
  } catch { /* Speicher nicht verfügbar – Zuordnung gilt dann nur für diesen Import */ }
}

export function initialMapping(
  prefix: string, headers: string[] | null, width: number, fields: TargetField[],
): string[] {
  const valid = new Set(fields.map((f) => f.key));
  if (!headers) {
    // Ohne Spaltennamen: erste Spalte = Text, Rest ignorieren
    return Array.from({ length: width }, (_, i) => (i === 0 ? 'text' : ''));
  }
  const remembered = loadRememberedMapping(prefix);
  const used = new Set<string>();
  return headers.map((h) => {
    const r = remembered[norm(h)];
    const key = r !== undefined && (r === '' || valid.has(r)) ? r : suggestField(h, fields);
    if (key && used.has(key)) return '';
    if (key) used.add(key);
    return key;
  });
}
