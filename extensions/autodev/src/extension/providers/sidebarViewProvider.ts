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
import type { KanbanViewProvider } from './kanbanViewProvider';

/**
 * Manages the AutoDev sidebar panel.
 * Implements WebviewViewProvider so VS Code renders it in the activity bar sidebar.
 * Retains React state when hidden via retainContextWhenHidden option.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
	private webviewView: vscode.WebviewView | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly db: AutoDevDatabase,
		private readonly orchestrator: Orchestrator,
		private readonly output: vscode.OutputChannel,
		private readonly ticketDetailProvider: TicketDetailProvider,
		private readonly kanbanProvider: KanbanViewProvider,
	) {}

	/**
	 * Called by VS Code when the sidebar view becomes visible for the first time.
	 * Sets up HTML, message handlers, and orchestrator event listeners.
	 */
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
			],
		};

		webviewView.webview.html = this.buildHtml(webviewView.webview);

		// Send full state immediately
		this.sendState();

		// Forward orchestrator events to the sidebar webview
		const onTicketStatus = (_ticketId: string, _status: string) => {
			this.sendState();
		};
		const onJobProgress = (ticketId: string, _phase: string, pct: number) => {
			webviewView.webview.postMessage({ type: 'sidebar:progress', ticketId, pct });
		};

		this.orchestrator.on('ticket:status', onTicketStatus);
		this.orchestrator.on('job:progress', onJobProgress);

		// Handle messages from the sidebar webview
		webviewView.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => void this.handleMessage(msg),
			undefined,
			this.context.subscriptions,
		);

		// Also refresh state when view becomes visible again
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.sendState();
			}
		});

		// Clean up listeners when the view is disposed
		webviewView.onDidDispose(() => {
			this.orchestrator.off('ticket:status', onTicketStatus);
			this.orchestrator.off('job:progress', onJobProgress);
			this.webviewView = undefined;
		}, undefined, this.context.subscriptions);
	}

	/** Sends the full state (tickets + projects) to the sidebar webview. */
	sendState(): void {
		if (!this.webviewView) {
			return;
		}
		const tickets = this.db.tickets.findAll();
		const projects = this.db.projects.findAll();
		this.webviewView.webview.postMessage({ type: 'sidebar:state', tickets, projects });
	}

	/** Opens a ticket in the detail panel. */
	open(ticketId: string, tab?: string): void {
		this.ticketDetailProvider.open(ticketId, tab);
	}

	// ── Message handlers ──────────────────────────────────────────────────────

	private async handleMessage(msg: WebviewMessage): Promise<void> {
		switch (msg.type) {
			case 'sidebar:newTicket':
				await vscode.commands.executeCommand('autodev.newTicket');
				break;
			case 'sidebar:openBoard':
				this.kanbanProvider.open();
				break;
			case 'sidebar:openDetail':
				this.ticketDetailProvider.open(msg.ticketId, msg.tab);
				break;
			case 'sidebar:execute':
				await this.handleExecuteTicket(msg.ticketId);
				break;
			case 'sidebar:cancel':
				await this.handleCancelTicket(msg.ticketId);
				break;
			case 'sidebar:delete':
				await this.handleDeleteTicket(msg.ticketId);
				break;
			case 'sidebar:merge':
				await this.handleMergeTicket(msg.ticketId);
				break;
			default:
				break;
		}
	}

	private async handleExecuteTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found for this ticket.');
			return;
		}
		try {
			if (ticket.status === 'plan_review') {
				await this.orchestrator.enqueueExecute(ticket, project);
			} else {
				await this.orchestrator.enqueuePlan(ticket, project);
			}
			this.sendState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Failed to start ticket. ${msg}`);
			this.output.appendLine(`[ERROR] sidebar enqueue failed for ${ticketId}: ${msg}`);
		}
	}

	private async handleCancelTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		await this.orchestrator.cancel(ticketId);
		this.output.appendLine(`[AutoDev] Sidebar: Cancelled ticket: ${ticket.title}`);
		this.sendState();
	}

	private async handleDeleteTicket(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		const confirm = await vscode.window.showWarningMessage(
			`Delete ticket "${ticket.title}"? This cannot be undone.`,
			{ modal: true },
			'Delete',
		);
		if (confirm !== 'Delete') { return; }
		this.db.tickets.delete(ticketId);
		this.output.appendLine(`[AutoDev] Sidebar: Deleted ticket: ${ticket.title} (${ticketId})`);
		this.sendState();
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
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'sidebar.js'),
		);
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'sidebar.css'),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
	<link rel="stylesheet" href="${cssUri}">
	<title>AutoDev</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
