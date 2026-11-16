import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import { normalizeWikiTitle } from '../../lib/knowledge/wikiLinksParser';
import type {
  CourseColor,
  KnowledgeGraphData,
  KnowledgeGraphNode,
} from '../../types/domain';
import {
  SwissButton,
  SwissEmptyState,
  SwissErrorAlert,
  SwissSegmented,
  SwissSwitch,
} from '../../ui';
import '../../styles/knowledge.css';

export interface NotesGraphViewProps {
  courseId?: string;
  onSelectNote: (noteId: string, courseId: string) => void;
  onClose?: () => void;
}

type GraphScope = 'course' | 'global';

interface SimNode {
  noteId: string;
  title: string;
  courseId: string;
  courseName: string;
  color: CourseColor;
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

const COURSE_HEX_MAP: Record<CourseColor, string> = {
  blue: '#4A90E2',
  emerald: '#2FA87A',
  violet: '#9B6BE8',
  amber: '#E2A83B',
  rose: '#FF5F52',
  cyan: '#2EB6C9',
  orange: '#E87638',
  slate: '#AEB0B3',
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function nodeRadiusForDegree(degree: number): number {
  return 6 + Math.min(10, degree * 1.8);
}

function readThemePalette(el: HTMLElement | null): {
  bg: string;
  ink: string;
  mut: string;
  rule: string;
  grid: string;
  acc: string;
} {
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) {
    return {
      bg: '#1E2023',
      ink: '#ECECE7',
      mut: '#AEB0B3',
      rule: '#C9CACB',
      grid: 'rgba(201, 202, 203, 0.26)',
      acc: '#FF5F52',
    };
  }
  const styles = window.getComputedStyle(el);
  return {
    bg: styles.getPropertyValue('--bg').trim() || '#1E2023',
    ink: styles.getPropertyValue('--ink').trim() || '#ECECE7',
    mut: styles.getPropertyValue('--mut').trim() || '#AEB0B3',
    rule: styles.getPropertyValue('--rule').trim() || '#C9CACB',
    grid: styles.getPropertyValue('--grid').trim() || 'rgba(201, 202, 203, 0.26)',
    acc: styles.getPropertyValue('--acc').trim() || '#FF5F52',
  };
}

export function NotesGraphView({
  courseId,
  onSelectNote,
  onClose,
}: NotesGraphViewProps) {
  const switchId = useId();
  const filterInputId = useId();

  const [scope, setScope] = useState<GraphScope>(() =>
    courseId ? 'course' : 'global'
  );
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [graphData, setGraphData] = useState<KnowledgeGraphData>({
    nodes: [],
    edges: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasUnavailableRef = useRef<boolean>(false);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const simAlphaRef = useRef<number>(1);
  const rafIdRef = useRef<number | null>(null);
  const transformRef = useRef<{ scale: number; panX: number; panY: number }>({
    scale: 1,
    panX: 0,
    panY: 0,
  });

  const dragStateRef = useRef<
    | {
        mode: 'node';
        noteId: string;
        startX: number;
        startY: number;
        moved: boolean;
      }
    | {
        mode: 'pan';
        startX: number;
        startY: number;
        startPanX: number;
        startPanY: number;
        moved: boolean;
      }
    | null
  >(null);

  useEffect(() => {
    setScope(courseId ? 'course' : 'global');
  }, [courseId]);

  const loadGraph = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const effectiveCourseId =
        scope === 'course' && courseId ? courseId : undefined;
      const data = await cursadaClient.getKnowledgeGraph({
        courseId: effectiveCourseId,
        includeArchived,
      });
      setGraphData(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el grafo de conocimiento.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [scope, courseId, includeArchived]);

  useEffect(() => {
    void loadGraph();

    const handleDataChanged = () => {
      void loadGraph();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadGraph]);

  const visibleNodes = useMemo(() => {
    const normalizedFilter = normalizeWikiTitle(filterQuery);
    if (!normalizedFilter) {
      return graphData.nodes;
    }
    return graphData.nodes.filter(
      (node) =>
        normalizeWikiTitle(node.title).includes(normalizedFilter) ||
        normalizeWikiTitle(node.courseName).includes(normalizedFilter)
    );
  }, [graphData.nodes, filterQuery]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.noteId)),
    [visibleNodes]
  );

  const visibleEdges = useMemo(
    () =>
      graphData.edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.sourceNoteId) &&
          visibleNodeIds.has(edge.targetNoteId)
      ),
    [graphData.edges, visibleNodeIds]
  );

