import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAiQuality,
  triggerAiQuality,
  getAiQualityProfiles,
  listFindingFeedback,
  sendFindingFeedback,
  deleteFindingFeedback,
} from '../../../shared/api/client';
import type { FindingVerdict } from '../../../shared/api/client';
import type { AiQualityRequest } from '../../../shared/types';

export function useAiQuality(projectId: string, uid: string) {
  return useQuery({
    queryKey: ['ai-quality', projectId, uid],
    queryFn: async () => {
      const res = await getAiQuality(projectId, uid);
      return res.data ?? null;
    },
    enabled: !!projectId && !!uid,
    staleTime: 0,
  });
}

export function useTriggerAiQuality(projectId: string, uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AiQualityRequest = {}) => triggerAiQuality(projectId, uid, req),
    onSuccess: (response) => {
      // Ergebnis direkt in den Cache schreiben – kein separater GET nötig
      qc.setQueryData(['ai-quality', projectId, uid], response.data);
    },
  });
}

export function useAiQualityProfiles() {
  return useQuery({
    queryKey: ['ai-quality-profiles'],
    queryFn: async () => {
      const res = await getAiQualityProfiles();
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // 5 Minuten cachen
  });
}

// L2: eigene Urteile zu den Befunden dieser Anforderung
export function useFindingFeedback(projectId: string, uid: string) {
  return useQuery({
    queryKey: ['finding-feedback', projectId, uid],
    queryFn: async () => (await listFindingFeedback(projectId, { uid, only_mine: true })).data,
    enabled: !!projectId && !!uid,
  });
}

export function useSendFindingFeedback(projectId: string, uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { category: string; finding: string; verdict: FindingVerdict }) =>
      sendFindingFeedback(projectId, { uid, ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding-feedback', projectId, uid] }),
  });
}

export function useWithdrawFindingFeedback(projectId: string, uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteFindingFeedback(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding-feedback', projectId, uid] }),
  });
}
