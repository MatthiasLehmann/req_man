import { lazy } from 'react';

// Öffentliche API des Features „trace" – andere Module importieren nur von hier.
// Seiten werden einzeln lazy geladen, damit jede Seite nur ihre eigenen Bibliotheken nachlädt.
export const TraceabilityPage = lazy(() => import('./pages/TraceabilityPage'));
export const MatrixPage = lazy(() => import('./pages/MatrixPage'));
export const MetricsPage = lazy(() => import('./pages/MetricsPage'));
