import { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow, Node, Edge, Background, Controls, MiniMap,
  MarkerType, Panel, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranch, Table2, Loader2, AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Link2, ListTree, Network } from 'lucide-react';
import clsx from 'clsx';
import { getTraceability } from '../../../shared/api/client';
import { TraceabilityData, TraceabilityNode } from '../../../shared/types';
import { EmptyProject } from '../../../shared/ui/EmptyProject';
import { ForceGraph, buildGraph, getDocColor } from '../../graph';
import { LinkingPage } from '../../editor';
import { useOpenRequirement, useRegisterAction } from '../../../shared/search';

type ViewMode = 'graph' | 'matrix' | 'tree' | 'link';
type TreeDirection = 'down' | 'up';

// ─── Document Multi-Select Menu ────────────────────────────────────────────────

function DocSelectMenu({
  docList,
  selectedDocs,
  onToggle,
}: {
  docList: string[];
  selectedDocs: Set<string>;
  onToggle: (doc: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const label = selectedDocs.size <= 3
    ? [...selectedDocs].join(', ')
    : `${selectedDocs.size} Dokumente`;
  const minRequired = Math.min(2, docList.length);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm border border-gray-200 rounded px-2 py-1 flex items-center gap-1.5 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-400"
      >
        <span className="font-mono">{label || 'Dokumente wählen'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl z-20 p-2">
          <p className="text-xs text-gray-400 px-2 pb-1">
            Dokumente auswählen (mind. {minRequired})
          </p>
          <div className="max-h-64 overflow-auto">
            {docList.map((doc) => {
              const checked = selectedDocs.has(doc);
              const disableUncheck = checked && selectedDocs.size <= minRequired;
              return (
                <label
                  key={doc}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50',
                    disableUncheck && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary-600"
                    checked={checked}
                    disabled={disableUncheck}
                    onChange={() => onToggle(doc)}
                  />
                  <span className="text-sm font-mono">{doc}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraceabilityPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const openRequirement = useOpenRequirement();
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const paramView = (['graph', 'matrix', 'tree', 'link'] as const).find((v) => v === viewParam);
  const [viewMode, setViewMode] = useState<ViewMode>(paramView ?? 'graph');
  // Adresse mit ?view=… (z. B. aus „Nächste Schritte“) stellt die Ansicht ein
  useEffect(() => { if (paramView) setViewMode(paramView); }, [paramView]);
  // „Graph öffnen“ (G) stellt die Ansicht „Graph“ ein
  useRegisterAction('graph', () => setViewMode('graph'));
  const [treeDir, setTreeDir] = useState<TreeDirection>('down');
  const [selectedDocsOverride, setSelectedDocsOverride] = useState<Set<string> | null>(null);

  // Reset horizontal scroll caused by ReactFlow when switching views
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollLeft = 0;
  }, [viewMode]);

  const { data: res, isLoading } = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => getTraceability(projectId!),
    enabled: !!projectId,
  });
  const data: TraceabilityData = res?.data || { nodes: [], links: [] };

  const docList = useMemo(() => {
    return [...new Set(data.nodes.map((n) => n.document))].sort();
  }, [data.nodes]);

  // Dokument-Mehrfachauswahl für alle Ansichten: mindestens zwei Dokumente,
  // gezeigt wird nur die Verlinkung zwischen den gewählten Dokumenten.
  const selectedDocs = useMemo(
    () => selectedDocsOverride ?? new Set(docList.slice(0, 2)),
    [selectedDocsOverride, docList]
  );

  const toggleDoc = (doc: string) => {
    setSelectedDocsOverride((prev) => {
      const base = new Set(prev ?? docList.slice(0, 2));
      if (base.has(doc)) {
        const minRequired = Math.min(2, docList.length);
        if (base.size > minRequired) base.delete(doc);
      } else {
        base.add(doc);
      }
      return base;
    });
  };

  const multiDocNodes = useMemo(
    () => data.nodes.filter((n) => selectedDocs.has(n.document)),
    [data.nodes, selectedDocs]
  );
  const multiDocNodeIds = useMemo(
    () => new Set(multiDocNodes.map((n) => n.uid)),
    [multiDocNodes]
  );
  const multiDocLinks = useMemo(
    () => data.links.filter((l) => multiDocNodeIds.has(l.source) && multiDocNodeIds.has(l.target)),
    [data.links, multiDocNodeIds]
  );

  const netData = useMemo(
    () => buildGraph(multiDocNodes, multiDocLinks, docList, data.links),
    [multiDocNodes, multiDocLinks, docList, data.links]
  );

  if (!projectId) return <EmptyProject icon={GitBranch} />;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-gray-800">Traceability</h2>
          {viewMode !== 'link' && (
            <span className="text-xs text-gray-400">
              {multiDocNodes.length} Anforderungen · {multiDocLinks.length} Verlinkungen
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Dokumentauswahl (überall dieselbe Mehrfachauswahl; „Verknüpfen“ hat eigene Spalten) */}
          {viewMode !== 'link' && (
            <DocSelectMenu docList={docList} selectedDocs={selectedDocs} onToggle={toggleDoc} />
          )}

          {/* Richtung (nur Baum) */}
          {viewMode === 'tree' && (
            <div className="flex border border-gray-200 rounded-lg overflow-hidden" role="group" aria-label="Richtung">
              {([
                ['down', ArrowDown, 'Top-Down', 'Von oben nach unten: Anforderung → die, die auf sie verweisen'],
                ['up', ArrowUp, 'Bottom-Up', 'Von unten nach oben: Anforderung → die, auf die sie verweist'],
              ] as const).map(([dir, Icon, label, tip]) => (
                <button
                  key={dir}
                  title={tip}
                  onClick={() => setTreeDir(dir)}
                  className={clsx(
                    'px-2.5 py-1.5 flex items-center gap-1 text-xs transition-colors',
                    treeDir === dir ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* View mode */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden" role="tablist">
            {([
              ['graph', Network, 'Graph'],
              ['matrix', Table2, 'Matrix'],
              ['tree', ListTree, 'Baum'],
              ['link', Link2, 'Verknüpfen'],
            ] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={clsx(
                  'px-3 py-1.5 flex items-center gap-1.5 text-xs transition-colors',
                  viewMode === mode
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'link' ? (
          <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary-600 m-8" />}>
            <LinkingPage />
          </Suspense>
        ) : isLoading ? (
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
          <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary-600 m-8" />}>
            <ForceGraph
              data={netData}
              docList={docList}
              controls
              onOpen={(n) => openRequirement(projectId, n.document, n.id)}
            />
          </Suspense>
        ) : viewMode === 'matrix' ? (
          <MatrixView nodes={multiDocNodes} links={multiDocLinks} />
        ) : (
          <TreeView nodes={multiDocNodes} links={multiDocLinks} docList={docList} direction={treeDir} />
        )}
      </div>
    </div>
  );
}

// ─── Tree View (Spaltenansicht mit Aufklappen) ────────────────────────────────

function TreeView({
  nodes: traceNodes,
  links,
  docList,
  direction,
}: {
  nodes: TraceabilityNode[];
  links: { source: string; target: string; valid: boolean }[];
  docList: string[];
  direction: TreeDirection;
}) {
  const ITEM_WIDTH = 190;
  const COL_GAP = 260;
  const ROW_GAP = 56;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Beim Richtungswechsel beginnt der Baum zugeklappt neu.
  useEffect(() => setExpanded(new Set()), [direction]);

  const nodeMap = useMemo(
    () => Object.fromEntries(traceNodes.map((n) => [n.uid, n])),
    [traceNodes]
  );

  // A link means: source (lower/child item) traces up to target (higher/parent item).
  // Top-Down: the children of a node are the items that link to it.
  // Bottom-Up: the children of a node are the items it links to.
  const childrenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    links.forEach((l) => {
      if (nodeMap[l.source] && nodeMap[l.target]) {
        const [parent, child] = direction === 'down' ? [l.target, l.source] : [l.source, l.target];
        map[parent] = [...(map[parent] || []), child];
      }
    });
    return map;
  }, [links, nodeMap, direction]);

  const hasParent = useMemo(() => {
    const s = new Set<string>();
    Object.values(childrenMap).forEach((cs) => cs.forEach((c) => s.add(c)));
    return s;
  }, [childrenMap]);

  // Roots: items without a parent in the current selection and direction.
  const roots = useMemo(
    () => traceNodes.filter((n) => !hasParent.has(n.uid)),
    [traceNodes, hasParent]
  );

  const toggle = (uid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const rendered = new Set<string>();
  let rowCounter = 0;

  function visit(uid: string, depth: number) {
    if (rendered.has(uid)) return;
    const node = nodeMap[uid];
    if (!node) return;
    rendered.add(uid);

    const children = childrenMap[uid] || [];
    const isExpanded = expanded.has(uid);
    const color = getDocColor(node.document, docList);
    const row = rowCounter++;

    flowNodes.push({
      id: uid,
      position: { x: depth * COL_GAP, y: row * ROW_GAP },
      sourcePosition: direction === 'down' ? Position.Left : Position.Right,
      targetPosition: direction === 'down' ? Position.Right : Position.Left,
      data: {
        label: (
          <div className="text-left leading-tight">
            <div className="flex items-center gap-1 font-mono font-semibold text-gray-800">
              {children.length > 0 && (
                <span className="text-gray-400 shrink-0">{isExpanded ? '▼' : '▶'}</span>
              )}
              <span className="truncate">{uid}</span>
              {children.length > 0 && (
                <span className="text-gray-400 shrink-0">({children.length})</span>
              )}
            </div>
            <div className="text-gray-500 truncate" style={{ fontSize: 10 }}>
              {node.text}
            </div>
          </div>
        ),
      },
      style: {
        width: ITEM_WIDTH,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderLeftWidth: 4,
        borderLeftColor: color,
        borderRadius: 8,
        fontSize: 11,
        padding: 6,
        cursor: children.length > 0 ? 'pointer' : 'default',
        textAlign: 'left',
      },
    });

    if (isExpanded) {
      children.forEach((childUid) => {
        const [source, target] = direction === 'down' ? [childUid, uid] : [uid, childUid];
        flowEdges.push({
          id: `e-${source}-${target}`,
          source,
          target,
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed },
        });
        visit(childUid, depth + 1);
      });
    }
  }

  roots.forEach((r) => visit(r.uid, 0));

  const docOrder = docList.filter((d) => traceNodes.some((n) => n.document === d));
  const allExpanded = traceNodes.every((n) => (childrenMap[n.uid] || []).length === 0 || expanded.has(n.uid));

  return (
    <ReactFlow
      key={direction}
      nodes={flowNodes}
      edges={flowEdges}
      onNodeClick={(_, node) => {
        if ((childrenMap[node.id] || []).length > 0) toggle(node.id);
      }}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
    >
      <Background />
      <Controls />
      <MiniMap />
      <Panel position="top-left">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-xs space-y-2 max-w-[220px]">
          <p className="text-gray-400">
            Klicken Sie auf einen Knoten mit ▶, um die nächste verlinkte Ebene aufzuklappen.
          </p>
          <div className="space-y-1">
            {docOrder.map((doc) => (
              <div key={doc} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: getDocColor(doc, docList) }}
                />
                <span className="font-mono">{doc}</span>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-gray-100">
            <button
              title={allExpanded ? 'Alles zuklappen' : 'Alles aufklappen'}
              aria-label={allExpanded ? 'Alles zuklappen' : 'Alles aufklappen'}
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(traceNodes.map((n) => n.uid)))}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <ChevronsUpDown className="w-4 h-4" />
            </button>
          </div>
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
          Matrix zeigt die ersten 40 von {nodes.length} Anforderungen. Wählen Sie weniger Dokumente aus.
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
