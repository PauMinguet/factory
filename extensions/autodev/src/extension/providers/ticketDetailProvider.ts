/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { AutoDevDatabase } from '../services/database';
import type { Orchestrator } from '../services/orchestrator';
import type { WebviewMessage } from '../types/messages';

/**
 * Manages per-ticket detail webview panels.
 * Each ticket opens its own panel (keyed by ticket ID), showing 5 tabs:
 * Description, Plan, Live Log, Changes, Actions.
 */
export class TicketDetailProvider {
	private readonly panels = new Map<string, vscode.WebviewPanel>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly db: AutoDevDatabase,
		private readonly orchestrator: Orchestrator,
		private readonly output: vscode.OutputChannel,
	) {
		// Forward live log lines to the open ticket panel
		this.orchestrator.on('log:line', (ticketId: string, line: string) => {
			const panel = this.panels.get(ticketId);
			if (panel) {
				panel.webview.postMessage({
					type: 'detail:log:line',
					line,
					timestamp: new Date().toISOString(),
				});
			}
		});

		// Forward ticket status changes so the detail view updates in real time
		this.orchestrator.on('ticket:status', (ticketId: string, _status: string) => {
			const panel = this.panels.get(ticketId);
			if (panel) {
				const ticket = this.db.tickets.findById(ticketId);
				if (ticket) {
					panel.webview.postMessage({ type: 'detail:ticketUpdated', ticket });
				}
			}
		});
	}

	/**
	 * Opens (or focuses) the detail panel for the given ticket.
	 * @param ticketId UUID of the ticket to display
	 * @param initialTab Optional tab to switch to: 'description'|'plan'|'log'|'changes'|'actions'
	 */
	open(ticketId: string, initialTab?: string): void {
		const existing = this.panels.get(ticketId);
		if (existing) {
			existing.reveal(vscode.ViewColumn.One);
			if (initialTab) {
				existing.webview.postMessage({ type: 'detail:switchTab', tab: initialTab });
			}
			return;
		}

		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) {
			this.output.appendLine(`[ERROR] TicketDetailProvider: ticket not found: ${ticketId}`);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			`autodev.ticketDetail.${ticketId}`,
			`📋 ${ticket.title}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
				],
			},
		);

		panel.webview.html = this.buildHtml(panel.webview);
		this.panels.set(ticketId, panel);

		// Send initial state after HTML is set
		this.sendInit(ticketId, panel, initialTab);

		panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => void this.handleMessage(msg, ticketId),
			undefined,
			this.context.subscriptions,
		);

		panel.onDidDispose(() => {
			this.panels.delete(ticketId);
		}, undefined, this.context.subscriptions);
	}

	// ── Message handlers ──────────────────────────────────────────────────────

	private async handleMessage(msg: WebviewMessage, ticketId: string): Promise<void> {
		switch (msg.type) {
			case 'detail:execute':
				await this.handleExecute(ticketId);
				break;
			case 'detail:cancel':
				await this.handleCancel(ticketId);
				break;
			case 'detail:delete':
				await this.handleDelete(ticketId);
				break;
			case 'detail:merge':
				await this.handleMerge(ticketId);
				break;
			case 'detail:checkoutBranch':
				await this.handleCheckoutBranch(ticketId);
				break;
			case 'detail:updatePlan':
				if (msg.type === 'detail:updatePlan') {
					this.handleUpdatePlan(msg.ticketId, msg.plan);
				}
				break;
			case 'detail:openDiff':
				await this.handleOpenDiff(ticketId);
				break;
			case 'detail:regeneratePlan':
				await this.handleRegeneratePlan(ticketId);
				break;
			case 'detail:requestAttachment':
				await this.handleRequestAttachment(ticketId);
				break;
			case 'detail:ready': {
				// Webview signals it has mounted and is ready to receive messages.
				// Re-send init so the data isn't lost to a startup race condition.
				const panel = this.panels.get(ticketId);
				if (panel) { this.sendInit(ticketId, panel); }
				break;
			}
			default:
				break;
		}
	}

	private async handleExecute(ticketId: string): Promise<void> {
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
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Failed to start ticket. ${msg}`);
		}
	}

	private async handleCancel(ticketId: string): Promise<void> {
		await this.orchestrator.cancel(ticketId);
	}

	private async handleDelete(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		const confirm = await vscode.window.showWarningMessage(
			`Delete ticket "${ticket.title}"? This cannot be undone.`,
			{ modal: true },
			'Delete',
		);
		if (confirm !== 'Delete') { return; }
		this.db.tickets.delete(ticketId);
		this.panels.get(ticketId)?.dispose();
		this.output.appendLine(`[AutoDev] Deleted ticket: ${ticket.title} (${ticketId})`);
	}

	private async handleMerge(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket?.branch) {
			vscode.window.showErrorMessage('AutoDev: No branch found for this ticket.');
			return;
		}
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found for this ticket.');
			return;
		}
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
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Merge failed. ${msg}`);
		}
	}

	private async handleCheckoutBranch(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket?.branch) {
			vscode.window.showErrorMessage('AutoDev: No branch available for checkout.');
			return;
		}
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) { return; }
		const terminal = vscode.window.createTerminal({
			name: `AutoDev — Checkout ${ticket.branch}`,
			cwd: project.repoPath,
		});
		terminal.show();
		terminal.sendText(`git checkout ${ticket.branch}`);
	}

	private handleUpdatePlan(ticketId: string, plan: string): void {
		this.db.tickets.updatePlan(ticketId, plan);
		const ticket = this.db.tickets.findById(ticketId);
		const panel = this.panels.get(ticketId);
		if (ticket && panel) {
			panel.webview.postMessage({ type: 'detail:ticketUpdated', ticket });
		}
	}

	private async handleOpenDiff(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket?.worktreePath || !ticket.branch) {
			vscode.window.showInformationMessage('AutoDev: No worktree available for diff.');
			return;
		}
		// Open a terminal with the git diff command so the user can review changes
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) { return; }
		const terminal = vscode.window.createTerminal({
			name: `AutoDev — Diff ${ticket.branch}`,
			cwd: ticket.worktreePath,
		});
		terminal.show();
		terminal.sendText(`git diff origin/${project.defaultBranch}...HEAD --stat`);
	}

	private async handleRegeneratePlan(ticketId: string): Promise<void> {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		const project = this.db.projects.findById(ticket.projectId);
		if (!project) { return; }
		// Reset ticket to backlog and re-enqueue the plan phase
		this.db.tickets.updateStatus(ticketId, 'backlog');
		await this.orchestrator.enqueuePlan(ticket, project);
	}

	private async handleRequestAttachment(ticketId: string): Promise<void> {
		const files = await vscode.window.showOpenDialog({
			canSelectMany: false,
			canSelectFiles: true,
			canSelectFolders: false,
			openLabel: 'Attach',
		});
		if (!files || files.length === 0) { return; }

		const fs = await import('fs');
		const srcPath = files[0].fsPath;
		const filename = path.basename(srcPath);

		const { getLogsDir } = await import('../services/dataDir');
		const attachDir = path.join(getLogsDir(), ticketId, 'attachments');
		fs.mkdirSync(attachDir, { recursive: true });

		const destPath = path.join(attachDir, filename);
		fs.copyFileSync(srcPath, destPath);

		this.db.tickets.addAttachment(ticketId, filename, destPath);

		const panel = this.panels.get(ticketId);
		panel?.webview.postMessage({
			type: 'detail:attachmentAdded',
			ticketId,
			filename,
			filepath: destPath,
		});
	}

	// ── HTML generation ───────────────────────────────────────────────────────

	private sendInit(ticketId: string, panel: vscode.WebviewPanel, initialTab?: string): void {
		const ticket = this.db.tickets.findById(ticketId);
		if (!ticket) { return; }
		const jobs = this.db.jobs.findByTicket(ticketId);
		const project = this.db.projects.findById(ticket.projectId);

		// Read historical log lines from the most recent job's log file so the
		// Activity and Live Log tabs are populated when a panel is opened for a
		// ticket that has already started or finished.
		let logHistory: Array<{ line: string; timestamp: string }> | undefined;
		const latestJob = jobs[jobs.length - 1];
		if (latestJob?.logPath) {
			try {
				if (fs.existsSync(latestJob.logPath)) {
					const content = fs.readFileSync(latestJob.logPath, 'utf8');
					const ts = new Date().toISOString();
					logHistory = content
						.split('\n')
						.filter(l => l.trim())
						.map(line => ({ line, timestamp: ts }));
				}
			} catch {
				// Best-effort — don't block init if the log file can't be read
			}
		}

		panel.webview.postMessage({ type: 'detail:init', ticket, jobs, project, initialTab, logHistory });
	}

	private buildHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('hex');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'ticket-detail.js'),
		);
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'ticket-detail.css'),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
	<link rel="stylesheet" href="${cssUri}">
	<title>Ticket Detail</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
