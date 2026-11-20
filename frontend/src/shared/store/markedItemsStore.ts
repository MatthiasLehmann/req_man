import { create } from 'zustand';

/**
 * Anforderungen, die in der Tabelle per Häkchen markiert sind. Die Tabelle meldet ihre Auswahl hierher,
 * damit z. B. der PDF-Dialog „nur die markierten“ übernehmen kann. Nicht gespeichert (gilt nur für die offene Tabelle).
 */
interface MarkedItemsStore {
  projectId: string | null;
  uids: string[];
  setMarked: (projectId: string, uids: string[]) => void;
}

export const useMarkedItems = create<MarkedItemsStore>((set) => ({
  projectId: null,
  uids: [],
  setMarked: (projectId, uids) => set({ projectId, uids }),
}));
