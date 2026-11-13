import { lazy } from 'react';

// Öffentliche API des Features „proposals“ – andere Module importieren nur von hier.
export const ProposalsPage = lazy(() => import('./pages/ProposalsPage'));
export { default as OpenProposalsHint } from './components/OpenProposalsHint';
