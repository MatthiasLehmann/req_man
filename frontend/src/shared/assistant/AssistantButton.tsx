import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import AssistantPanel from './AssistantPanel';

/** Runder Knopf unten rechts; öffnet das Seitenfenster „Frag ReqMan“. Verlauf bleibt nur bis zum Schließen. */
export default function AssistantButton() {
  const [open, setOpen] = useState(false);
  if (open) return <AssistantPanel onClose={() => setOpen(false)} />;
  return (
    <button
      onClick={() => setOpen(true)}
      title="Frag ReqMan"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary-600 text-white shadow-lg pl-3 pr-4 py-3 hover:bg-primary-700"
    >
      <MessageCircleQuestion className="w-5 h-5" />
      <span className="text-sm font-medium">Frag ReqMan</span>
    </button>
  );
}
