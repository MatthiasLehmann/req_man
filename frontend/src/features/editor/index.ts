import { lazy } from 'react';

// Öffentliche API des Features „editor" – andere Module importieren nur von hier.
// Seiten werden einzeln lazy geladen, damit jede Seite nur ihre eigenen Bibliotheken nachlädt.
export const RequirementsPage = lazy(() => import('./pages/RequirementsPage'));
export const DocumentStructurePage = lazy(() => import('./pages/DocumentStructurePage'));
export const LinkingPage = lazy(() => import('./pages/LinkingPage'));
