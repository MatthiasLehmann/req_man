// Schwellen aus A2 (reqman-benchmark: results/RAG_suche.md), bge-m3-Kosinus.
/** Ab diesem Wert gilt eine Anforderung als „sehr ähnlich“ (95 %-Wert zwischen verschiedenen echten Anforderungen). */
export const DUPLICATE_MIN = 0.9;
/** Ab diesem Wert gilt eine Anforderung als ähnlich (Median der verlinkten Paare). */
export const SIMILAR_MIN = 0.62;
