import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { Maximize2 } from 'lucide-react';
import { GraphData, GraphLink, GraphNode } from '../graphData';

interface Props {
  data: GraphData;
  docList: string[];
  /** Klick auf einen Knoten */
  onOpen: (node: GraphNode) => void;
  /** Höhe in px; ohne Angabe füllt der Graph den Elternknoten */
  height?: number;
  /** Hervorgehobene Anforderung (lokaler Graph) */
  focusUid?: string;
  /** Legende, Schalter „nur ohne Link“ und Ein-Bild-Knopf (Gesamtgraph) */
  controls?: boolean;
}

const RED = '#dc2626';
const LABEL_ZOOM = 1.6; // Beschriftung erst ab dieser Zoomstufe (Gesamtgraph)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const endId = (e: unknown): string => (typeof e === 'object' && e !== null ? (e as GraphNode).id : (e as string));

type PNode = GraphNode & { x?: number; y?: number };

export default function ForceGraph({ data, docList, onOpen, height, focusUid, controls = false }: Props) {
  const fgRef = useRef<ForceGraphMethods<PNode, GraphLink> | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: height ?? 400 });
  const [hover, setHover] = useState<GraphNode | null>(null);
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const t0 = useRef(performance.now());

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: height ?? el.clientHeight });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [height]);

  // Die Bibliothek verändert die Objekte (Position, Verweise) – deshalb Kopien.
  const graph = useMemo(() => {
    t0.current = performance.now();
    boxRef.current?.removeAttribute("data-first-frame-ms");
    boxRef.current?.removeAttribute("data-engine-stop-ms");
    const nodes = (onlyUnlinked ? data.nodes.filter((n) => n.linkCount === 0) : data.nodes).map((n) => ({ ...n }));
    const links = onlyUnlinked ? [] : data.links.map((l) => ({ ...l }));
    return { nodes, links };
  }, [data, onlyUnlinked]);

  // Nachbarn des überfahrenen Knotens
  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover.id]);
    for (const l of graph.links) {
      const a = endId(l.source);
      const b = endId(l.target);
      if (a === hover.id) s.add(b);
      if (b === hover.id) s.add(a);
    }
    return s;
  }, [hover, graph.links]);

  const big = graph.nodes.length > 300;

  const paintNode = useCallback(
    (node: PNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = 3 + Math.min(node.linkCount, 12) * 0.6;
      const dim = neighbors !== null && !neighbors.has(node.id);
      ctx.globalAlpha = dim ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
      if (node.linkCount === 0) {
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = RED;
        ctx.stroke();
      }
      if (node.id === focusUid) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2.5 / scale, 0, 2 * Math.PI);
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = '#111827';
        ctx.stroke();
      }
      const showLabel = !dim && (!!focusUid || neighbors !== null || scale >= LABEL_ZOOM);
      if (showLabel) {
        ctx.font = `${11 / scale}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#374151';
        ctx.fillText(node.id, x, y + r + 1.5 / scale);
      }
      ctx.globalAlpha = 1;
    },
    [neighbors, focusUid],
  );

  const paintPointer = useCallback((node: PNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, 5 + Math.min(node.linkCount, 12) * 0.6, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const linkOfHover = (l: GraphLink) =>
    hover !== null && (endId(l.source) === hover.id || endId(l.target) === hover.id);

  // Messung: Zeit von den fertigen Graphdaten bis zum ersten gezeichneten Bild
  const onFrame = useCallback(() => {
    const el = boxRef.current;
    if (el && !el.hasAttribute("data-first-frame-ms")) {
      el.setAttribute("data-first-frame-ms", String(Math.round(performance.now() - t0.current)));
    }
  }, []);

  const onStop = useCallback(() => {
    const ms = Math.round(performance.now() - t0.current);
    boxRef.current?.setAttribute('data-engine-stop-ms', String(ms));
    fgRef.current?.zoomToFit(300, 60);
  }, []);

  const unlinkedCount = useMemo(() => data.nodes.filter((n) => n.linkCount === 0).length, [data.nodes]);
  const usedDocs = useMemo(
    () => docList.filter((d) => data.nodes.some((n) => n.document === d)),
    [docList, data.nodes],
  );
  const colorOf = (d: string) => data.nodes.find((n) => n.document === d)?.color ?? '#94a3b8';

  return (
    <div
      ref={boxRef}
      className="relative w-full bg-gray-50"
      style={{ height: height ?? '100%' }}
      data-testid="force-graph"
      data-nodes={graph.nodes.length}
    >
      <ForceGraph2D<PNode, GraphLink>
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graph}
        nodeId="id"
        nodeRelSize={4}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointer}
        nodeLabel={(n) => `<b>${esc(n.id)}</b> · ${esc(n.document)}<br/>${esc((n.text ?? '').slice(0, 160))}`}
        linkColor={(l) =>
          !l.valid ? '#f87171' : neighbors === null || linkOfHover(l) ? '#94a3b8' : 'rgba(148,163,184,0.12)'
        }
        linkWidth={(l) => (neighbors !== null && linkOfHover(l) ? 2 : 1)}
        linkLineDash={(l) => (l.valid ? null : [4, 2])}
        linkDirectionalArrowLength={focusUid || !big ? 3.5 : 0}
        linkDirectionalArrowRelPos={1}
        onNodeHover={(n) => setHover(n)}
        onNodeClick={(n) => onOpen(n)}
        autoPauseRedraw={false}
        warmupTicks={big ? 60 : 120}
        cooldownTime={big ? 6000 : 3000}
        onEngineStop={onStop}
        onRenderFramePost={onFrame}
        enableNodeDrag
      />
      {controls && (
        <>
          <div className="absolute top-3 left-3 bg-white/95 border border-gray-200 rounded-lg p-3 shadow-sm text-xs space-y-1.5 max-w-[230px]">
            {usedDocs.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorOf(d) }} />
                <span className="font-mono">{d}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <span className="w-3 h-3 rounded-full shrink-0 border-2" style={{ borderColor: RED }} />
              <span>ohne Link ({unlinkedCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="14" height="6" className="shrink-0">
                <line x1="0" y1="3" x2="14" y2="3" stroke="#f87171" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              <span>ungültiger Link</span>
            </div>
            <label className="flex items-center gap-2 pt-1 border-t border-gray-100 cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary-600"
                checked={onlyUnlinked}
                onChange={(e) => setOnlyUnlinked(e.target.checked)}
              />
              <span>nur ohne Link</span>
            </label>
            <p className="text-gray-400 pt-1">Ziehen · Mausrad zoomt · Klick öffnet die Anforderung</p>
          </div>
          <button
            title="Ganzen Graph einpassen"
            onClick={() => fgRef.current?.zoomToFit(300, 60)}
            className="absolute top-3 right-3 p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-600 hover:bg-gray-50"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
