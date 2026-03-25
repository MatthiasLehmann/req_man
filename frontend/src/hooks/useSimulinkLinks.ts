import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSimulinkLinks,
  importSimulinkTrace,
  getSimulinkCoverage,
  deleteSimulinkLinks,
} from '../api/client';

/** Links einer einzelnen Anforderung laden */
export function useSimulinkLinks(projectId: string, uid: string) {
  return useQuery({
    queryKey: ['simulink-links', projectId, uid],
    queryFn: async () => {
      const res = await getSimulinkLinks(projectId, uid);
      return res.data ?? null;
    },
    enabled: !!projectId && !!uid,
    staleTime: 30_000,
  });
}

/** JSON-Datei importieren */
export function useImportSimulink(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importSimulinkTrace(projectId, file),
    onSuccess: () => {
      // Alle Simulink-Queries für dieses Projekt ungültig machen
      qc.invalidateQueries({ queryKey: ['simulink-links', projectId] });
      qc.invalidateQueries({ queryKey: ['simulink-coverage', projectId] });
    },
  });
}

/** Coverage-Statistik des Projekts */
export function useSimulinkCoverage(projectId: string) {
  return useQuery({
    queryKey: ['simulink-coverage', projectId],
    queryFn: async () => {
      const res = await getSimulinkCoverage(projectId);
      return res.data;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/** Alle Links eines Projekts löschen */
export function useDeleteSimulinkLinks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteSimulinkLinks(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simulink-links', projectId] });
      qc.invalidateQueries({ queryKey: ['simulink-coverage', projectId] });
    },
  });
}
