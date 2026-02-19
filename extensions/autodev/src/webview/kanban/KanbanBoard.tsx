/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { postMessage } from '../shared/useVSCodeApi';
import { Column } from './Column';
import { NewTicketModal, type ModalFormData } from './NewTicketModal';
import type { Ticket, TicketStatus } from '../../extension/types/ticket';
import type { Project } from '../../extension/types/project';
import type { ExtensionMessage, WebviewMessage } from '../../extension/types/messages';

interface BoardState {
	tickets: Ticket[];
	projects: Project[];
	selectedProjectId: string | null;
}

/** Maps ticketId → latest progress percentage (0–100). */
type ProgressMap = Map<string, number>;

const COLUMNS: Array<{ status: TicketStatus; label: string; icon: string }> = [
	{ status: 'backlog', label: 'Backlog', icon: '📝' },
	{ status: 'planning', label: 'Planning', icon: '⏳' },
	{ status: 'plan_review', label: 'Plan Review', icon: '👁️' },
	{ status: 'queued', label: 'Queued', icon: '🕐' },
	{ status: 'in_progress', label: 'In Progress', icon: '🔄' },
	{ status: 'testing', label: 'Testing', icon: '🧪' },
	{ status: 'completed', label: 'Completed', icon: '✅' },
	{ status: 'failed', label: 'Failed', icon: '❌' },
];

/** Statuses that act as "execute" trigger when a card is dropped onto them */
const EXECUTE_ON_DROP: TicketStatus[] = ['in_progress', 'queued'];
/** Statuses that act as "cancel" trigger when a card is dropped onto them */
const CANCEL_ON_DROP: TicketStatus[] = ['backlog'];

/** Statuses that a ticket can legitimately be dragged out of */
const DRAGGABLE_FROM: TicketStatus[] = ['backlog', 'plan_review', 'planning', 'queued', 'in_progress', 'testing', 'failed'];

