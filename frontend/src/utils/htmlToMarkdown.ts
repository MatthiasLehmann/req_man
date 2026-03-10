/**
 * Konvertiert legacy-HTML-Content nach Markdown.
 *
 * Hintergrund: Der TipTap-Editor hat früher HTML gespeichert (getHTML()).
 * Beim Umstieg auf Markdown-Speicherformat müssen bestehende HTML-Inhalte
 * beim Laden automatisch konvertiert werden.
 *
 * Sonderregeln:
 *  - <u>, <mark> → als Raw-HTML erhalten (kein Markdown-Äquivalent)
 *  - <table> und Kinder → als Raw-HTML erhalten (verhindert verlustbehaftete GFM-Konvertierung)
 *  - <img data-local-path="..."> → vollständiger <img>-Tag mit allen Attributen
 */

import TurndownService from 'turndown';

let _service: TurndownService | null = null;

function getService(): TurndownService {
  if (_service) return _service;

  _service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    hr: '---',
    strongDelimiter: '**',
    emDelimiter: '_',
  });

  // Diese Tags als Raw-HTML erhalten (kein Markdown-Äquivalent vorhanden)
  _service.keep(['u', 'mark', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);

  // Lokale Bilder (mit data-local-path) vollständig als <img>-Tag erhalten,
  // damit data-local-path und data-hash den Roundtrip überleben.
  _service.addRule('localImage', {
    filter: (node) =>
      node.nodeName === 'IMG' &&
      !!(node as HTMLImageElement).getAttribute('data-local-path'),
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const esc = (s: string) => (s ?? '').replace(/"/g, '&quot;');
      return [
        '',
        `<img src="${esc(el.getAttribute('src') ?? '')}"`,
        ` alt="${esc(el.getAttribute('alt') ?? '')}"`,
        ` data-local-path="${esc(el.getAttribute('data-local-path') ?? '')}"`,
        ` data-hash="${esc(el.getAttribute('data-hash') ?? '')}" />`,
        '',
      ].join('');
    },
  });

  return _service;
}

/**
 * Erkennt ob ein String alter HTML-Content ist.
 * Heuristik: beginnt nach Whitespace mit einem Block-HTML-Tag.
 */
export function looksLikeHtml(value: string): boolean {
  if (!value) return false;
  return /^\s*<(p|h[1-6]|ul|ol|li|div|blockquote|table|pre|br|img)\b/i.test(value);
}

/**
 * Konvertiert HTML → Markdown.
 * Gibt den Wert unverändert zurück, wenn er bereits Markdown ist.
 */
export function htmlToMarkdown(value: string): string {
  if (!value || value.trim() === '') return '';
  if (!looksLikeHtml(value)) return value;
  return getService().turndown(value);
}
