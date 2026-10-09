import { lazy } from 'react';

// Öffentliche API des Features „help" – andere Module importieren nur von hier.
// Seiten werden einzeln lazy geladen, damit jede Seite nur ihre eigenen Bibliotheken nachlädt.
export const HelpPage = lazy(() => import('./pages/HelpPage'));
