/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { AutoDevDatabase } from '../services/database';
import type { Orchestrator } from '../services/orchestrator';
import type { TicketDetailProvider } from './ticketDetailProvider';
import type { WebviewMessage } from '../types/messages';
import type { PlanType } from '../types/ticket';

/**
 * Manages the Kanban board webview panel.
 * Opens as an editor tab, retains state when hidden, and syncs state
 * bidirectionally with the extension host via postMessage.
 */
export class KanbanViewProvider {
	private panel: vscode.WebviewPanel | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly db: AutoDevDatabase,
		private readonly orchestrator: Orchestrator,
		private readonly output: vscode.OutputChannel,
		private readonly ticketDetailProvider: TicketDetailProvider,
	) {}

	/**
	 * Opens the new-ticket wizard and creates a ticket via VS Code quick-input.
	 * Can be called directly from command handlers.
	 */
	async createTicket(preselectedProjectId = ''): Promise<void> {
		return this.handleCreateTicket(preselectedProjectId, 'backlog');
	}

	/**
	 * Opens the Kanban board panel, or focuses it if already open.
	 */
	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'autodev.kanban',
			'AutoDev Board',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
				],
			},
		);

		this.panel.webview.html = this.buildHtml(this.panel.webview);

		// Send full initial state once the panel is ready
		this.sendState();

		// Forward orchestrator events to the webview
		const onTicketStatus = (ticketId: string, status: string) => {
			this.panel?.webview.postMessage({ type: 'ticket:statusChanged', ticketId, status });
			this.sendState();
		};
		const onJobProgress = (ticketId: string, phase: string, pct: number) => {
			this.panel?.webview.postMessage({ type: 'job:progress', ticketId, phase, pct });
		};

		this.orchestrator.on('ticket:status', onTicketStatus);
		this.orchestrator.on('job:progress', onJobProgress);

		// Handle messages incoming from the webview
		this.panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => void this.handleMessage(msg),
			undefined,
			this.context.subscriptions,
		);

		// Tear down event listeners when the panel is closed
		this.panel.onDidDispose(() => {
			this.orchestrator.off('ticket:status', onTicketStatus);
			this.orchestrator.off('job:progress', onJobProgress);
			this.panel = undefined;
		}, undefined, this.context.subscriptions);
	}

	/** Sends the full board state (all tickets + projects) to the webview. */
	sendState(): void {
		if (!this.panel) {
			return;
		}
		const tickets = this.db.tickets.findAll();
		const projects = this.db.projects.findAll();
		this.panel.webview.postMessage({ type: 'state:update', tickets, projects });
	}

	// ── Message handlers ──────────────────────────────────────────────────────

	private async handleMessage(msg: WebviewMessage): Promise<void> {
		switch (msg.type) {
			case 'ticket:create':
				await this.handleCreateFromModal(msg.data);
				break;
			case 'ticket:execute':
				await this.handleExecuteTicket(msg.ticketId);
				break;
			case 'ticket:cancel':
				await this.handleCancelTicket(msg.ticketId);
				break;
			case 'ticket:delete':
				await this.handleDeleteTicket(msg.ticketId);
				break;
			case 'ticket:move':
				await this.handleMoveTicket(msg.ticketId, msg.status);
				break;
			case 'ticket:openDetail':
				this.ticketDetailProvider.open(msg.ticketId, msg.tab);
				break;
			case 'ticket:merge':
				await this.handleMergeTicket(msg.ticketId);
				break;
			case 'project:select':
				// No server-side action needed — the webview manages the filter locally
				break;
			default:
				break;
		}
	}

	/**
	 * Handles ticket creation from the webview NewTicketModal.
	 * The modal sends a CreateTicketInput with an optional afterAction field.
	 */
	private async handleCreateFromModal(data: { projectId: string; title: string; description: string; planType: PlanType; afterAction?: string }): Promise<void> {
		if (!data.title.trim() || !data.description.trim() || !data.projectId) {
			return;
		}

		const ticket = this.db.tickets.create({
			projectId: data.projectId,
			title: data.title.trim(),
			description: data.description.trim(),
			planType: data.planType,
		});

		this.output.appendLine(`[AutoDev] Created ticket: ${ticket.title} (${ticket.id})`);
		this.sendState();

		if (data.afterAction === 'plan' || data.afterAction === 'execute') {
			await this.handleExecuteTicket(ticket.id);
		}
	}

	/**
	 * Opens a VS Code quick-input wizard to collect ticket details, then creates
	 * the ticket in the database and notifies the webview.
	 */
	private async handleCreateTicket(preselectedProjectId: string, afterAction: 'backlog' | 'plan' | 'execute'): Promise<void> {
		const projects = this.db.projects.findAll();
		if (projects.length === 0) {
			vscode.window.showWarningMessage('AutoDev: Add a project first before creating tickets.');
			return;
		}

		// Step 1 — Project
		let projectId = preselectedProjectId;
		if (!projectId || !projects.find(p => p.id === projectId)) {
			const projectPick = await vscode.window.showQuickPick(
				projects.map(p => ({ label: p.name, detail: p.repoPath, id: p.id })),
				{ title: 'AutoDev — New Ticket (1/4)', placeHolder: 'Select a project' },
			);
			if (!projectPick) {
				return;
			}
			projectId = projectPick.id;
		}

		// Step 2 — Title
		const title = await vscode.window.showInputBox({
			title: 'AutoDev — New Ticket (2/4)',
			prompt: 'Ticket title (short description of the task)',
			placeHolder: 'e.g. Add dark mode toggle to settings page',
			validateInput: v => v.trim() ? undefined : 'Title is required',
		});
		if (!title) {
			return;
		}

		// Step 3 — Description
		const description = await vscode.window.showInputBox({
			title: 'AutoDev — New Ticket (3/4)',
			prompt: 'Full description (requirements, context, acceptance criteria)',
			placeHolder: 'Describe what needs to be done...',
			validateInput: v => v.trim() ? undefined : 'Description is required',
		});
		if (!description) {
			return;
		}

		// Step 4 — Plan type
		const PLAN_TYPES: Array<{ label: string; description: string; value: PlanType }> = [
			{ label: '📋 Simple Plan', description: 'Lightweight 5–10 step plan', value: 'simple_plan' },
			{ label: '📄 PRD', description: 'Full Product Requirements Document', value: 'prd' },
			{ label: '🐛 Bug Fix', description: 'Investigate, fix and add regression test', value: 'bug_fix' },
			{ label: '🧪 Tests', description: 'Write tests for an existing module', value: 'test' },
			{ label: '🔍 Analysis', description: 'Codebase analysis, no code changes', value: 'analysis' },
			{ label: '♻️ Refactor', description: 'Code improvement and cleanup', value: 'refactor' },
			{ label: '⚡ Direct Execute', description: 'Skip planning, execute immediately', value: 'direct' },
		];

		const planPick = await vscode.window.showQuickPick(PLAN_TYPES, {
			title: 'AutoDev — New Ticket (4/4)',
			placeHolder: 'Select the execution template',
		});
		if (!planPick) {
			return;
		}

		const ticket = this.db.tickets.create({
			projectId,
			title: title.trim(),
			description: description.trim(),
			planType: planPick.value,
		});

		this.output.appendLine(`[AutoDev] Created ticket: ${ticket.title} (${ticket.id})`);
		this.sendState();

		if (afterAction === 'backlog') {
			// Offer to execute immediately
			const action = await vscode.window.showInformationMessage(
				`AutoDev: Created ticket "${ticket.title}". What would you like to do?`,
				'Execute Now',
				'Save to Backlog',
			);
			if (action === 'Execute Now') {
				await this.handleExecuteTicket(ticket.id);
			}
		} else {
			await this.handleExecuteTicket(ticket.id);
		}
	}

	private async handleExecuteTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) {
			return;
		}
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found for this ticket.');
			return;
		}

		try {
			if (ticket.status === 'plan_review') {
				// Plan already exists — queue execute phase
				await this.orchestrator.enqueueExecute(ticket, project);
			} else {
				// Start from the plan phase
				await this.orchestrator.enqueuePlan(ticket, project);
			}
			this.sendState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Failed to start ticket. ${msg}`);
			this.output.appendLine(`[ERROR] enqueue failed for ${ticketId}: ${msg}`);
		}
	}

	private async handleCancelTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) {
			return;
		}
		await this.orchestrator.cancel(ticketId);
		this.output.appendLine(`[AutoDev] Cancelled ticket: ${ticket.title}`);
		this.sendState();
	}

	private async handleDeleteTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) {
			return;
		}
		const confirm = await vscode.window.showWarningMessage(
			`Delete ticket "${ticket.title}"? This cannot be undone.`,
			{ modal: true },
			'Delete',
		);
		if (confirm !== 'Delete') {
			return;
		}
		this.db.tickets.delete(ticketId);
		this.output.appendLine(`[AutoDev] Deleted ticket: ${ticket.title} (${ticketId})`);
		this.sendState();
	}

	private async handleMoveTicket(ticketId: string, status: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		// Only allow moves to statuses that make sense without triggering execute/cancel
		// (execute/cancel are handled by specific messages from KanbanBoard)
		const allowedMoves: import('../types/ticket').TicketStatus[] = ['backlog', 'plan_review'];
		const typedStatus = status as import('../types/ticket').TicketStatus;
		if (allowedMoves.includes(typedStatus)) {
			this.db.tickets.updateStatus(ticketId, typedStatus);
			this.sendState();
		}
	}

	private async handleMergeTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket?.branch) { return; }
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) { return; }

		const confirm = await vscode.window.showWarningMessage(
			`Merge "${ticket.branch}" into "${project.defaultBranch}"?`,
			{ modal: true },
			'Merge',
		);
		if (confirm !== 'Merge') { return; }

		try {
			const { GitManager } = await import('../services/gitManager');
			const git = new GitManager(project.repoPath);
			await git.mergeBranch(ticket.branch, project.defaultBranch);
			if (ticket.worktreePath) {
				await git.removeWorktree(ticket.worktreePath);
			}
			this.db.tickets.updateStatus(ticketId, 'merged');
			vscode.window.showInformationMessage(`AutoDev: Merged "${ticket.branch}" successfully.`);
			this.sendState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Merge failed. ${msg}`);
		}
	}

	// ── HTML generation ───────────────────────────────────────────────────────

	private buildHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('hex');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'kanban.js'),
		);
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'kanban.css'),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
	<link rel="stylesheet" href="${cssUri}">
	<title>AutoDev Board</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
