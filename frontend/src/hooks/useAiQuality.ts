import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAiQuality, triggerAiQuality, getAiQualityProfiles } from '../api/client';
import type { AiQualityRequest } from '../types';

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
