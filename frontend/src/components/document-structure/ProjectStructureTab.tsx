import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Node, Edge, Background, Controls, MiniMap, Panel,
  MarkerType, useNodesState, useEdgesState, NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, FileText } from 'lucide-react';
import { getProjectStructure, listDocumentTypes, assignDocumentType } from '../../api/client';
import type { DocumentWithType, DocumentType } from '../../types';
import DocumentNode, { DocumentNodeData } from './DocumentNode';
import CreateDocumentModal from './CreateDocumentModal';
import { useAuthStore } from '../../store/authStore';

const NODE_TYPES: NodeTypes = { documentNode: DocumentNode };

interface Props {
  projectId: string;
}

function buildLayout(docs: DocumentWithType[]): { nodes: Node[]; edges: Edge[] } {
  // Build parent→children map
  const childrenOf: Record<string, string[]> = {};
  const prefixSet = new Set(docs.map((d) => d.prefix));

  docs.forEach((d) => {
    const par = d.parent && prefixSet.has(d.parent) ? d.parent : '__root__';
    if (!childrenOf[par]) childrenOf[par] = [];
    childrenOf[par].push(d.prefix);
  });

  const docMap: Record<string, DocumentWithType> = {};
  docs.forEach((d) => { docMap[d.prefix] = d; });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // BFS level-by-level layout
  const levelOrder: string[][] = [];
  const queue: Array<{ prefix: string; depth: number }> = [];
  (childrenOf['__root__'] || []).forEach((p) => queue.push({ prefix: p, depth: 0 }));

  while (queue.length > 0) {
    const { prefix, depth } = queue.shift()!;
    if (!levelOrder[depth]) levelOrder[depth] = [];
    levelOrder[depth].push(prefix);
    (childrenOf[prefix] || []).forEach((child) =>
      queue.push({ prefix: child, depth: depth + 1 })
    );
  }

  const NODE_W = 200;
  const NODE_H = 110;
  const H_GAP = 40;
  const V_GAP = 60;

  levelOrder.forEach((levelPrefixes, depth) => {
    const totalW = levelPrefixes.length * NODE_W + (levelPrefixes.length - 1) * H_GAP;
    const startX = -totalW / 2;

    levelPrefixes.forEach((prefix, i) => {
      const doc = docMap[prefix];
      const x = startX + i * (NODE_W + H_GAP);
      const y = depth * (NODE_H + V_GAP);

      nodes.push({
        id: prefix,
        type: 'documentNode',
        position: { x, y },
        data: {
          prefix,
          itemCount: doc.item_count,
          color: doc.document_type?.color ?? '#9ca3af',
          typeName: doc.document_type?.name ?? null,
        } as DocumentNodeData,
      });

      if (doc.parent && prefixSet.has(doc.parent)) {
        edges.push({
          id: `${doc.parent}->${prefix}`,
          source: doc.parent,
          target: prefix,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' },
          style: { stroke: '#9ca3af', strokeWidth: 1.5 },
          type: 'smoothstep',
        });
      }
    });
  });

  return { nodes, edges };
}

export default function ProjectStructureTab({ projectId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: structRes, isLoading: structLoading } = useQuery({
    queryKey: ['project-structure', projectId],
    queryFn: () => getProjectStructure(projectId),
    enabled: !!projectId,
  });
  const { data: typesRes } = useQuery({
    queryKey: ['document-types'],
    queryFn: listDocumentTypes,
  });

  const docs: DocumentWithType[] = structRes?.data?.documents ?? [];
  const documentTypes: DocumentType[] = typesRes?.data ?? [];

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => buildLayout(docs),
    [docs]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutEdges);

  // Sync layout when data changes
  const syncedNodes = useMemo(() => layoutNodes, [layoutNodes]);
  const syncedEdges = useMemo(() => layoutEdges, [layoutEdges]);

  const selectedDoc = selectedPrefix ? docs.find((d) => d.prefix === selectedPrefix) : null;

  const assignMut = useMutation({
    mutationFn: ({ typeId }: { typeId: string | null }) =>
      assignDocumentType(projectId, selectedPrefix!, typeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-structure', projectId] });
      toast.success('Dokumenttyp zugewiesen');
    },
    onError: () => toast.error('Fehler beim Zuweisen'),
  });

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedPrefix(node.id as string);
  }, []);

  if (structLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Lade Projektstruktur...
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500 text-sm">Keine Dokumente im Projekt gefunden.</p>
        {canEdit && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Erstes Dokument erstellen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ReactFlow graph */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={syncedNodes}
          edges={syncedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background />
          <Controls />
          <MiniMap zoomable pannable />
          <Panel position="top-left">
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary flex items-center gap-1.5 text-sm shadow"
                >
                  <Plus className="w-4 h-4" /> Dokument erstellen
                </button>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Right panel: properties */}
      {selectedDoc && (
        <div className="w-72 border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedDoc.document_type?.color ?? '#9ca3af' }}
              />
              <span className="font-bold text-gray-900">{selectedDoc.prefix}</span>
            </div>
            <p className="text-xs text-gray-500">{selectedDoc.path}</p>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Anforderungen</span>
                <p className="font-semibold text-gray-800 mt-0.5">{selectedDoc.item_count}</p>
              </div>
              <div>
                <span className="text-gray-500">Übergeordnet</span>
                <p className="font-semibold text-gray-800 mt-0.5">{selectedDoc.parent ?? '–'}</p>
              </div>
              {selectedDoc.children.length > 0 && (
                <div className="col-span-2">
                  <span className="text-gray-500">Untergeordnet</span>
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {selectedDoc.children.join(', ')}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Dokumenttyp zuweisen
              </label>
              <select
                className="input w-full text-sm"
                value={selectedDoc.document_type_id ?? ''}
                onChange={(e) => assignMut.mutate({ typeId: e.target.value || null })}
                disabled={!canEdit || assignMut.isPending}
              >
                <option value="">-- Kein Typ --</option>
                {documentTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                ))}
              </select>
            </div>

            {selectedDoc.document_type && selectedDoc.document_type.properties.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Typ-Eigenschaften
                </div>
                <div className="space-y-1.5">
                  {selectedDoc.document_type.properties.map((prop) => (
                    <div key={prop.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{prop.label}</span>
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {prop.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate(`/requirements/${projectId}`)}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Zu Anforderungen
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateDocumentModal
          projectId={projectId}
          documents={docs}
          documentTypes={documentTypes}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
