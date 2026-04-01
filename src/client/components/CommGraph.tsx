import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import type { ThreadStatus } from '../types.js';
import type { AgentInfo } from '../../shared/types.js';
import { getAgentColorValues } from '../types.js';

interface CommGraphProps {
	members: AgentInfo[];
	threadStatuses: Record<string, ThreadStatus>;
	onFilterThread: (threadKey: string | null) => void;
	activeFilter: string | null;
}

interface GraphNode {
	name: string;
	color: string;
	x: number;
	y: number;
}

interface GraphEdge {
	source: string;
	target: string;
	threadKey: string;
	weight: number;
	active: boolean;
}

/**
 * Build graph data from team members and thread statuses.
 * Exported for unit testing.
 */
export function buildGraphData(
	members: AgentInfo[],
	threadStatuses: Record<string, ThreadStatus>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	// Only include agents that participate in at least one thread
	const threadAgents = new Set<string>();
	const edges: GraphEdge[] = [];

	for (const thread of Object.values(threadStatuses)) {
		for (const p of thread.participants) {
			threadAgents.add(p);
		}
		if (thread.participants.length === 2) {
			edges.push({
				source: thread.participants[0]!,
				target: thread.participants[1]!,
				threadKey: thread.threadKey,
				weight: thread.messageCount,
				active: thread.status !== 'resolved',
			});
		}
	}

	// Position nodes in a circle
	const relevantMembers = members.filter((m) => threadAgents.has(m.name));
	// If there are agents in threads not in the members list, add them with default color
	for (const name of threadAgents) {
		if (!relevantMembers.some((m) => m.name === name)) {
			relevantMembers.push({
				name,
				agentId: name,
				agentType: 'agent',
				color: 'gray',
			});
		}
	}

	const nodeCount = relevantMembers.length;
	const cx = 100;
	const cy = 100;
	const radius = nodeCount <= 2 ? 40 : 60;

	const nodes: GraphNode[] = relevantMembers.map((member, i) => {
		const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
		return {
			name: member.name,
			color: member.color,
			x: cx + radius * Math.cos(angle),
			y: cy + radius * Math.sin(angle),
		};
	});

	return { nodes, edges };
}

const CANVAS_SIZE = 200;
const NODE_RADIUS = 14;

export function CommGraph({ members, threadStatuses, onFilterThread, activeFilter }: CommGraphProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const threads = Object.values(threadStatuses);

	const { nodes, edges } = useMemo(
		() => buildGraphData(members, threadStatuses),
		[members, threadStatuses],
	);

	// Graceful degrade: hide if fewer than 2 threads
	if (threads.length < 2) return null;

	const nodeMap = useMemo(() => {
		const map = new Map<string, GraphNode>();
		for (const node of nodes) {
			map.set(node.name, node);
		}
		return map;
	}, [nodes]);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// HiDPI support
		const dpr = window.devicePixelRatio || 1;
		canvas.width = CANVAS_SIZE * dpr;
		canvas.height = CANVAS_SIZE * dpr;
		ctx.scale(dpr, dpr);

		ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

		// Draw edges
		for (const edge of edges) {
			const source = nodeMap.get(edge.source);
			const target = nodeMap.get(edge.target);
			if (!source || !target) continue;

			const isFiltered = activeFilter === edge.threadKey;
			const lineWidth = Math.min(1 + edge.weight * 0.5, 5);

			ctx.beginPath();
			ctx.moveTo(source.x, source.y);
			ctx.lineTo(target.x, target.y);
			ctx.strokeStyle = isFiltered
				? 'rgba(91, 109, 247, 0.8)'
				: edge.active
					? 'rgba(126, 146, 170, 0.35)'
					: 'rgba(126, 146, 170, 0.15)';
			ctx.lineWidth = isFiltered ? lineWidth + 1 : lineWidth;
			ctx.stroke();

			// Message count label at midpoint
			const mx = (source.x + target.x) / 2;
			const my = (source.y + target.y) / 2;
			ctx.font = '9px system-ui, sans-serif';
			ctx.fillStyle = isFiltered ? 'rgba(219, 227, 255, 0.9)' : 'rgba(126, 146, 170, 0.5)';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(`${edge.weight}`, mx, my - 6);
		}

		// Draw nodes
		for (const node of nodes) {
			const colorValues = getAgentColorValues(node.color);

			// Node circle
			ctx.beginPath();
			ctx.arc(node.x, node.y, NODE_RADIUS, 0, 2 * Math.PI);
			ctx.fillStyle = colorValues.dark;
			ctx.fill();
			ctx.strokeStyle = colorValues.fill;
			ctx.lineWidth = 1.5;
			ctx.stroke();

			// 2-letter label
			const label = node.name.slice(0, 2).toUpperCase();
			ctx.font = 'bold 9px system-ui, sans-serif';
			ctx.fillStyle = colorValues.light;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(label, node.x, node.y);
		}
	}, [nodes, edges, nodeMap, activeFilter]);

	useEffect(() => {
		draw();
	}, [draw]);

	// Redraw on resize (HiDPI changes)
	useEffect(() => {
		const handleResize = () => draw();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [draw]);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			// Check if click is near an edge midpoint (within 15px)
			for (const edge of edges) {
				const source = nodeMap.get(edge.source);
				const target = nodeMap.get(edge.target);
				if (!source || !target) continue;

				const mx = (source.x + target.x) / 2;
				const my = (source.y + target.y) / 2;
				const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);

				if (dist < 15) {
					// Toggle filter
					onFilterThread(activeFilter === edge.threadKey ? null : edge.threadKey);
					return;
				}
			}

			// Click on background clears filter
			if (activeFilter) {
				onFilterThread(null);
			}
		},
		[edges, nodeMap, activeFilter, onFilterThread],
	);

	return (
		<section className="tc-sidecard tc-rail-section">
			<div className="tc-sidecard-header">
				<span className="tc-sidecard-title">Comm Graph</span>
				{activeFilter && (
					<button
						type="button"
						className="tc-comm-graph-clear"
						onClick={() => onFilterThread(null)}
					>
						clear filter
					</button>
				)}
			</div>
			<div className="tc-comm-graph-canvas-wrap">
				<canvas
					ref={canvasRef}
					className="tc-comm-graph-canvas"
					style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
					onClick={handleClick}
				/>
			</div>
		</section>
	);
}
