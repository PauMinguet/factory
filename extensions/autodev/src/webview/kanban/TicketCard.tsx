/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import type { Ticket, TicketStatus, PlanType } from '../../extension/types/ticket';

const STATUS_ICONS: Record<TicketStatus, string> = {
	backlog: '📝',
	planning: '⏳',
	plan_review: '👁️',
	queued: '⏳',
	in_progress: '🔄',
	testing: '🧪',
	completed: '✅',
	failed: '❌',
	merged: '🔀',
};

const PLAN_TYPE_LABELS: Record<PlanType, string> = {
	prd: 'PRD',
	simple_plan: 'Plan',
	analysis: 'Analysis',
	bug_fix: 'Bug Fix',
	test: 'Tests',
	direct: 'Direct',
	refactor: 'Refactor',
};

interface TicketCardProps {
	ticket: Ticket;
	/** Progress percentage (0-100) for running tickets. Shown as a progress bar. */
	progress?: number;
	onExecute(ticketId: string): void;
	onCancel(ticketId: string): void;
	onDelete(ticketId: string): void;
	onOpenDetail(ticketId: string): void;
	onDragStart(ticketId: string): void;
}

function formatElapsed(startedAt?: Date | string): string {
	if (!startedAt) {
		return '';
	}
	const start = new Date(startedAt).getTime();
	const elapsed = Math.floor((Date.now() - start) / 1000);
	if (elapsed < 60) {
		return `${elapsed}s`;
	}
	const mins = Math.floor(elapsed / 60);
	const secs = elapsed % 60;
	return `${mins}m ${secs}s`;
}

const RUNNING_STATUSES: TicketStatus[] = ['planning', 'in_progress', 'testing', 'queued'];
const STARTABLE_STATUSES: TicketStatus[] = ['backlog', 'plan_review'];
const CANCELLABLE_STATUSES: TicketStatus[] = ['planning', 'in_progress', 'testing', 'queued'];

export function TicketCard({ ticket, progress, onExecute, onCancel, onDelete, onOpenDetail, onDragStart }: TicketCardProps): React.ReactElement {
	const isRunning = RUNNING_STATUSES.includes(ticket.status);
	const canExecute = STARTABLE_STATUSES.includes(ticket.status);
	const canCancel = CANCELLABLE_STATUSES.includes(ticket.status);

	// Tick every second so the elapsed time display stays current
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!isRunning) { return; }
		const id = setInterval(() => setTick(t => t + 1), 1000);
		return () => clearInterval(id);
	}, [isRunning]);

	const handleDragStart = (e: React.DragEvent) => {
		e.dataTransfer.effectAllowed = 'move';
		onDragStart(ticket.id);
	};

	const handleCardClick = (e: React.MouseEvent) => {
		// Don't open detail if a button was clicked
		if ((e.target as HTMLElement).closest('button')) { return; }
		onOpenDetail(ticket.id);
	};

	return (
		<div
			className={`ticket-card ticket-card--${ticket.status}`}
			data-ticket-id={ticket.id}
			draggable
			onDragStart={handleDragStart}
			onClick={handleCardClick}
			title="Click to open ticket details"
		>
			<div className="ticket-card__header">
				<span className="ticket-card__status-icon" title={ticket.status}>
					{STATUS_ICONS[ticket.status]}
				</span>
				<span className="ticket-card__plan-badge">{PLAN_TYPE_LABELS[ticket.planType]}</span>
			</div>

			<div className="ticket-card__title">{ticket.title}</div>

			{ticket.branch && ticket.status === 'completed' && (
				<div className="ticket-card__branch" title={ticket.branch}>
					🌿 {ticket.branch}
				</div>
			)}

			{ticket.error && ticket.status === 'failed' && (
				<div className="ticket-card__error" title={ticket.error}>
					{ticket.error.split('\n')[0]}
				</div>
			)}

			{isRunning && ticket.startedAt && (
				<div className="ticket-card__elapsed">⏱ {formatElapsed(ticket.startedAt)}</div>
			)}

			{isRunning && progress !== undefined && (
				<div className="ticket-card__progress" title={`${progress}% complete`}>
					<div
						className="ticket-card__progress-fill"
						style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
					/>
				</div>
			)}

			<div className="ticket-card__actions">
				{canExecute && (
					<button
						className="ticket-card__btn ticket-card__btn--execute"
						onClick={() => onExecute(ticket.id)}
						title="Execute this ticket"
					>
						▶ Execute
					</button>
				)}
				{canCancel && (
					<button
						className="ticket-card__btn ticket-card__btn--cancel"
						onClick={() => onCancel(ticket.id)}
						title="Cancel this job"
					>
						✕ Cancel
					</button>
				)}
				{!isRunning && (
					<button
						className="ticket-card__btn ticket-card__btn--delete"
						onClick={() => onDelete(ticket.id)}
						title="Delete ticket"
					>
						🗑
					</button>
				)}
			</div>
		</div>
	);
}
