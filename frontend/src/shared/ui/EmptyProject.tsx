import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LucideIcon } from 'lucide-react';

// Leerer Zustand für Seiten, die ein Projekt brauchen, aber keins geöffnet ist.
// Ersetzt die sechs kopierten Blöcke „Kein Projekt ausgewählt“.
export function EmptyProject({ icon: Icon }: { icon?: LucideIcon }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        {Icon && <Icon className="w-16 h-16 mx-auto mb-4 opacity-30" />}
        <p>Kein Projekt ausgewählt</p>
        <button onClick={() => navigate('/')} className="btn-primary mt-4 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Zur Projektübersicht
        </button>
      </div>
    </div>
  );
}

export default EmptyProject;
