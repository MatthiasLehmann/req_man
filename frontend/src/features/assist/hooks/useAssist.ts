import { useQuery } from '@tanstack/react-query';
import { getImpact, getLinkSuggestions, ragSimilarText } from '../../../shared/api/client';

/** true, wenn das Embedding-Modell nicht erreichbar ist (Backend antwortet 503). */
export function isEmbeddingUnavailable(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 503;
}

export function useLinkSuggestions(projectId: string, uid: string) {
  return useQuery({
    queryKey: ['link-suggestions', projectId, uid],
    queryFn: async () => (await getLinkSuggestions(projectId, uid, 8)).data,
    enabled: !!projectId && !!uid,
    staleTime: 30_000,
    retry: false,
  });
}

export function useImpact(projectId: string, uid: string) {
  return useQuery({
    queryKey: ['impact', projectId, uid],
    queryFn: async () => (await getImpact(projectId, uid)).data,
    enabled: !!projectId && !!uid,
    staleTime: 0,
    retry: false,
  });
}

export function useSimilarText(projectId: string, uid: string, text: string, enabled: boolean) {
  return useQuery({
    queryKey: ['similar-text', projectId, uid, text],
    queryFn: async () => (await ragSimilarText(projectId, { text, exclude_uid: uid, k: 6 })).data,
    enabled: enabled && !!projectId && !!text,
    staleTime: 30_000,
    retry: false,
  });
}
