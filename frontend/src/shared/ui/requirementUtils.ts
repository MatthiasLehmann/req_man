/** Gemeinsame Hilfsfunktionen für Level und Text von Anforderungen. */

/** Wandelt "1.2.3" in [1, 2, 3] um */
export function parseLevel(level: string): number[] {
  return level.split('.').map((n) => parseInt(n, 10) || 0);
}

/** Vergleichsfunktion für Level-Sortierung (numerisch) */
export function compareLevel(a: string, b: string): number {
  const la = parseLevel(a);
  const lb = parseLevel(b);
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const diff = (la[i] ?? 0) - (lb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Entfernt HTML-Tags aus einem Anforderungstext */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
