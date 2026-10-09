import { lazy } from 'react';

// Öffentliche API des Features „dashboard" – andere Module importieren nur von hier.
// Seiten werden einzeln lazy geladen, damit jede Seite nur ihre eigenen Bibliotheken nachlädt.
export const DashboardPage = lazy(() => import('./pages/DashboardPage'));
