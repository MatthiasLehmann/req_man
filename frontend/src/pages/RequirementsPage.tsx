import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { getProject } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import DocumentTree from '../components/requirements/DocumentTree';
import ItemList from '../components/requirements/ItemList';
import ItemEditor from '../components/requirements/ItemEditor';

export default function RequirementsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentProject, setCurrentProject } = useProjectStore();
  const navigate = useNavigate();

  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Load project if not in store
  const { data: projectRes } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId && !currentProject,
  });

  useEffect(() => {
    if (projectRes?.data && !currentProject) {
      setCurrentProject(projectRes.data);
    }
  }, [projectRes]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Kein Projekt ausgewählt</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            <ArrowLeft className="w-4 h-4" />
            Zur Projektübersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Document Tree (left panel) */}
      <div className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <DocumentTree
          projectId={projectId}
          selectedPrefix={selectedPrefix}
          onSelectDocument={(prefix) => {
            setSelectedPrefix(prefix || null);
            setSelectedUid(null);
          }}
        />
      </div>

      {/* Item List (middle panel) */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {selectedPrefix ? (
          <ItemList
            projectId={projectId}
            prefix={selectedPrefix}
            selectedUid={selectedUid}
            onSelectItem={(uid) => setSelectedUid(uid || null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <div className="text-center">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Dokument auswählen</p>
            </div>
          </div>
        )}
      </div>

      {/* Item Editor (main area) */}
      <div className="flex-1 overflow-hidden">
        {selectedUid ? (
          <ItemEditor
            projectId={projectId}
            uid={selectedUid}
            onClose={() => setSelectedUid(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-sm">Anforderung auswählen oder erstellen</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
