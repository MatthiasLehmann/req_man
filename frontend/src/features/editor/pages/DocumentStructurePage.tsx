import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layers, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import DocumentTypesTab from '../components/document-structure/DocumentTypesTab';
import ProjectStructureTab from '../components/document-structure/ProjectStructureTab';

type Tab = 'types' | 'structure';

export default function DocumentStructurePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('types');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold text-gray-900">Dokumentenstruktur</h1>
        </div>

        <div className="flex gap-1 ml-4">
          <button
            onClick={() => setActiveTab('types')}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'types'
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            Dokumenttypen
          </button>
          <button
            onClick={() => {
              if (!projectId) {
                navigate('/');
              } else {
                setActiveTab('structure');
              }
            }}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'structure'
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            Projektstruktur
            {!projectId && (
              <span className="ml-1.5 text-xs text-gray-400">(Projekt wählen)</span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'types' && <DocumentTypesTab />}
        {activeTab === 'structure' && !projectId && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-500 text-sm">
              Kein Projekt ausgewählt. Bitte zuerst ein Projekt öffnen.
            </p>
            <button onClick={() => navigate('/')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Zur Projektübersicht
            </button>
          </div>
        )}
        {activeTab === 'structure' && projectId && (
          <ProjectStructureTab projectId={projectId} />
        )}
      </div>
    </div>
  );
}
