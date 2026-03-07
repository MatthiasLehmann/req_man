import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project } from '../types';

interface ProjectStore {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),
    }),
    {
      name: 'reqman-project',
    }
  )
);
