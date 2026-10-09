import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project } from '../types';

interface ProjectStore {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Requirements-View: zuletzt gewähltes Dokument + Item (pro Projekt)
  requirementsPrefix: Record<string, string>;
  requirementsUid:    Record<string, string>;
  setRequirementsPrefix: (projectId: string, prefix: string) => void;
  setRequirementsUid:    (projectId: string, uid: string) => void;

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

      requirementsPrefix: {},
      requirementsUid: {},
      setRequirementsPrefix: (projectId, prefix) =>
        set((s) => ({ requirementsPrefix: { ...s.requirementsPrefix, [projectId]: prefix } })),
      setRequirementsUid: (projectId, uid) =>
        set((s) => ({ requirementsUid: { ...s.requirementsUid, [projectId]: uid } })),

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