  const neighborsByNoteId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of visibleEdges) {
      let srcSet = map.get(edge.sourceNoteId);
      if (!srcSet) {
        srcSet = new Set<string>();
        map.set(edge.sourceNoteId, srcSet);
      }
      srcSet.add(edge.targetNoteId);

      let tgtSet = map.get(edge.targetNoteId);
      if (!tgtSet) {
        tgtSet = new Set<string>();
        map.set(edge.targetNoteId, tgtSet);
      }
      tgtSet.add(edge.sourceNoteId);
    }
    return map;
  }, [visibleEdges]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasUnavailableRef.current) {
      return;
    }
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) {
      canvasUnavailableRef.current = true;
      return;
    }

    const wrap = canvasWrapRef.current;
    const width = Math.max(300, wrap?.clientWidth || canvas.clientWidth || 640);
    const height = Math.max(260, wrap?.clientHeight || canvas.clientHeight || 420);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    if (
      canvas.width !== Math.floor(width * dpr) ||
      canvas.height !== Math.floor(height * dpr)
    ) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const palette = readThemePalette(canvas);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    const { scale, panX, panY } = transformRef.current;

    // Subtle Swiss architectural grid
    const gridSpacing = 48 * scale;
    if (gridSpacing >= 18) {
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      const offsetX = ((width / 2 + panX) % gridSpacing + gridSpacing) % gridSpacing;
      const offsetY = ((height / 2 + panY) % gridSpacing + gridSpacing) % gridSpacing;
      ctx.beginPath();
      for (let gx = offsetX; gx < width; gx += gridSpacing) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
      }
      for (let gy = offsetY; gy < height; gy += gridSpacing) {
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
      }
      ctx.stroke();
    }

    ctx.translate(width / 2 + panX, height / 2 + panY);
    ctx.scale(scale, scale);

    const simMap = simNodesRef.current;
    const activeHover = hoveredNodeId;
    const activeNeighbors = activeHover
      ? neighborsByNoteId.get(activeHover) ?? new Set<string>()
      : null;

    // Draw edges
    for (const edge of visibleEdges) {
      const src = simMap.get(edge.sourceNoteId);
      const tgt = simMap.get(edge.targetNoteId);
      if (!src || !tgt) {
        continue;
      }

      const isIncident =
        activeHover !== null &&
        (edge.sourceNoteId === activeHover || edge.targetNoteId === activeHover);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      if (activeHover) {
        ctx.strokeStyle = isIncident ? palette.acc : palette.rule;
        ctx.globalAlpha = isIncident ? 0.95 : 0.16;
        ctx.lineWidth = (isIncident ? 2 : 1) / scale;
      } else {
        ctx.strokeStyle = palette.rule;
        ctx.globalAlpha = 0.48;
        ctx.lineWidth = 1.25 / scale;
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw nodes & labels
    const nodesList = Array.from(simMap.values());
    for (const node of nodesList) {
      const isHovered = activeHover === node.noteId;
      const isNeighbor =
        activeHover !== null && Boolean(activeNeighbors?.has(node.noteId));
      const isDimmed = activeHover !== null && !isHovered && !isNeighbor;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.25 : 1;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = isHovered
        ? palette.acc
        : COURSE_HEX_MAP[node.color] || palette.ink;
      ctx.fill();
      ctx.lineWidth = (isHovered || isNeighbor ? 2.5 : 1.5) / scale;
      ctx.strokeStyle = isHovered ? palette.ink : palette.bg;
      ctx.stroke();

      const shouldDrawLabel =
        scale >= 0.72 || isHovered || isNeighbor || node.degree >= 2;
      if (shouldDrawLabel) {
        const fontSize = Math.max(10, Math.min(13, 11.5 / Math.sqrt(scale)));
        ctx.font = `${isHovered ? 700 : 500} ${fontSize}px Archivo, Helvetica, Arial, sans-serif`;
        ctx.fillStyle = isHovered ? palette.acc : palette.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelText =
          node.title.length > 28 ? `${node.title.slice(0, 26)}…` : node.title;
        ctx.fillText(labelText, node.x + node.radius + 6, node.y);
      }

      ctx.restore();
    }

    ctx.restore();
  }, [hoveredNodeId, neighborsByNoteId, visibleEdges]);

  // Synchronize simulation nodes whenever filtered nodes change
  useEffect(() => {
    const nextMap = new Map<string, SimNode>();
    const prevMap = simNodesRef.current;

    visibleNodes.forEach((node, index) => {
      const existing = prevMap.get(node.noteId);
      const radius = nodeRadiusForDegree(node.degree);
      if (existing) {
        nextMap.set(node.noteId, {
          ...existing,
          title: node.title,
          courseId: node.courseId,
          courseName: node.courseName,
          color: node.courseColor,
          degree: node.degree,
          radius,
        });
      } else {
        const angle = index * 2.399963229728653; // Golden angle
        const dist = 28 + Math.sqrt(index + 1) * 32;
        nextMap.set(node.noteId, {
          noteId: node.noteId,
          title: node.title,
          courseId: node.courseId,
          courseName: node.courseName,
          color: node.courseColor,
          degree: node.degree,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius,
          pinned: false,
        });
      }
    });

    simNodesRef.current = nextMap;
    simAlphaRef.current = 1;
    drawCanvas();
  }, [visibleNodes, drawCanvas]);

  // Force-directed layout loop
  useEffect(() => {
    if (visibleNodes.length === 0) {
      drawCanvas();
      return;
    }

    let cancelled = false;

    const stepSimulation = () => {
      if (cancelled) {
        return;
      }

      const simMap = simNodesRef.current;
      const nodes = Array.from(simMap.values());
      const alpha = simAlphaRef.current;

      if (alpha > 0.015 && nodes.length > 0) {
        // 1. Soft pair repulsion
        const repulsionStrength = 2600;
        for (let i = 0; i < nodes.length; i += 1) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 16) {
              dx = 2 + (i % 3);
              dy = 2 + (j % 3);
              distSq = dx * dx + dy * dy;
            }
            const dist = Math.sqrt(distSq);
            const force = (repulsionStrength / distSq) * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (!a.pinned) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (!b.pinned) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }

        // 2. Spring attraction along edges
        const targetDist = 110;
        const springK = 0.045;
        for (const edge of visibleEdges) {
          const src = simMap.get(edge.sourceNoteId);
          const tgt = simMap.get(edge.targetNoteId);
          if (!src || !tgt) {
            continue;
          }
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const displacement = dist - targetDist;
          const force = displacement * springK * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!src.pinned) {
            src.vx += fx;
            src.vy += fy;
          }
          if (!tgt.pinned) {
            tgt.vx -= fx;
            tgt.vy -= fy;
          }
        }

        // 3. Center gravity + integration
        const gravity = 0.025;
        const damping = 0.8;
        for (const node of nodes) {
          if (node.pinned) {
            node.vx = 0;
            node.vy = 0;
            continue;
          }
          node.vx = (node.vx - node.x * gravity) * damping;
          node.vy = (node.vy - node.y * gravity) * damping;
          const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
          if (speed > 18) {
            node.vx = (node.vx / speed) * 18;
            node.vy = (node.vy / speed) * 18;
          }
          node.x += node.vx;
          node.y += node.vy;
        }

        simAlphaRef.current = alpha * 0.965;
        drawCanvas();

        if (
          !canvasUnavailableRef.current &&
          typeof window !== 'undefined' &&
          typeof window.requestAnimationFrame === 'function'
        ) {
          rafIdRef.current = window.requestAnimationFrame(stepSimulation);
        }
      } else {
        drawCanvas();
      }
    };

    if (
      !canvasUnavailableRef.current &&
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      rafIdRef.current = window.requestAnimationFrame(stepSimulation);
    }

    return () => {
      cancelled = true;
      if (
        rafIdRef.current !== null &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [visibleNodes, visibleEdges, drawCanvas]);

  // Redraw when hovered node or resize changes
  useEffect(() => {
    drawCanvas();
  }, [hoveredNodeId, drawCanvas]);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      drawCanvas();
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [drawCanvas]);

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.clientWidth || 640;
    const height = rect.height || canvas.clientHeight || 420;
    const { scale, panX, panY } = transformRef.current;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: (localX - (width / 2 + panX)) / scale,
      y: (localY - (height / 2 + panY)) / scale,
    };
  }

  function findHitNode(worldX: number, worldY: number): SimNode | null {
    const nodes = Array.from(simNodesRef.current.values());
    const hitPadding = 5 / transformRef.current.scale;
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const r = node.radius + hitPadding;
      if (dx * dx + dy * dy <= r * r) {
        return node;
      }
    }
    return null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const world = clientToWorld(event.clientX, event.clientY);
    const hit = findHitNode(world.x, world.y);

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore synthetic events in tests without active pointerId
    }

    if (hit) {
      hit.pinned = true;
      dragStateRef.current = {
        mode: 'node',
        noteId: hit.noteId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      setIsDraggingCanvas(true);
    } else {
      dragStateRef.current = {
        mode: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        startPanX: transformRef.current.panX,
        startPanY: transformRef.current.panY,
        moved: false,
      };
      setIsDraggingCanvas(true);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current;
    if (drag) {
      const dist = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY
      );
      if (dist > 4) {
        drag.moved = true;
      }

      if (drag.mode === 'node') {
        const node = simNodesRef.current.get(drag.noteId);
        if (node) {
          const world = clientToWorld(event.clientX, event.clientY);
          node.x = world.x;
          node.y = world.y;
          node.vx = 0;
          node.vy = 0;
          node.pinned = true;
          drawCanvas();
        }
      } else {
        transformRef.current.panX =
          drag.startPanX + (event.clientX - drag.startX);
        transformRef.current.panY =
          drag.startPanY + (event.clientY - drag.startY);
        drawCanvas();
      }
      return;
    }

    const world = clientToWorld(event.clientX, event.clientY);
    const hit = findHitNode(world.x, world.y);
    const nextHover = hit ? hit.noteId : null;
    if (nextHover !== hoveredNodeId) {
      setHoveredNodeId(nextHover);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    setIsDraggingCanvas(false);

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore synthetic events in tests
    }

    if (drag?.mode === 'node' && !drag.moved) {
      const node = simNodesRef.current.get(drag.noteId);
      if (node) {
        onSelectNote(node.noteId, node.courseId);
      }
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = clampZoom(transformRef.current.scale * factor);
    transformRef.current.scale = nextScale;
    setZoomPercent(Math.round(nextScale * 100));
    drawCanvas();
  }

  function handleZoomIn(): void {
    const nextScale = clampZoom(transformRef.current.scale * 1.25);
    transformRef.current.scale = nextScale;
    setZoomPercent(Math.round(nextScale * 100));
    drawCanvas();
  }

  function handleZoomOut(): void {
    const nextScale = clampZoom(transformRef.current.scale / 1.25);
    transformRef.current.scale = nextScale;
    setZoomPercent(Math.round(nextScale * 100));
    drawCanvas();
  }

  function handleCenterGraph(): void {
    transformRef.current = { scale: 1, panX: 0, panY: 0 };
    setZoomPercent(100);
    let idx = 0;
    for (const node of simNodesRef.current.values()) {
      const angle = idx * 2.399963229728653;
      const dist = 28 + Math.sqrt(idx + 1) * 32;
      node.pinned = false;
      node.x = Math.cos(angle) * dist;
      node.y = Math.sin(angle) * dist;
      node.vx = 0;
      node.vy = 0;
      idx += 1;
    }
    simAlphaRef.current = 0.9;
    drawCanvas();
  }

  const sortedIndexNodes = useMemo<KnowledgeGraphNode[]>(() => {
    return [...visibleNodes].sort(
      (a, b) =>
        b.degree - a.degree || a.title.localeCompare(b.title, 'es')
    );
  }, [visibleNodes]);

  return (
    <section
      className="graph-view-shell"
      aria-label="Grafo de conocimiento"
      data-testid="notes-graph-view"
    >
      <div className="graph-controls-bar">
        <div className="graph-controls-left">
          {courseId ? (
            <SwissSegmented<GraphScope>
              ariaLabel="Alcance del grafo"
              value={scope}
              options={[
                { value: 'course', label: 'Anotador actual' },
                { value: 'global', label: 'Grafo global' },
              ]}
              onChange={(next) => setScope(next)}
            />
          ) : null}

          <label htmlFor={switchId} className="graph-archived-toggle">
            <SwissSwitch
              id={switchId}
              checked={includeArchived}
              onChange={setIncludeArchived}
              ariaLabel="Incluir archivados"
            />
            <span>Incluir archivados</span>
          </label>

          <input
            id={filterInputId}
            type="search"
            className="swiss-input graph-filter-input"
            aria-label="Filtrar notas en el grafo"
            placeholder="Filtrar por nota o anotador…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>

        <div className="graph-controls-right">
          <div className="graph-zoom-group" role="group" aria-label="Controles de zoom">
            <SwissButton
              variant="secondary"
              className="graph-zoom-btn"
              aria-label="Acercar grafo"
              onClick={handleZoomIn}
            >
              +
            </SwissButton>
            <SwissButton
              variant="secondary"
              className="graph-zoom-btn"
              aria-label="Alejar grafo"
              onClick={handleZoomOut}
            >
              −
            </SwissButton>
            <SwissButton
              variant="secondary"
              className="graph-zoom-btn"
              aria-label="Centrar grafo"
              onClick={handleCenterGraph}
            >
              Centrar
            </SwissButton>
          </div>

          {onClose ? (
            <SwissButton variant="secondary" onClick={onClose}>
              Cerrar
            </SwissButton>
          ) : null}
        </div>
      </div>

      {errorMessage ? <SwissErrorAlert message={errorMessage} /> : null}

      <div className="graph-workspace-grid">
        <div ref={canvasWrapRef} className="graph-canvas-wrap">
          {!isLoading && visibleNodes.length === 0 ? (
            <div className="graph-canvas-empty">
              <SwissEmptyState
                title={
                  graphData.nodes.length === 0
                    ? 'Sin notas para graficar'
                    : 'Ninguna nota coincide con el filtro'
                }
                description={
                  graphData.nodes.length === 0
                    ? 'Creá apuntes y conectalos usando [[Nombre de nota]] para visualizar tu red.'
                    : 'Probá otro término o limpiá el filtro de búsqueda.'
                }
                actionLabel={filterQuery ? 'Limpiar filtro' : undefined}
                onAction={filterQuery ? () => setFilterQuery('') : undefined}
              />
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className={`graph-canvas ${isDraggingCanvas ? 'is-dragging' : ''}`}
                aria-label="Lienzo interactivo del grafo de notas"
                data-testid="notes-graph-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => {
                  if (!dragStateRef.current) {
                    setHoveredNodeId(null);
                  }
                }}
                onWheel={handleWheel}
              />
              <div className="graph-canvas-hud" aria-hidden="true">
                <span>
                  {visibleNodes.length}{' '}
                  {visibleNodes.length === 1 ? 'nota' : 'notas'}
                </span>
                <span>
                  {visibleEdges.length}{' '}
                  {visibleEdges.length === 1 ? 'enlace' : 'enlaces'}
                </span>
                <span>{zoomPercent}%</span>
              </div>
            </>
          )}
        </div>

        <aside
          className="graph-nodes-index"
          aria-label="Índice de notas visibles en el grafo"
        >
          <div className="graph-nodes-index-head">
            <h3 className="swiss-section-label">Nodos visibles</h3>
            <span className="swiss-meta">
              {sortedIndexNodes.length} · {visibleEdges.length} enlaces
            </span>
          </div>

          {isLoading && sortedIndexNodes.length === 0 ? (
            <p className="swiss-meta-md">Cargando grafo…</p>
          ) : sortedIndexNodes.length === 0 ? (
            <p className="swiss-meta-md">Sin nodos visibles.</p>
          ) : (
            <ul
              className="graph-nodes-list"
              aria-label="Nodos del grafo"
              aria-busy={isLoading ? 'true' : undefined}
            >
              {sortedIndexNodes.map((node) => {
                const isHighlighted = hoveredNodeId === node.noteId;
                return (
                  <li key={node.noteId} className="graph-node-list-item">
                    <button
                      type="button"
                      className={`graph-node-list-btn ${isHighlighted ? 'is-highlighted' : ''}`}
                      onMouseEnter={() => setHoveredNodeId(node.noteId)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onFocus={() => setHoveredNodeId(node.noteId)}
                      onBlur={() => setHoveredNodeId(null)}
                      onClick={() => onSelectNote(node.noteId, node.courseId)}
                    >
                      <span className="graph-node-list-main">
                        <span
                          className="graph-node-color-square"
                          data-course-color={node.courseColor}
                          aria-hidden="true"
                        />
                        <span className="graph-node-list-text">
                          <span className="graph-node-list-title">
                            {node.title}
                          </span>
                          <span className="graph-node-list-course">
                            {node.courseName}
                          </span>
                        </span>
                      </span>
                      <span
                        className="graph-node-degree"
                        title={`${node.degree} conexiones`}
                      >
                        {node.degree}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
