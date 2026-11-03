// The branch view of goals (docs/PLAN.md, 2026-11-03 log): goals are nodes, "leads to" links are arrows, and a
// sub-goal hangs off its parent. Pure: the layout and the cycle rule are unit-tested, and the canvas only draws.

export type GraphNode = { id: string; parentId: string | null };
export type GraphEdge = { from: string; to: string };

/** Every arrow the layout follows: the links, plus parent → sub-goal. */
export function allEdges(nodes: GraphNode[], links: GraphEdge[]): GraphEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  const hierarchy = nodes.filter((node) => node.parentId !== null && ids.has(node.parentId)).map((node) => ({ from: node.parentId!, to: node.id }));
  return [...links.filter((edge) => ids.has(edge.from) && ids.has(edge.to)), ...hierarchy];
}

/** Whether `to` already reaches `from`, so that adding from → to would close a loop. */
export function wouldCycle(edges: GraphEdge[], from: string, to: string): boolean {
  if (from === to) return true;
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === from) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(next.get(node) ?? []));
  }
  return false;
}

export type GraphPosition = { column: number; row: number };

export type GraphLayout = {
  /** Node ids by column, top to bottom. */
  columns: string[][];
  positions: Map<string, GraphPosition>;
};

/**
 * A left-to-right layered layout: a goal with nothing leading into it sits in the first column; every other goal
 * one column to the right of the last thing that leads into it. Within a column, goals line up with what they
 * follow (the average row of their predecessors), ties keeping the order given (the list's: soonest target first).
 * Edges that would form a loop are ignored rather than looping forever.
 */
export function layoutGraph(nodes: GraphNode[], links: GraphEdge[]): GraphLayout {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = allEdges(nodes, links);
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    incoming.get(edge.to)!.push(edge.from);
    outgoing.get(edge.from)!.push(edge.to);
  }

  // Longest-path layering by a topological pass; anything left over (a loop) is dropped at the end.
  const column = new Map<string, number>();
  const pending = new Map(nodes.map((node) => [node.id, incoming.get(node.id)!.length]));
  let frontier = nodes.filter((node) => pending.get(node.id) === 0).map((node) => node.id);
  for (const id of frontier) column.set(id, 0);
  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const to of outgoing.get(id)!) {
        column.set(to, Math.max(column.get(to) ?? 0, (column.get(id) ?? 0) + 1));
        pending.set(to, pending.get(to)! - 1);
        if (pending.get(to) === 0) nextFrontier.push(to);
      }
    }
    frontier = nextFrontier;
  }
  for (const node of nodes) if (!column.has(node.id)) column.set(node.id, 0);

  const width = Math.max(0, ...[...column.values()]) + 1;
  const columns: string[][] = Array.from({ length: width }, () => []);
  for (const node of nodes) columns[column.get(node.id)!].push(node.id);

  const positions = new Map<string, GraphPosition>();
  columns.forEach((ids, index) => {
    const key = (id: string): number => {
      const preds = incoming.get(id)!.filter((from) => positions.has(from));
      if (preds.length === 0) return order.get(id)!;
      return preds.reduce((sum, from) => sum + positions.get(from)!.row, 0) / preds.length;
    };
    const sorted = [...ids].sort((a, b) => key(a) - key(b) || order.get(a)! - order.get(b)!);
    columns[index] = sorted;
    sorted.forEach((id, row) => positions.set(id, { column: index, row }));
  });
  return { columns, positions };
}
