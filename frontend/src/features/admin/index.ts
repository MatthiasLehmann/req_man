import { lazy } from 'react';

// Öffentliche API des Features „admin" – andere Module importieren nur von hier.
// Seiten werden einzeln lazy geladen, damit jede Seite nur ihre eigenen Bibliotheken nachlädt.
export const AdminPage = lazy(() => import('./pages/AdminPage'));
