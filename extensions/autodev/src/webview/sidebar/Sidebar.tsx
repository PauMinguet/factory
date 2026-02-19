/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useCallback } from 'react';
import { postMessage } from '../shared/useVSCodeApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus =
	| 'backlog'
	| 'planning'
	| 'plan_review'
	| 'queued'
	| 'in_progress'
	| 'testing'
	| 'completed'
	| 'failed'
	| 'merged';

interface Ticket {
	id: string;
	title: string;
	status: TicketStatus;
	startedAt?: string | Date;
	branch?: string;
	error?: string;
	metadata: {
		tokensUsed?: number;
		costEstimate?: number;
	};
}

interface Project {
	id: string;
	name: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMN_ORDER: TicketStatus[] = [
	'backlog',
	'planning',
	'plan_review',
	'queued',
	'in_progress',
	'testing',
	'completed',
	'failed',
];

const COLUMN_LABELS: Record<TicketStatus, string> = {
	backlog: '📝 Backlog',
	planning: '🤔 Planning',
	plan_review: '👁 Plan Review',
	queued: '⏳ Queued',
	in_progress: '🔄 In Progress',
	testing: '🧪 Testing',
	completed: '✅ Completed',
	failed: '❌ Failed',
	merged: '🔀 Merged',
};

const ACTIVE_STATUSES: TicketStatus[] = ['planning', 'queued', 'in_progress', 'testing'];

const NEEDS_ATTENTION_STATUSES: TicketStatus[] = ['plan_review', 'failed'];

// Default collapse state per column
function defaultCollapsed(tickets: Ticket[]): Record<TicketStatus, boolean> {
	const result = {} as Record<TicketStatus, boolean>;
	for (const col of COLUMN_ORDER) {
		const count = tickets.filter(t => t.status === col).length;
		if (col === 'testing' || col === 'completed') {
			result[col] = true; // collapsed by default
		} else if (col === 'failed') {
			result[col] = count === 0; // collapsed only when empty
		} else {
			result[col] = count === 0; // other empty columns collapse
		}
	}
	result['merged'] = true;
	return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(startedAt: string | Date | undefined, now: number): string {
	if (!startedAt) { return ''; }
	const start = typeof startedAt === 'string' ? new Date(startedAt).getTime() : (startedAt as Date).getTime();
	if (isNaN(start)) { return ''; }
	const elapsed = Math.floor((now - start) / 1000);
	const m = Math.floor(elapsed / 60);
	const s = elapsed % 60;
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function progressBar(pct: number): string {
	const filled = Math.round(pct / 10);
	const empty = 10 - filled;
	return '█'.repeat(filled) + '░'.repeat(empty);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface TicketRowProps {
	ticket: Ticket;
	pct?: number;
	now: number;
	showActions?: 'attention' | 'column';
}

function TicketRow({ ticket, pct, now, showActions = 'column' }: TicketRowProps) {
	const isRunning = ACTIVE_STATUSES.includes(ticket.status);
	const elapsed = isRunning ? formatElapsed(ticket.startedAt, now) : '';

	const handleOpen = useCallback(() => {
		postMessage({ type: 'sidebar:openDetail', ticketId: ticket.id });
	}, [ticket.id]);

	const handleExecute = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		postMessage({ type: 'sidebar:execute', ticketId: ticket.id });
	}, [ticket.id]);

	const handleCancel = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		postMessage({ type: 'sidebar:cancel', ticketId: ticket.id });
	}, [ticket.id]);

	const handleDelete = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		postMessage({ type: 'sidebar:delete', ticketId: ticket.id });
	}, [ticket.id]);

	const handleMerge = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		postMessage({ type: 'sidebar:merge', ticketId: ticket.id });
	}, [ticket.id]);

	const handleReview = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		postMessage({ type: 'sidebar:openDetail', ticketId: ticket.id, tab: 'plan' });
	}, [ticket.id]);

	return (
		<div className="ticket-row" onClick={handleOpen} title={ticket.title}>
			<div className="ticket-row-main">
				<span className="ticket-title">{ticket.title}</span>
				<div className="ticket-actions">
					{showActions === 'attention' && ticket.status === 'plan_review' && (
						<>
							<button className="icon-btn" onClick={handleReview} title="Review plan">👁</button>
							<button className="icon-btn" onClick={handleExecute} title="Execute">▶</button>
						</>
					)}
					{showActions === 'attention' && ticket.status === 'failed' && (
						<>
							<button className="icon-btn" onClick={handleExecute} title="Retry">↻</button>
							<button className="icon-btn btn-danger" onClick={handleDelete} title="Delete">✕</button>
						</>
					)}
					{showActions === 'column' && ticket.status === 'backlog' && (
						<button className="icon-btn" onClick={handleExecute} title="Execute">▶</button>
					)}
					{showActions === 'column' && ticket.status === 'plan_review' && (
						<button className="icon-btn" onClick={handleExecute} title="Execute">▶</button>
					)}
					{showActions === 'column' && isRunning && (
						<button className="icon-btn" onClick={handleCancel} title="Cancel">✕</button>
					)}
					{showActions === 'column' && ticket.status === 'completed' && ticket.branch && (
						<button className="icon-btn" onClick={handleMerge} title="Merge">⇗</button>
					)}
					{showActions === 'column' && ticket.status === 'failed' && (
						<button className="icon-btn" onClick={handleExecute} title="Retry">↻</button>
					)}
				</div>
			</div>
			{isRunning && elapsed && (
				<div className="ticket-progress">
					<span className="elapsed">{elapsed}</span>
					{pct !== undefined && (
						<>
							<span className="progress-bar">{progressBar(pct)}</span>
							<span className="pct">{pct}%</span>
						</>
					)}
				</div>
			)}
		</div>
	);
}

