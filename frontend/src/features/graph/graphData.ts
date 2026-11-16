import { TraceabilityNode } from '../../shared/types';

export type TraceLink = { source: string; target: string; valid: boolean };

// ─── Dokumentfarben ───────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export function getDocColor(doc: string, docList: string[]): string {
  const idx = docList.indexOf(doc);
  return COLOR_PALETTE[(idx < 0 ? 0 : idx) % COLOR_PALETTE.length];
}

// ─── Graphdaten ───────────────────────────────────────────────────────────────

export interface GraphNode extends TraceabilityNode {
  id: string;
  color: string;
  /** Zahl aller Links der Anforderung im ganzen Projekt (Knotengröße, „ohne Link“) */
  linkCount: number;
}

export interface GraphLink {
  source: string;
  target: string;
  valid: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Baut Knoten und Kanten für das Netz. Kanten, deren Enden nicht beide in `nodes` liegen, entfallen.
 * `allLinks` (alle Links des Projekts) bestimmt die Linkzahl; ohne Angabe zählen nur die sichtbaren.
 */
export function buildGraph(
  nodes: TraceabilityNode[],
  links: TraceLink[],
  docList: string[],
  allLinks: TraceLink[] = links,
): GraphData {
  const count = new Map<string, number>();
  for (const l of allLinks) {
    count.set(l.source, (count.get(l.source) ?? 0) + 1);
    count.set(l.target, (count.get(l.target) ?? 0) + 1);
  }
  const ids = new Set(nodes.map((n) => n.uid));
  return {
    nodes: nodes.map((n) => ({
      ...n,
      id: n.uid,
      color: getDocColor(n.document, docList),
      linkCount: count.get(n.uid) ?? 0,
    })),
    links: links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((l) => ({ source: l.source, target: l.target, valid: l.valid })),
  };
}

/** Breitensuche in beide Richtungen: uid → Tiefe (0 = die Anforderung selbst) bis `tiefe`. */
export function neighborhood(uid: string, tiefe: number, links: TraceLink[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
    (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
  }
  const dist = new Map<string, number>([[uid, 0]]);
  let frontier = [uid];
  for (let d = 1; d <= tiefe && frontier.length; d++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const v of adj.get(u) ?? []) {
        if (!dist.has(v)) {
          dist.set(v, d);
          next.push(v);
        }
      }
    }
    frontier = next;
  }
  return dist;
}
