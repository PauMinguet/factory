/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { postMessage } from '../shared/useVSCodeApi';
import { LiveLog } from './LiveLog';
import { ActivityFeed } from './ActivityFeed';
import { ChangesSummary } from './ChangesSummary';
import type { Ticket, TicketStatus, PlanType } from '../../extension/types/ticket';
import type { Project } from '../../extension/types/project';
import type { ExecutionJob } from '../../extension/types/job';
import type { ExtensionMessage, WebviewMessage } from '../../extension/types/messages';

type Tab = 'description' | 'plan' | 'activity' | 'log' | 'changes' | 'actions';

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
	simple_plan: 'Simple Plan',
	analysis: 'Analysis',
	bug_fix: 'Bug Fix',
	test: 'Tests',
	direct: 'Direct',
	refactor: 'Refactor',
};

function formatDate(d?: Date | string): string {
	if (!d) { return '—'; }
	return new Date(d).toLocaleString();
}

function formatElapsed(startedAt?: Date | string): string {
	if (!startedAt) { return ''; }
	const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
	if (elapsed < 60) { return `${elapsed}s`; }
	const mins = Math.floor(elapsed / 60);
	const secs = elapsed % 60;
	return `${mins}m ${secs}s`;
}

const STARTABLE_STATUSES: TicketStatus[] = ['backlog', 'plan_review'];
const CANCELLABLE_STATUSES: TicketStatus[] = ['planning', 'in_progress', 'testing', 'queued'];

interface DetailState {
	ticket: Ticket | null;
	jobs: ExecutionJob[];
	project: Project | undefined;
}

/** Simple markdown renderer — renders basic markdown as safe HTML using pre-wrap for now. */
function MarkdownView({ content }: { content: string }): React.ReactElement {
	// Render as a pre block for simplicity; a full md renderer would replace this
	return <pre className="markdown-view">{content}</pre>;
}

