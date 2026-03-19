import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText, Hash } from 'lucide-react';

export interface DocumentNodeData {
  prefix: string;
  itemCount: number;
  color: string;
  typeName: string | null;
  [key: string]: unknown;
}

export default function DocumentNode({ data, selected }: NodeProps) {
  const d = data as DocumentNodeData;
  return (
    <div
      className={`bg-white rounded-lg shadow-md border-2 transition-all ${selected ? 'border-primary-500' : 'border-gray-200'}`}
      style={{ minWidth: 160 }}
    >
      <div
        className="h-1.5 rounded-t-lg"
        style={{ backgroundColor: d.color }}
      />
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="font-bold text-sm text-gray-800">{d.prefix}</span>
        </div>
        {d.typeName && (
          <div
            className="text-xs px-1.5 py-0.5 rounded-full inline-block mb-1 text-white font-medium"
            style={{ backgroundColor: d.color }}
          >
            {d.typeName}
          </div>
        )}
        {!d.typeName && (
          <div className="text-xs text-gray-400 italic mb-1">Kein Typ</div>
        )}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Hash className="w-3 h-3" />
          {d.itemCount} Anforderungen
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}