export function KanbanBoard(): React.ReactElement {
	const [state, setState] = useState<BoardState>({
		tickets: [],
		projects: [],
		selectedProjectId: null,
	});
	const [progressMap, setProgressMap] = useState<ProgressMap>(new Map());
	const [showModal, setShowModal] = useState(false);
	const [dragTicketId, setDragTicketId] = useState<string | null>(null);
	const [dragOverColumn, setDragOverColumn] = useState<TicketStatus | null>(null);

	// Listen for messages from the extension host
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const msg = event.data as ExtensionMessage;
			switch (msg.type) {
				case 'state:update':
					setState(prev => ({
						tickets: msg.tickets,
						projects: msg.projects,
						selectedProjectId: prev.selectedProjectId
							?? (msg.projects[0]?.id ?? null),
					}));
					break;
				case 'ticket:statusChanged':
					setState(prev => ({
						...prev,
						tickets: prev.tickets.map(t =>
							t.id === msg.ticketId ? { ...t, status: msg.status } : t
						),
					}));
					// Clear progress when the ticket reaches a terminal state.
					if (msg.status === 'completed' || msg.status === 'failed' || msg.status === 'merged') {
						setProgressMap(prev => {
							const next = new Map(prev);
							next.delete(msg.ticketId);
							return next;
						});
					}
					break;
				case 'job:progress':
					setProgressMap(prev => {
						const next = new Map(prev);
						next.set(msg.ticketId, msg.pct);
						return next;
					});
					break;
				default:
					break;
			}
		};

		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, []);

	const send = useCallback((msg: WebviewMessage) => {
		postMessage(msg);
	}, []);

	// ── Modal handlers ─────────────────────────────────────────────────────────

	const handleModalSaveBacklog = useCallback((data: ModalFormData) => {
		send({ type: 'ticket:create', data: { ...data } });
		setShowModal(false);
	}, [send]);

	const handleModalSavePlan = useCallback((data: ModalFormData) => {
		send({ type: 'ticket:create', data: { ...data, afterAction: 'plan' } });
		setShowModal(false);
	}, [send]);

	const handleModalSaveExecute = useCallback((data: ModalFormData) => {
		send({ type: 'ticket:create', data: { ...data, afterAction: 'execute' } });
		setShowModal(false);
	}, [send]);

	const handleProjectChange = useCallback((projectId: string) => {
		setState(prev => ({ ...prev, selectedProjectId: projectId || null }));
		if (projectId) {
			send({ type: 'project:select', projectId });
		}
	}, [send]);

	// ── DnD handlers ───────────────────────────────────────────────────────────

	const handleDragStart = useCallback((ticketId: string) => {
		setDragTicketId(ticketId);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, []);

	const handleDrop = useCallback((targetStatus: TicketStatus) => {
		if (!dragTicketId) { return; }
		const ticket = state.tickets.find(t => t.id === dragTicketId);
		if (!ticket) { return; }

		// Don't allow dropping on the same column
		if (ticket.status === targetStatus) {
			setDragTicketId(null);
			setDragOverColumn(null);
			return;
		}

		// Don't allow dragging completed/merged tickets to most columns
		if ((ticket.status === 'completed' || ticket.status === 'merged') && !CANCEL_ON_DROP.includes(targetStatus)) {
			setDragTicketId(null);
			setDragOverColumn(null);
			return;
		}

		if (EXECUTE_ON_DROP.includes(targetStatus)) {
			send({ type: 'ticket:execute', ticketId: dragTicketId });
		} else if (CANCEL_ON_DROP.includes(targetStatus)) {
			send({ type: 'ticket:cancel', ticketId: dragTicketId });
		} else {
			send({ type: 'ticket:move', ticketId: dragTicketId, status: targetStatus });
		}

		setDragTicketId(null);
		setDragOverColumn(null);
	}, [dragTicketId, state.tickets, send]);

	const handleDragEnd = useCallback(() => {
		setDragTicketId(null);
		setDragOverColumn(null);
	}, []);

	const handleOpenDetail = useCallback((ticketId: string) => {
		send({ type: 'ticket:openDetail', ticketId });
	}, [send]);

	// ── Derived state ──────────────────────────────────────────────────────────

	const filteredTickets = state.selectedProjectId
		? state.tickets.filter(t => t.projectId === state.selectedProjectId)
		: state.tickets;

	const runningCount = state.tickets.filter(
		t => t.status === 'in_progress' || t.status === 'planning' || t.status === 'testing'
	).length;
	const completedCount = state.tickets.filter(t => t.status === 'completed').length;
	const queuedCount = state.tickets.filter(t => t.status === 'queued').length;

	return (
		<div
			className="kanban-board"
			onDragEnd={handleDragEnd}
		>
			<div className="kanban-header">
				<div className="kanban-title">
					<span className="kanban-logo">🤖</span>
					<span>AutoDev Studio</span>
					<span className="kanban-stats">
						{runningCount > 0 && <span className="stat stat--running">🔄 {runningCount}</span>}
						{queuedCount > 0 && <span className="stat stat--queued">⏳ {queuedCount}</span>}
						{completedCount > 0 && <span className="stat stat--done">✅ {completedCount}</span>}
					</span>
				</div>
				<div className="kanban-controls">
					<select
						className="project-selector"
						value={state.selectedProjectId ?? ''}
						onChange={e => handleProjectChange(e.target.value)}
					>
						<option value="">All Projects</option>
						{state.projects.map(p => (
							<option key={p.id} value={p.id}>{p.name}</option>
						))}
					</select>
					<button
						className="new-ticket-btn"
						onClick={() => setShowModal(true)}
						disabled={state.projects.length === 0}
						title={state.projects.length === 0 ? 'Add a project first' : 'Create a new ticket'}
					>
						+ New Ticket
					</button>
				</div>
			</div>

			{state.projects.length === 0 && (
				<div className="empty-state">
					<div className="empty-state__icon">🤖</div>
					<h2>Welcome to AutoDev Studio</h2>
					<p>Add a project to get started running autonomous coding jobs.</p>
					<p className="empty-state__hint">Use <kbd>Ctrl+Shift+P</kbd> → <strong>AutoDev: Add Project</strong></p>
				</div>
			)}

			{state.projects.length > 0 && (
				<div className="kanban-columns">
					{COLUMNS.map(col => (
						<Column
							key={col.status}
							status={col.status}
							label={col.label}
							icon={col.icon}
							tickets={filteredTickets.filter(t => t.status === col.status)}
							isDragTarget={dragOverColumn === col.status && dragTicketId !== null}
							progressMap={progressMap}
							onExecute={ticketId => send({ type: 'ticket:execute', ticketId })}
							onCancel={ticketId => send({ type: 'ticket:cancel', ticketId })}
							onDelete={ticketId => send({ type: 'ticket:delete', ticketId })}
							onOpenDetail={handleOpenDetail}
							onDragStart={handleDragStart}
							onDragOver={e => { handleDragOver(e); setDragOverColumn(col.status); }}
							onDrop={handleDrop}
							onDragLeave={() => setDragOverColumn(null)}
						/>
					))}
				</div>
			)}

			{showModal && (
				<NewTicketModal
					projects={state.projects}
					initialProjectId={state.selectedProjectId ?? undefined}
					onClose={() => setShowModal(false)}
					onSaveBacklog={handleModalSaveBacklog}
					onSavePlan={handleModalSavePlan}
					onSaveExecute={handleModalSaveExecute}
				/>
			)}
		</div>
	);
}
