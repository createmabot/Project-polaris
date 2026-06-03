import { StrategyVersionLineageData } from '../api/types';

export const LINEAGE_NODE_WIDTH = 184;
export const LINEAGE_NODE_HEIGHT = 96;
const LINEAGE_MARGIN_X = 32;
const LINEAGE_MARGIN_Y = 36;
const LINEAGE_HORIZONTAL_GAP = 240;
const LINEAGE_VERTICAL_GAP = 118;
const LINEAGE_ROOT_GAP = 56;

export type LineageLayoutNode = StrategyVersionLineageData['nodes'][number] & {
  x: number;
  y: number;
};

export type LineageLayout = {
  nodes: LineageLayoutNode[];
  edges: Array<StrategyVersionLineageData['edges'][number] & {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  width: number;
  height: number;
};

export function buildStrategyVersionLineageApiPath(strategyId: string): string {
  return `/api/strategies/${strategyId}/version-lineage?limit=300`;
}

function toSafeTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function resolveNextLineageZoom(current: number, action: 'in' | 'out' | 'reset'): number {
  if (action === 'reset') return 1;
  const next = action === 'in' ? current + 0.2 : current - 0.2;
  return Math.min(1.8, Math.max(0.6, Number(next.toFixed(2))));
}

export function buildLineageLayout(lineage: StrategyVersionLineageData | undefined): LineageLayout {
  const nodes = lineage?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParentId = new Map<string, StrategyVersionLineageData['nodes']>();
  const sortedNodes = [...nodes].sort((a, b) => {
    const diff = (toSafeTimestamp(a.created_at) ?? 0) - (toSafeTimestamp(b.created_at) ?? 0);
    return diff || a.id.localeCompare(b.id);
  });

  const wouldCreateCycle = (node: StrategyVersionLineageData['nodes'][number]): boolean => {
    const seen = new Set<string>([node.id]);
    let parentId = node.cloned_from_version_id;
    while (parentId) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      parentId = parent.cloned_from_version_id;
    }
    return false;
  };

  for (const node of sortedNodes) {
    const parentId = node.cloned_from_version_id;
    if (!parentId || !byId.has(parentId) || wouldCreateCycle(node)) {
      continue;
    }
    const children = childrenByParentId.get(parentId) ?? [];
    children.push(node);
    childrenByParentId.set(parentId, children);
  }

  const roots = sortedNodes.filter(
    (node) => !node.cloned_from_version_id || !byId.has(node.cloned_from_version_id) || wouldCreateCycle(node),
  );
  const positionedById = new Map<string, LineageLayoutNode>();
  let cursorY = LINEAGE_MARGIN_Y;
  let maxDepth = 0;
  let maxY = 0;

  const layoutSubtree = (
    node: StrategyVersionLineageData['nodes'][number],
    depth: number,
    stack = new Set<string>(),
  ): number => {
    if (stack.has(node.id)) {
      const y = cursorY;
      cursorY += LINEAGE_VERTICAL_GAP;
      positionedById.set(node.id, {
        ...node,
        x: LINEAGE_MARGIN_X + depth * LINEAGE_HORIZONTAL_GAP,
        y,
      });
      maxDepth = Math.max(maxDepth, depth);
      maxY = Math.max(maxY, y);
      return y;
    }

    const children = (childrenByParentId.get(node.id) ?? []).filter((child) => !stack.has(child.id));
    const nextStack = new Set([...stack, node.id]);
    let y: number;
    if (children.length === 0) {
      y = cursorY;
      cursorY += LINEAGE_VERTICAL_GAP;
    } else {
      const childYs = children.map((child) => layoutSubtree(child, depth + 1, nextStack));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    }

    positionedById.set(node.id, {
      ...node,
      x: LINEAGE_MARGIN_X + depth * LINEAGE_HORIZONTAL_GAP,
      y,
    });
    maxDepth = Math.max(maxDepth, depth);
    maxY = Math.max(maxY, y);
    return y;
  };

  for (const root of roots) {
    const beforeY = cursorY;
    layoutSubtree(root, 0);
    if (cursorY === beforeY) {
      cursorY += LINEAGE_VERTICAL_GAP;
    }
    cursorY += LINEAGE_ROOT_GAP;
  }

  for (const node of sortedNodes) {
    if (!positionedById.has(node.id)) {
      layoutSubtree(node, 0);
      cursorY += LINEAGE_ROOT_GAP;
    }
  }

  const positioned = sortedNodes
    .map((node) => positionedById.get(node.id))
    .filter((node): node is LineageLayoutNode => Boolean(node));
  const edges = (lineage?.edges ?? [])
    .map((edge) => {
      const from = positionedById.get(edge.from_version_id);
      const to = positionedById.get(edge.to_version_id);
      if (!from || !to) return null;
      return {
        ...edge,
        x1: from.x + LINEAGE_NODE_WIDTH,
        y1: from.y + LINEAGE_NODE_HEIGHT / 2,
        x2: to.x,
        y2: to.y + LINEAGE_NODE_HEIGHT / 2,
      };
    })
    .filter((edge): edge is LineageLayout['edges'][number] => edge !== null);

  return {
    nodes: positioned,
    edges,
    width: Math.max(720, LINEAGE_MARGIN_X + (maxDepth + 1) * LINEAGE_HORIZONTAL_GAP),
    height: Math.max(260, maxY + LINEAGE_NODE_HEIGHT + LINEAGE_MARGIN_Y),
  };
}

function formatMetricNumber(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString();
}

function formatMetricPercent(value: number): string {
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${formatMetricNumber(normalized, 1)}%`;
}

export function lineageMetricBadges(metrics: StrategyVersionLineageData['nodes'][number]['latest_backtest_metrics']) {
  if (!metrics) return [];
  const badges: string[] = [];
  if (typeof metrics.profit_factor === 'number') badges.push(`PF ${formatMetricNumber(metrics.profit_factor, 2)}`);
  if (typeof metrics.win_rate === 'number') badges.push(`勝率 ${formatMetricPercent(metrics.win_rate)}`);
  if (typeof metrics.max_drawdown === 'number') badges.push(`DD ${formatMetricPercent(metrics.max_drawdown)}`);
  if (typeof metrics.total_trades === 'number') badges.push(`取引 ${formatMetricNumber(metrics.total_trades, 0)}`);
  return badges.slice(0, 4);
}
