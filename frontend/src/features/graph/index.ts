import { lazy } from 'react';

// Öffentliche API des Features „graph" – andere Module importieren nur von hier.
// Die Komponenten werden lazy geladen, damit die Graph-Bibliothek nur bei Bedarf geladen wird.
export const ForceGraph = lazy(() => import('./components/ForceGraph'));
export const LocalGraph = lazy(() => import('./components/LocalGraph'));
export { getDocColor, buildGraph, neighborhood } from './graphData';
export type { TraceLink } from './graphData';