interface ColumnSectionProps {
	status: TicketStatus;
	tickets: Ticket[];
	collapsed: boolean;
	onToggle: () => void;
	progressMap: Map<string, number>;
	now: number;
}

function ColumnSection({ status, tickets, collapsed, onToggle, progressMap, now }: ColumnSectionProps) {
	const label = COLUMN_LABELS[status];
	const count = tickets.length;

	return (
		<div className="column-section">
			<button
				className={`column-header ${collapsed ? 'collapsed' : ''}`}
				onClick={onToggle}
			>
				<span className="chevron">{collapsed ? '▶' : '▼'}</span>
				<span className="column-label">{label}</span>
				<span className="column-count">({count})</span>
			</button>
			{!collapsed && tickets.length > 0 && (
				<div className="column-tickets">
					{tickets.map(ticket => (
						<TicketRow
							key={ticket.id}
							ticket={ticket}
							pct={progressMap.get(ticket.id)}
							now={now}
							showActions="column"
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ── Main Sidebar Component ────────────────────────────────────────────────────

export function Sidebar() {
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [_projects, setProjects] = useState<Project[]>([]);
	const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
	const [collapsed, setCollapsed] = useState<Record<TicketStatus, boolean>>(() => defaultCollapsed([]));
	const [now, setNow] = useState<number>(Date.now());

	// Live timer
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	// Listen for messages from the extension host
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const msg = event.data;
			if (!msg || !msg.type) { return; }

			if (msg.type === 'sidebar:state') {
				const newTickets: Ticket[] = msg.tickets ?? [];
				setTickets(newTickets);
				setProjects(msg.projects ?? []);
				// Update collapse state for newly empty/non-empty columns
				setCollapsed(prev => {
					const next = { ...prev };
					for (const col of COLUMN_ORDER) {
						const count = newTickets.filter(t => t.status === col).length;
						// Only auto-update if the column just became empty (collapse) or had 0→1 (expand active columns)
						if (count === 0 && col !== 'completed' && col !== 'testing') {
							next[col] = true;
						} else if (count > 0 && col === 'failed' && next[col] === true) {
							// Auto-expand failed when tickets arrive
							next[col] = false;
						}
					}
					return next;
				});
			} else if (msg.type === 'sidebar:progress') {
				setProgressMap(prev => {
					const next = new Map(prev);
					next.set(msg.ticketId, msg.pct);
					return next;
				});
			}
		};

		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, []);

	const toggleCollapsed = useCallback((status: TicketStatus) => {
		setCollapsed(prev => ({ ...prev, [status]: !prev[status] }));
	}, []);

	// Stats
	const activeCount = tickets.filter(t => ACTIVE_STATUSES.includes(t.status)).length;
	const attentionCount = tickets.filter(t => NEEDS_ATTENTION_STATUSES.includes(t.status)).length;
	const completedCount = tickets.filter(t => t.status === 'completed').length;

	const attentionTickets = tickets.filter(t => NEEDS_ATTENTION_STATUSES.includes(t.status));

	return (
		<div className="sidebar">
			{/* Stats Row */}
			<div className="stats-row">
				<span className="stat" title="Active jobs">🔄 {activeCount}</span>
				<span className="stat" title="Needs attention">⏳ {attentionCount}</span>
				<span className="stat" title="Completed">✅ {completedCount}</span>
			</div>

			{/* Action Buttons */}
			<div className="action-row">
				<button
					className="action-btn"
					onClick={() => postMessage({ type: 'sidebar:newTicket' })}
				>
					+ New Ticket
				</button>
				<button
					className="action-btn"
					onClick={() => postMessage({ type: 'sidebar:openBoard' })}
				>
					Open Board
				</button>
			</div>

			<div className="divider" />

			{/* Needs Attention */}
			{attentionTickets.length > 0 && (
				<>
					<div className="attention-section">
						<div className="attention-header">⚠ NEEDS ATTENTION</div>
						{attentionTickets.map(ticket => (
							<TicketRow
								key={ticket.id}
								ticket={ticket}
								now={now}
								showActions="attention"
							/>
						))}
					</div>
					<div className="divider" />
				</>
			)}

			{/* Column Sections */}
			<div className="columns">
				{COLUMN_ORDER.map(status => {
					const columnTickets = tickets.filter(t => t.status === status);
					return (
						<ColumnSection
							key={status}
							status={status}
							tickets={columnTickets}
							collapsed={collapsed[status] ?? false}
							onToggle={() => toggleCollapsed(status)}
							progressMap={progressMap}
							now={now}
						/>
					);
				})}
			</div>
		</div>
	);
}