export function TicketDetail(): React.ReactElement {
	const [state, setState] = useState<DetailState>({ ticket: null, jobs: [], project: undefined });
	const [activeTab, setActiveTab] = useState<Tab>('description');
	const [editingPlan, setEditingPlan] = useState(false);
	const [planDraft, setPlanDraft] = useState('');
	const [logLines, setLogLines] = useState<Array<{ line: string; timestamp: string }>>([]);

	const send = useCallback((msg: WebviewMessage) => postMessage(msg), []);

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const msg = event.data as ExtensionMessage;
			switch (msg.type) {
				case 'detail:init':
					setState({ ticket: msg.ticket, jobs: msg.jobs, project: msg.project });
					setLogLines(msg.logHistory ?? []);
					if (msg.initialTab) {
						setActiveTab(msg.initialTab as Tab);
					}
					break;
				case 'detail:ticketUpdated':
					setState(prev => ({ ...prev, ticket: msg.ticket }));
					break;
				case 'detail:log:line':
					setLogLines(prev => [...prev, { line: msg.line, timestamp: msg.timestamp }]);
					break;
				case 'detail:switchTab':
					setActiveTab(msg.tab as Tab);
					break;
				default:
					break;
			}
		};
		window.addEventListener('message', handler);
		// Signal to the extension that the webview is ready to receive messages.
		// This avoids a race where sendInit fires before React has mounted.
		postMessage({ type: 'detail:ready' } as WebviewMessage);
		return () => window.removeEventListener('message', handler);
	}, []);

	// Tick every second so the elapsed time display stays current while the ticket is running.
	// Must be declared before the early return to satisfy the rules of hooks.
	const ticketIsRunning = state.ticket ? CANCELLABLE_STATUSES.includes(state.ticket.status) : false;
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!ticketIsRunning) { return; }
		const id = setInterval(() => setTick(t => t + 1), 1000);
		return () => clearInterval(id);
	}, [ticketIsRunning]);

	const ticket = state.ticket;
	if (!ticket) {
		return <div className="td-loading">Loading ticket...</div>;
	}

	const isRunning = CANCELLABLE_STATUSES.includes(ticket.status);
	const canExecute = STARTABLE_STATUSES.includes(ticket.status);
	const canCancel = isRunning;

	const handleExecute = () => send({ type: 'detail:execute', ticketId: ticket.id });
	const handleCancel = () => send({ type: 'detail:cancel', ticketId: ticket.id });
	const handleDelete = () => send({ type: 'detail:delete', ticketId: ticket.id });
	const handleMerge = () => send({ type: 'detail:merge', ticketId: ticket.id });
	const handleCheckout = () => send({ type: 'detail:checkoutBranch', ticketId: ticket.id });
	const handleOpenDiff = () => send({ type: 'detail:openDiff', ticketId: ticket.id });
	const handleRegenerate = () => send({ type: 'detail:regeneratePlan', ticketId: ticket.id });

	const handleSavePlan = () => {
		send({ type: 'detail:updatePlan', ticketId: ticket.id, plan: planDraft });
		setEditingPlan(false);
	};

	const handleStartEditPlan = () => {
		setPlanDraft(ticket.plan ?? '');
		setEditingPlan(true);
	};

	const tabs: Array<{ id: Tab; label: string }> = [
		{ id: 'description', label: 'Description' },
		{ id: 'plan', label: 'Plan' },
		{ id: 'activity', label: 'Activity' },
		{ id: 'log', label: 'Live Log' },
		{ id: 'changes', label: 'Changes' },
		{ id: 'actions', label: 'Actions' },
	];

	return (
		<div className="td-root">
			{/* Header */}
			<div className="td-header">
				<div className="td-header__top">
					<span className="td-status-icon" title={ticket.status}>
						{STATUS_ICONS[ticket.status]}
					</span>
					<h1 className="td-title">{ticket.title}</h1>
				</div>
				<div className="td-header__meta">
					<span className="td-meta-item">
						<span className="td-meta-label">Project:</span>
						<span>{state.project?.name ?? ticket.projectId}</span>
					</span>
					<span className="td-meta-item">
						<span className="td-meta-label">Type:</span>
						<span className="td-plan-badge">{PLAN_TYPE_LABELS[ticket.planType]}</span>
					</span>
					<span className={`td-status-badge td-status-badge--${ticket.status}`}>
						{ticket.status.replace('_', ' ')}
					</span>
					{ticket.branch && (
						<span className="td-meta-item td-branch" title={ticket.branch}>
							🌿 {ticket.branch}
						</span>
					)}
				</div>
				<div className="td-header__times">
					<span className="td-meta-item">
						<span className="td-meta-label">Created:</span>
						<span>{formatDate(ticket.createdAt)}</span>
					</span>
					{ticket.startedAt && (
						<span className="td-meta-item">
							<span className="td-meta-label">Started:</span>
							<span>{formatDate(ticket.startedAt)}</span>
						</span>
					)}
					{ticket.completedAt && (
						<span className="td-meta-item">
							<span className="td-meta-label">Completed:</span>
							<span>{formatDate(ticket.completedAt)}</span>
						</span>
					)}
					{isRunning && ticket.startedAt && (
						<span className="td-meta-item td-elapsed">
							⏱ {formatElapsed(ticket.startedAt)} elapsed
						</span>
					)}
				</div>
				{ticket.error && (
					<div className="td-error-banner">
						<span>❌ {ticket.error}</span>
					</div>
				)}
				{/* Quick action bar */}
				<div className="td-quick-actions">
					{canExecute && (
						<button className="td-btn td-btn--primary" onClick={handleExecute}>
							▶ {ticket.status === 'plan_review' ? 'Execute Plan' : 'Start'}
						</button>
					)}
					{canCancel && (
						<button className="td-btn td-btn--danger" onClick={handleCancel}>
							✕ Cancel
						</button>
					)}
					{ticket.branch && ticket.status === 'completed' && (
						<button className="td-btn" onClick={handleCheckout}>
							⎇ Checkout Branch
						</button>
					)}
				</div>
			</div>

			{/* Tab bar */}
			<div className="td-tabs" role="tablist">
				{tabs.map(t => (
					<button
						key={t.id}
						role="tab"
						aria-selected={activeTab === t.id}
						className={`td-tab ${activeTab === t.id ? 'td-tab--active' : ''}`}
						onClick={() => setActiveTab(t.id)}
					>
						{t.label}
						{t.id === 'log' && logLines.length > 0 && (
							<span className="td-tab-badge">{logLines.length}</span>
						)}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="td-content">
				{activeTab === 'description' && (
					<div className="td-tab-pane">
						<MarkdownView content={ticket.description} />
						{ticket.attachments.length > 0 && (
							<div className="td-attachments">
								<h3>Attachments</h3>
								<ul>
									{ticket.attachments.map(a => (
										<li key={a.id} className="td-attachment-item">
											📎 {a.filename}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

				{activeTab === 'plan' && (
					<div className="td-tab-pane td-plan-tab">
						<div className="td-plan-toolbar">
							{!editingPlan ? (
								<>
									<button className="td-btn" onClick={handleStartEditPlan}>
										✏️ Edit Plan
									</button>
									{canExecute && ticket.plan && (
										<button className="td-btn td-btn--primary" onClick={handleExecute}>
											▶ Execute Plan
										</button>
									)}
									<button className="td-btn" onClick={handleRegenerate}>
										🔄 Regenerate
									</button>
								</>
							) : (
								<>
									<button className="td-btn td-btn--primary" onClick={handleSavePlan}>
										💾 Save Plan
									</button>
									<button className="td-btn" onClick={() => setEditingPlan(false)}>
										✕ Cancel
									</button>
								</>
							)}
						</div>
						{editingPlan ? (
							<textarea
								className="td-plan-editor"
								value={planDraft}
								onChange={e => setPlanDraft(e.target.value)}
								placeholder="Edit the plan markdown here..."
							/>
						) : ticket.plan ? (
							<MarkdownView content={ticket.plan} />
						) : (
							<div className="td-empty-plan">
								<p>No plan generated yet.</p>
								<button className="td-btn td-btn--primary" onClick={handleExecute}>
									▶ Generate Plan
								</button>
							</div>
						)}
					</div>
				)}

				{activeTab === 'activity' && (
					<ActivityFeed lines={logLines} />
				)}

				{activeTab === 'log' && (
					<LiveLog lines={logLines} />
				)}

				{activeTab === 'changes' && (
					<ChangesSummary
						ticket={ticket}
						onOpenDiff={handleOpenDiff}
						onCheckout={handleCheckout}
					/>
				)}

				{activeTab === 'actions' && (
					<div className="td-tab-pane td-actions-tab">
						<div className="td-action-group">
							<h3>Branch Operations</h3>
							{ticket.branch ? (
								<>
									<button className="td-btn td-action-btn" onClick={handleCheckout}>
										⎇ Checkout Branch
									</button>
									<button className="td-btn td-action-btn" onClick={handleOpenDiff}>
										🔍 View Diff
									</button>
									{ticket.status === 'completed' && (
										<>
											<button className="td-btn td-action-btn" onClick={handleMerge}>
												🔀 Merge to Main
											</button>
											<button
												className="td-btn td-action-btn"
												onClick={() => send({ type: 'ticket:merge', ticketId: ticket.id })}
											>
												🐙 Create PR
											</button>
										</>
									)}
								</>
							) : (
								<p className="td-no-branch">No branch available yet.</p>
							)}
						</div>

						<div className="td-action-group">
							<h3>Job Controls</h3>
							{canExecute && (
								<button className="td-btn td-action-btn td-btn--primary" onClick={handleExecute}>
									▶ {ticket.status === 'plan_review' ? 'Execute Plan' : 'Re-execute'}
								</button>
							)}
							{ticket.status === 'failed' && (
								<button className="td-btn td-action-btn td-btn--primary" onClick={handleExecute}>
									🔁 Re-execute
								</button>
							)}
							{canCancel && (
								<button className="td-btn td-action-btn td-btn--danger" onClick={handleCancel}>
									✕ Cancel Job
								</button>
							)}
						</div>

						<div className="td-action-group td-action-group--danger">
							<h3>Danger Zone</h3>
							<button className="td-btn td-action-btn td-btn--danger" onClick={handleDelete}>
								🗑 Delete Ticket
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
