import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore';

/**
 * Öffnet eine Anforderung in der Anforderungsseite: merkt Dokument und UID im Store
 * (die Seite liest sie beim Öffnen und reagiert auf Änderungen) und navigiert dorthin.
 */
export function useOpenRequirement() {
  const navigate = useNavigate();
  const setPrefix = useProjectStore((s) => s.setRequirementsPrefix);
  const setUid = useProjectStore((s) => s.setRequirementsUid);
  return useCallback(
    (projectId: string, prefix: string, uid: string) => {
      setPrefix(projectId, prefix);
      setUid(projectId, uid);
      navigate(`/requirements/${projectId}`);
    },
    [navigate, setPrefix, setUid],
  );
}
