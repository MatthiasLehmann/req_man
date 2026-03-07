import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow, Node, Edge, Background, Controls, MiniMap,
  MarkerType, useNodesState, useEdgesState, Panel,
  NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranch, Table2, List, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { getTraceability } from '../api/client';
import { TraceabilityData, TraceabilityNode } from '../types';

// Document color map
const DOC_COLORS: Record<string, string> = {
  default: '#3b82f6',
};
const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

function getDocColor(doc: string, docList: string[]): string {
  const idx = docList.indexOf(doc);
  return COLOR_PALETTE[idx % COLOR_PALETTE.length];
}

type ViewMode = 'graph' | 'matrix' | 'list';

export default function TraceabilityPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [filterDoc, setFilterDoc] = useState<string>('');

  const { data: res, isLoading } = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => getTraceability(projectId!),
    enabled: !!projectId,
  });
  const data: TraceabilityData = res?.data || { nodes: [], links: [] };

  const docList = useMemo(() => {
    return [...new Set(data.nodes.map((n) => n.document))].sort();
  }, [data.nodes]);

  const filteredNodes = useMemo(() => {
    if (!filterDoc) return data.nodes;
    return data.nodes.filter((n) => n.document === filterDoc);
  }, [data.nodes, filterDoc]);

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.uid));

  const filteredLinks = useMemo(() => {
    return data.links.filter(
      (l) => filteredNodeIds.has(l.source) || filteredNodeIds.has(l.target)
    );
  }, [data.links, filteredNodeIds]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={() => navigate('/')} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" /> Zur Projektübersicht
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-gray-800">Traceability</h2>
          <span className="text-xs text-gray-400">
            {data.nodes.length} Anforderungen · {data.links.length} Verlinkungen
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Document filter */}
          <select
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-400"
            value={filterDoc}
            onChange={(e) => setFilterDoc(e.target.value)}
          >
            <option value="">Alle Dokumente</option>
            {docList.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* View mode */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {([['graph', GitBranch], ['matrix', Table2], ['list', List]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={clsx(
                  'px-3 py-1.5 flex items-center gap-1.5 text-xs transition-colors',
                  viewMode === mode
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <GitBranch className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Keine Anforderungen vorhanden</p>
            </div>
          </div>
        ) : viewMode === 'graph' ? (
          <GraphView nodes={filteredNodes} links={filteredLinks} docList={docList} />
        ) : viewMode === 'matrix' ? (
          <MatrixView nodes={filteredNodes} links={data.links} />
        ) : (
          <ListView nodes={filteredNodes} links={filteredLinks} docList={docList} />
        )}
      </div>
    </div>
  );
}

// ─── Graph View ───────────────────────────────────────────────────────────────

function GraphView({
  nodes: traceNodes,
  links,
  docList,
}: {
  nodes: TraceabilityNode[];
  links: { source: string; target: string; valid: boolean }[];
  docList: string[];
}) {
  const ITEM_WIDTH = 160;
  const ITEM_HEIGHT = 70;
  const COL_GAP = 220;
  const ROW_GAP = 90;

  // Group by document
  const byDoc: Record<string, TraceabilityNode[]> = {};
  traceNodes.forEach((n) => {
    byDoc[n.document] = [...(byDoc[n.document] || []), n];
  });

  const docOrder = docList.filter((d) => byDoc[d]);

  const flowNodes: Node[] = [];
  docOrder.forEach((doc, colIdx) => {
    const docNodes = byDoc[doc] || [];
    docNodes.forEach((n, rowIdx) => {
      const color = getDocColor(doc, docList);
      flowNodes.push({
        id: n.uid,
        position: { x: colIdx * COL_GAP, y: rowIdx * ROW_GAP },
        data: { label: n.uid, text: n.text, level: n.level, active: n.active, color },
        style: {
          width: ITEM_WIDTH,
          background: '#fff',
          border: `2px solid ${color}`,
          borderRadius: 8,
          fontSize: 11,
        },
      });
    });
  });

  const flowEdges: Edge[] = links.map((l, i) => ({
    id: `e-${i}`,
    source: l.source,
    target: l.target,
    animated: false,
    style: { stroke: l.valid ? '#94a3b8' : '#ef4444', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
    >
      <Background />
      <Controls />
      <MiniMap />
      <Panel position="top-left">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-xs space-y-1">
          {docOrder.map((doc) => (
            <div key={doc} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: getDocColor(doc, docList) }}
              />
              <span className="font-mono">{doc}</span>
              <span className="text-gray-400">({(byDoc[doc] || []).length})</span>
            </div>
          ))}
        </div>
      </Panel>
    </ReactFlow>
  );
}

// ─── Matrix View ──────────────────────────────────────────────────────────────

function MatrixView({
  nodes,
  links,
}: {
  nodes: TraceabilityNode[];
  links: { source: string; target: string; valid: boolean }[];
}) {
  const linkSet = new Set(links.map((l) => `${l.source}→${l.target}`));
  const displayNodes = nodes.slice(0, 40); // Limit for performance

  return (
    <div className="h-full overflow-auto p-4">
      {nodes.length > 40 && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          <AlertCircle className="w-4 h-4" />
          Matrix zeigt die ersten 40 von {nodes.length} Anforderungen. Benutzen Sie den Filter.
        </div>
      )}
      <div className="inline-block border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-r border-gray-200 p-2 text-left sticky left-0 bg-gray-50 z-10 min-w-24">
                Von \ Nach
              </th>
              {displayNodes.map((n) => (
                <th
                  key={n.uid}
                  className="border-b border-r border-gray-200 p-1 text-center font-mono"
                  style={{ maxWidth: 60, minWidth: 50 }}
                  title={n.text}
                >
                  <div className="transform -rotate-45 whitespace-nowrap text-xs">
                    {n.uid}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayNodes.map((row) => (
              <tr key={row.uid} className="hover:bg-gray-50">
                <td className="border-b border-r border-gray-200 px-2 py-1 font-mono sticky left-0 bg-white z-10">
                  {row.uid}
                </td>
                {displayNodes.map((col) => {
                  const linked = linkSet.has(`${row.uid}→${col.uid}`);
                  const backLink = linkSet.has(`${col.uid}→${row.uid}`);
                  return (
                    <td
                      key={col.uid}
                      className={clsx(
                        'border-b border-r border-gray-200 text-center p-1',
                        row.uid === col.uid ? 'bg-gray-100' : linked ? 'bg-blue-50' : ''
                      )}
                    >
                      {row.uid === col.uid ? (
                        <span className="text-gray-400">—</span>
                      ) : linked ? (
                        <span className="text-blue-600 font-bold">↓</span>
                      ) : backLink ? (
                        <span className="text-green-600">↑</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="text-blue-600 font-bold">↓</span> Verlinkung (von → nach)</span>
        <span className="flex items-center gap-1"><span className="text-green-600">↑</span> Rückverlinkung</span>
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  nodes,
  links,
  docList,
}: {
  nodes: TraceabilityNode[];
  links: { source: string; target: string; valid: boolean }[];
  docList: string[];
}) {
  const outLinks: Record<string, string[]> = {};
  const inLinks: Record<string, string[]> = {};
  links.forEach((l) => {
    outLinks[l.source] = [...(outLinks[l.source] || []), l.target];
    inLinks[l.target] = [...(inLinks[l.target] || []), l.source];
  });

  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600 w-28">UID</th>
            <th className="text-left p-3 font-medium text-gray-600 w-16">Ebene</th>
            <th className="text-left p-3 font-medium text-gray-600 w-20">Dokument</th>
            <th className="text-left p-3 font-medium text-gray-600">Text</th>
            <th className="text-left p-3 font-medium text-gray-600 w-40">Verlinkt nach</th>
            <th className="text-left p-3 font-medium text-gray-600 w-40">Verlinkt von</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.uid} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="p-3">
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                  {node.uid}
                </span>
              </td>
              <td className="p-3 text-xs text-gray-500">{node.level}</td>
              <td className="p-3">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-xs font-medium text-white"
                  style={{ background: getDocColor(node.document, docList) }}
                >
                  {node.document}
                </span>
              </td>
              <td className="p-3 text-xs text-gray-600 max-w-xs truncate">{node.text}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {(outLinks[node.uid] || []).map((uid) => (
                    <span key={uid} className="text-xs font-mono text-blue-600 bg-blue-50 px-1 rounded">
                      {uid}
                    </span>
                  ))}
                </div>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {(inLinks[node.uid] || []).map((uid) => (
                    <span key={uid} className="text-xs font-mono text-green-600 bg-green-50 px-1 rounded">
                      {uid}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
