import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project } from '../types';

interface ProjectStore {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Matrix-View: zuletzt gewähltes Dokument (pro Projekt)
  matrixPrefix: Record<string, string>;
  setMatrixPrefix: (projectId: string, prefix: string) => void;

  // Linking-View: zuletzt gewählte Dokumente (pro Projekt)
  linkingLeftPrefix:  Record<string, string>;
  linkingRightPrefix: Record<string, string>;
  setLinkingLeftPrefix:  (projectId: string, prefix: string) => void;
  setLinkingRightPrefix: (projectId: string, prefix: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),

      matrixPrefix: {},
      setMatrixPrefix: (projectId, prefix) =>
        set((s) => ({ matrixPrefix: { ...s.matrixPrefix, [projectId]: prefix } })),

      linkingLeftPrefix: {},
      setLinkingLeftPrefix: (projectId, prefix) =>
        set((s) => ({ linkingLeftPrefix: { ...s.linkingLeftPrefix, [projectId]: prefix } })),

      linkingRightPrefix: {},
      setLinkingRightPrefix: (projectId, prefix) =>
        set((s) => ({ linkingRightPrefix: { ...s.linkingRightPrefix, [projectId]: prefix } })),
    }),
    {
      name: 'reqman-project',
    }
  )
);
