"use client";

import { useState } from "react";
import type { N8nNode } from "@/types";

interface WorkflowGraphProps {
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  /** Called when the user clicks a node — passes the full node object. */
  onNodeClick?: (node: N8nNode) => void;
  /** Name of the currently selected node, for highlight ring. */
  selectedNodeName?: string | null;
  width?: number;
  height?: number;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  "n8n-nodes-base.webhook":         "#00ff88",
  "n8n-nodes-base.scheduleTrigger": "#00ff88",
  "n8n-nodes-base.manualTrigger":   "#00ff88",
  "n8n-nodes-base.httpRequest":     "#86a7ff",
  "n8n-nodes-base.code":            "#f7d774",
  "n8n-nodes-base.function":        "#f7d774",
  "n8n-nodes-base.if":              "#f7a35c",
  "n8n-nodes-base.switch":          "#f7a35c",
  "n8n-nodes-base.splitInBatches":  "#c084fc",
  "n8n-nodes-base.slack":           "#86a7ff",
  "n8n-nodes-base.gmail":           "#86a7ff",
  "n8n-nodes-base.postgres":        "#00cc66",
  "n8n-nodes-base.set":             "rgba(240,240,240,0.7)",
  "n8n-nodes-base.editFields":      "rgba(240,240,240,0.7)",
};

function getNodeColor(type: string): string {
  if (type.includes("langchain") || type.includes("openAi") || type.includes("anthropic")) return "#c084fc";
  if (type.toLowerCase().includes("trigger")) return "#00ff88";
  return NODE_TYPE_COLORS[type] ?? "rgba(240,240,240,0.45)";
}

function getNodeLabel(node: N8nNode): string {
  return node.name.length > 14 ? node.name.slice(0, 12) + "…" : node.name;
}

function layoutNodes(
  nodes: N8nNode[],
  connections: Record<string, unknown>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const hasPositions = nodes.some((n) => n.position && n.position.length === 2);
  if (hasPositions) {
    const xs = nodes.map((n) => n.position?.[0] ?? 0);
    const ys = nodes.map((n) => n.position?.[1] ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = Math.max(maxX - minX, 1);
    const rangeY = Math.max(maxY - minY, 1);
    for (const node of nodes) {
      positions.set(node.name, {
        x: 60 + (((node.position?.[0] ?? 0) - minX) / rangeX) * 860,
        y: 50 + (((node.position?.[1] ?? 0) - minY) / rangeY) * 300,
      });
    }
    return positions;
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of nodes) { inDegree.set(node.name, 0); adj.set(node.name, []); }

  for (const [src, outputs] of Object.entries(connections)) {
    const connsObj = outputs as Record<string, Array<Array<{ node: string }>>>;
    for (const group of Object.values(connsObj.main ?? {})) {
      for (const targets of group ?? []) {
        if (!Array.isArray(targets)) continue;
        for (const t of targets) {
          if (t?.node) {
            adj.get(src)?.push(t.node);
            inDegree.set(t.node, (inDegree.get(t.node) ?? 0) + 1);
          }
        }
      }
    }
  }

  const cols: string[][] = [];
  const queue = nodes.filter((n) => (inDegree.get(n.name) ?? 0) === 0).map((n) => n.name);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const col: string[] = [];
    const nextQueue: string[] = [];
    for (const name of queue) {
      if (visited.has(name)) continue;
      visited.add(name);
      col.push(name);
      for (const next of adj.get(name) ?? []) {
        if (!visited.has(next)) nextQueue.push(next);
      }
    }
    if (col.length > 0) cols.push(col);
    queue.length = 0;
    queue.push(...nextQueue);
  }
  const remaining = nodes.filter((n) => !visited.has(n.name));
  if (remaining.length > 0) cols.push(remaining.map((n) => n.name));

  const colWidth = Math.min(140, 900 / Math.max(cols.length, 1));
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    const rowHeight = Math.min(80, 350 / Math.max(col.length, 1));
    for (let r = 0; r < col.length; r++) {
      positions.set(col[r], { x: 50 + c * colWidth, y: 40 + r * rowHeight });
    }
  }
  return positions;
}

export function WorkflowGraph({
  nodes,
  connections,
  onNodeClick,
  selectedNodeName,
  width = 960,
  height = 420,
}: WorkflowGraphProps) {
  const positions = layoutNodes(nodes, connections);
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; type: string }> = [];

  for (const [src, outputs] of Object.entries(connections)) {
    const srcPos = positions.get(src);
    if (!srcPos) continue;
    for (const [connType, outputArr] of Object.entries(outputs as Record<string, unknown>)) {
      if (!Array.isArray(outputArr)) continue;
      for (const group of outputArr) {
        if (!Array.isArray(group)) continue;
        for (const t of group as Array<{ node: string }>) {
          if (!t?.node) continue;
          const tPos = positions.get(t.node);
          if (!tPos) continue;
          edges.push({ x1: srcPos.x + 20, y1: srcPos.y + 12, x2: tPos.x, y2: tPos.y + 12, type: connType });
        }
      }
    }
  }

  const nodeW = 40;
  const nodeH = 24;

  return (
    <div className="w-full overflow-x-auto terminal-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ background: "rgba(0,0,0,0.3)", display: "block" }}>

        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.25)" />
          </marker>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Edges */}
        {edges.map((e, i) => {
          const isAi = e.type.startsWith("ai_");
          const mx = (e.x1 + e.x2) / 2;
          return (
            <path key={i}
              d={`M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`}
              fill="none"
              stroke={isAi ? "rgba(192,132,252,0.5)" : "rgba(255,255,255,0.18)"}
              strokeWidth={isAi ? 1.5 : 1}
              strokeDasharray={isAi ? "4,3" : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.name);
          if (!pos) return null;
          const color = getNodeColor(node.type);
          const label = getNodeLabel(node);
          const isSelected = node.name === selectedNodeName;
          const isDisabled = node.disabled;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              opacity={isDisabled ? 0.35 : 1}
              onClick={() => onNodeClick?.(node)}
              style={{ cursor: onNodeClick ? "pointer" : "default" }}>
              {/* Selection halo */}
              {isSelected && (
                <rect
                  x={-4} y={-4} width={nodeW + 8} height={nodeH + 8} rx={4}
                  fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}
                  style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
                />
              )}
              <rect
                x={0} y={0} width={nodeW} height={nodeH} rx={2}
                fill={isSelected ? `${color}18` : "rgba(8,8,8,0.88)"}
                stroke={color}
                strokeWidth={isSelected ? 1.5 : 1}
                style={{ filter: `drop-shadow(0 0 ${isSelected ? 8 : 4}px ${color}${isSelected ? "66" : "33"})` }}
              />
              <text
                x={nodeW / 2} y={nodeH * 0.65}
                textAnchor="middle" fontSize={7} fill={color}
                fontFamily="var(--font-mono)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
