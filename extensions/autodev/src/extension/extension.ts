/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDataDir, getDbPath, getLogsDir, getTemplatesDir } from './services/dataDir';
import { AutoDevDatabase } from './services/database';
import { ClaudeCodeRunner } from './services/claudeCodeRunner';
import { LogStreamer } from './services/logStreamer';
import { Orchestrator } from './services/orchestrator';
import type { OrchestratorConfig } from './services/orchestrator';
import { KanbanViewProvider } from './providers/kanbanViewProvider';
import { StatusBarProvider } from './providers/statusBarProvider';
import { TicketDetailProvider } from './providers/ticketDetailProvider';
import { TemplateEditorProvider } from './providers/templateEditorProvider';
import { AnalyticsViewProvider } from './providers/analyticsViewProvider';
import { SidebarViewProvider } from './providers/sidebarViewProvider';

const execFileAsync = promisify(execFile);

let db: AutoDevDatabase | undefined;
let orchestrator: Orchestrator | undefined;

export function activate(context: vscode.ExtensionContext): void {
	ensureDataDir(context);

	const output = vscode.window.createOutputChannel('AutoDev (Logs)');
	context.subscriptions.push(output);
	output.appendLine('AutoDev Studio activated.');

	// ── Bootstrap core services ───────────────────────────────────────────────
	try {
		db = new AutoDevDatabase(getDbPath());
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		output.appendLine(`[ERROR] Failed to open database: ${msg}`);
		vscode.window.showErrorMessage(`AutoDev: Failed to open database. ${msg}`);
		return;
	}

	const cfg = vscode.workspace.getConfiguration('autodev');
	const config: OrchestratorConfig = {
		maxWorkers: cfg.get<number>('maxParallelJobs') ?? 4,
		maxRetries: cfg.get<number>('defaults.maxRetries') ?? 3,
		claudeMaxTurns: cfg.get<number>('defaults.claudeMaxTurns') ?? 50,
		branchPrefix: cfg.get<string>('git.branchPrefix') ?? 'autodev/',
		logsDir: getLogsDir(),
		templatesDir: getTemplatesDir(),
		claudeCodePath: cfg.get<string>('claudeCodePath'),
		permissionMode: cfg.get<'skip' | 'allowedTools'>('claudePermissions') ?? 'skip',
		allowedTools: cfg.get<string[]>('claudeAllowedTools') ?? [],
	};

	const runner = new ClaudeCodeRunner();
	const logStreamer = new LogStreamer();
	orchestrator = new Orchestrator(db, runner, logStreamer, config);

	const bundledTemplatesDir = path.join(context.extensionPath, 'templates');

	// ── UI providers ──────────────────────────────────────────────────────────
	const ticketDetailProvider = new TicketDetailProvider(context, db, orchestrator, output);
	const kanbanProvider = new KanbanViewProvider(context, db, orchestrator, output, ticketDetailProvider);
	const templateEditorProvider = new TemplateEditorProvider(context, getTemplatesDir(), bundledTemplatesDir);
	const analyticsProvider = new AnalyticsViewProvider(context, db);
	new StatusBarProvider(db, orchestrator, context);

	// ── Sidebar panel ──────────────────────────────────────────────────────────
	const sidebarProvider = new SidebarViewProvider(context, db, orchestrator, output, ticketDetailProvider, kanbanProvider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('autodev.sidebar', sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	// ── Orchestrator event forwarding ─────────────────────────────────────────
	orchestrator.on('ticket:status', (ticketId: string, status: string) => {
		output.appendLine(`[AutoDev] Ticket ${ticketId} → ${status}`);
	});

	orchestrator.on('job:completed', (ticketId: string) => {
		const ticket = db?.tickets.findById(ticketId);
		const notify = cfg.get<boolean>('notifications.onJobComplete') ?? true;
		if (notify && ticket) {
			vscode.window.showInformationMessage(
				`✅ AutoDev: "${ticket.title}" completed.`,
				'Open Details',
			).then(action => {
				if (action === 'Open Details') {
					ticketDetailProvider.open(ticketId, 'changes');
				}
			});
		}
	});

	orchestrator.on('job:failed', (ticketId: string, error: string) => {
		const ticket = db?.tickets.findById(ticketId);
		const notify = cfg.get<boolean>('notifications.onJobFailed') ?? true;
		if (notify && ticket) {
			vscode.window.showErrorMessage(
				`❌ AutoDev: "${ticket.title}" failed. ${error.split('\n')[0]}`,
				'View Logs',
			).then(action => {
				if (action === 'View Logs') {
					ticketDetailProvider.open(ticketId, 'log');
				}
			});
		}
		output.appendLine(`[ERROR] Job failed for ${ticketId}: ${error}`);
	});

	orchestrator.on('ticket:status', (ticketId: string, status: string) => {
		if (status === 'plan_review') {
			const ticket = db?.tickets.findById(ticketId);
			const notify = cfg.get<boolean>('notifications.onPlanReady') ?? true;
			if (notify && ticket) {
				vscode.window.showInformationMessage(
					`👁️ AutoDev: Plan ready for "${ticket.title}"`,
					'Review Plan',
					'Open Board',
				).then(action => {
					if (action === 'Review Plan') {
						ticketDetailProvider.open(ticketId, 'plan');
					} else if (action === 'Open Board') {
						kanbanProvider.open();
					}
				});
			}
		}
	});

	orchestrator.start();

	// Recover any jobs that were 'running' when the editor was last closed
	recoverInterruptedJobs(db, output);

	// ── Worktree auto-cleanup ─────────────────────────────────────────────────
	const cleanAfterDays = cfg.get<number>('git.cleanAfterDays') ?? 7;
	const autoClean = cfg.get<boolean>('git.autoCleanWorktrees') ?? true;
	if (autoClean) {
		void cleanStaleWorktrees(db, output, cleanAfterDays);
		// Repeat once per day
		const dailyCleanup = setInterval(
			() => void cleanStaleWorktrees(db!, output, cleanAfterDays),
			24 * 60 * 60 * 1000,
		);
		context.subscriptions.push({ dispose: () => clearInterval(dailyCleanup) });
	}

	context.subscriptions.push({ dispose: () => { orchestrator?.stop(); db?.close(); } });

	// ── Onboarding (first-run) ────────────────────────────────────────────────
	const firstRun = context.globalState.get<boolean>('autodev.firstRun', true);
	if (firstRun) {
		void context.globalState.update('autodev.firstRun', false);
		void runOnboarding(context);
	}

	// ── Commands ──────────────────────────────────────────────────────────────

	context.subscriptions.push(vscode.commands.registerCommand('autodev.addProject', async () => {
		const folders = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'Add Project',
		});
		if (!folders || folders.length === 0) {
			return;
		}
		const repoPath = folders[0].fsPath;

		// Validate it is a git repository
		try {
			await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree']);
		} catch {
			vscode.window.showErrorMessage(
				`AutoDev: "${repoPath}" is not a git repository. Please initialise git first (\`git init\`).`,
			);
			return;
		}

		const name = await vscode.window.showInputBox({
			prompt: 'Project name',
			value: repoPath.split('/').pop(),
		});
		if (!name) {
			return;
		}
		const project = db!.projects.create({ name, repoPath });
		db!.analytics.record('project_added', { name }, undefined, project.id);
		output.appendLine(`[AutoDev] Added project: ${project.name} (${project.id})`);

		const action = await vscode.window.showInformationMessage(
			`AutoDev: Added project "${project.name}". Create your first ticket?`,
			'Create Ticket',
			'Open Board',
		);
		kanbanProvider.sendState();
		sidebarProvider.sendState();
		if (action === 'Create Ticket') {
			kanbanProvider.open();
			await kanbanProvider.createTicket(project.id);
		} else if (action === 'Open Board') {
			kanbanProvider.open();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.openBoard', () => {
		kanbanProvider.open();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.newTicket', async () => {
		kanbanProvider.open();
		await kanbanProvider.createTicket();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.showRunningJobs', async () => {
		const tickets = db!.tickets.findAll().filter(
			t => t.status === 'in_progress' || t.status === 'planning' || t.status === 'queued'
		);
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No jobs are currently running.');
			return;
		}
		const items = tickets.map(t => ({ label: t.title, description: t.status, detail: t.id }));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Running Jobs',
			placeHolder: 'Select a job to view details',
		});
		if (picked?.detail) {
			ticketDetailProvider.open(picked.detail, 'log');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.cancelJob', async () => {
		const tickets = db!.tickets.findAll().filter(
			t => t.status === 'in_progress' || t.status === 'planning' || t.status === 'queued'
		);
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No running jobs to cancel.');
			return;
		}
		const items = tickets.map(t => ({ label: t.title, description: t.status, detail: t.id }));
		const selected = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Cancel Job',
			placeHolder: 'Select a job to cancel',
		});
		if (selected?.detail) {
			await orchestrator!.cancel(selected.detail);
			vscode.window.showInformationMessage(`AutoDev: Cancelled "${selected.label}".`);
			kanbanProvider.sendState();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.viewTicketLogs', async () => {
		const tickets = db!.tickets.findAll();
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No tickets found.');
			return;
		}
		const items = tickets.map(t => ({ label: t.title, description: t.status, detail: t.id }));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — View Ticket Logs',
			placeHolder: 'Select a ticket to view its logs',
		});
		if (picked?.detail) {
			ticketDetailProvider.open(picked.detail, 'log');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.checkoutTicketBranch', async () => {
		const tickets = db!.tickets.findAll().filter(
			t => t.branch && (t.status === 'completed' || t.status === 'failed' || t.status === 'plan_review')
		);
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No tickets with branches available.');
			return;
		}
		const items = tickets.map(t => ({
			label: t.title,
			description: t.branch ?? '',
			detail: t.id,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Checkout Ticket Branch',
			placeHolder: 'Select a ticket to checkout its branch',
		});
		if (!picked?.detail) { return; }
		const ticket = db!.tickets.findById(picked.detail);
		if (!ticket?.branch) { return; }
		const project = ticket.projectId ? db!.projects.findById(ticket.projectId) : undefined;
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found for this ticket.');
			return;
		}
		const terminal = vscode.window.createTerminal({
			name: `AutoDev — Checkout ${ticket.branch}`,
			cwd: project.repoPath,
		});
		terminal.show();
		terminal.sendText(`git checkout ${ticket.branch}`);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('autodev.executeSelectedTicket', async () => {
		const tickets = db!.tickets.findAll().filter(
			t => t.status === 'backlog' || t.status === 'plan_review' || t.status === 'failed'
		);
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No tickets available to execute.');
			return;
		}
		const items = tickets.map(t => ({ label: t.title, description: t.status, detail: t.id }));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Execute Ticket',
			placeHolder: 'Select a ticket to execute',
		});
		if (!picked?.detail) { return; }
		const ticket = db!.tickets.findById(picked.detail);
		if (!ticket) { return; }
		const project = db!.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found for this ticket.');
			return;
		}
		try {
			if (ticket.status === 'plan_review') {
				await orchestrator!.enqueueExecute(ticket, project);
			} else {
				await orchestrator!.enqueuePlan(ticket, project);
			}
			vscode.window.showInformationMessage(`AutoDev: Started execution of "${ticket.title}".`);
			kanbanProvider.sendState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Failed to start. ${msg}`);
		}
	}));

	// ── Command: Open Analytics ───────────────────────────────────────────────
	context.subscriptions.push(vscode.commands.registerCommand('autodev.openAnalytics', () => {
		analyticsProvider.open();
	}));

	// ── Command: Edit Templates ───────────────────────────────────────────────
	context.subscriptions.push(vscode.commands.registerCommand('autodev.editTemplates', () => {
		templateEditorProvider.open();
	}));

	// ── Command: Merge Ticket ─────────────────────────────────────────────────
	context.subscriptions.push(vscode.commands.registerCommand('autodev.mergeTicket', async () => {
		const tickets = db!.tickets.findAll().filter(t => t.status === 'completed' && t.branch);
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No completed tickets with branches to merge.');
			return;
		}
		const items = tickets.map(t => ({
			label: t.title,
			description: t.branch ?? '',
			detail: t.id,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Merge Ticket',
			placeHolder: 'Select a ticket to merge',
		});
		if (!picked?.detail) { return; }
		const ticket = db!.tickets.findById(picked.detail);
		if (!ticket?.branch) { return; }
		const project = db!.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found.');
			return;
		}
		const confirm = await vscode.window.showWarningMessage(
			`Merge "${ticket.branch}" into "${project.defaultBranch}"?`,
			{ modal: true },
			'Merge',
		);
		if (confirm !== 'Merge') { return; }
		try {
			const { GitManager } = await import('./services/gitManager');
			const git = new GitManager(project.repoPath);
			await git.mergeBranch(ticket.branch, project.defaultBranch);
			if (ticket.worktreePath) {
				await git.removeWorktree(ticket.worktreePath);
			}
			db!.tickets.updateStatus(picked.detail, 'merged');
			db!.analytics.record('ticket_merged', { branch: ticket.branch }, ticket.id, project.id);
			vscode.window.showInformationMessage(`AutoDev: Merged "${ticket.branch}" successfully.`);
			kanbanProvider.sendState();
			sidebarProvider.sendState();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`AutoDev: Merge failed. ${msg}`);
		}
	}));

	// ── Command: Create PR (full implementation with gh CLI) ──────────────────
	context.subscriptions.push(vscode.commands.registerCommand('autodev.createPR', async () => {
		const tickets = db!.tickets.findAll().filter(t => t.branch &&
			(t.status === 'completed' || t.status === 'merged'));
		if (tickets.length === 0) {
			vscode.window.showInformationMessage('AutoDev: No completed tickets with branches to create PRs for.');
			return;
		}
		const items = tickets.map(t => ({
			label: t.title,
			description: t.branch ?? '',
			detail: t.id,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'AutoDev — Create Pull Request',
			placeHolder: 'Select a ticket to create a PR for',
		});
		if (!picked?.detail) { return; }

		const ticket = db!.tickets.findById(picked.detail);
		if (!ticket?.branch) { return; }
		const project = db!.projects.findById(ticket.projectId);
		if (!project) {
			vscode.window.showErrorMessage('AutoDev: Project not found.');
			return;
		}

		await createPullRequest(ticket.title, ticket.branch, ticket.plan ?? '', project.repoPath, output);
	}));

	// ── Command: Project Settings ─────────────────────────────────────────────
	context.subscriptions.push(vscode.commands.registerCommand('autodev.projectSettings', async () => {
		await openProjectSettings(db!, kanbanProvider, output);
	}));
}

export function deactivate(): void {
	orchestrator?.stop();
	db?.close();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sets any 'running' jobs back to 'failed' with a recovery message on startup. */
function recoverInterruptedJobs(database: AutoDevDatabase, output: vscode.OutputChannel): void {
	const allTickets = database.tickets.findAll();
	for (const ticket of allTickets) {
		if (ticket.status === 'in_progress' || ticket.status === 'planning' || ticket.status === 'testing') {
			database.tickets.updateStatus(ticket.id, 'failed', {
				error: 'Job interrupted by editor restart. Re-execute to try again.',
			});
			output.appendLine(`[AutoDev] Recovered interrupted job: ${ticket.title} (${ticket.id})`);
		}
	}
}

/**
 * Scans all projects for stale worktrees — those whose tickets are merged/deleted
 * and the worktree is older than `cleanAfterDays` — and removes them.
 */
async function cleanStaleWorktrees(database: AutoDevDatabase, output: vscode.OutputChannel, cleanAfterDays: number): Promise<void> {
	const { GitManager } = await import('./services/gitManager');
	const cutoff = Date.now() - cleanAfterDays * 24 * 60 * 60 * 1000;
	const projects = database.projects.findAll();

	for (const project of projects) {
		let worktrees: import('./types').WorktreeInfo[];
		try {
			const git = new GitManager(project.repoPath);
			worktrees = await git.listWorktrees();
		} catch {
			continue;
		}

		for (const wt of worktrees) {
			if (!wt.ticketId) { continue; }
			const ticket = database.tickets.findById(wt.ticketId);
			if (!ticket || (ticket.status !== 'merged' && ticket.status !== 'failed')) {
				continue;
			}
			// Only clean if the worktree is old enough
			try {
				const stat = fs.statSync(wt.path);
				if (stat.mtimeMs > cutoff) { continue; }
			} catch {
				continue;
			}

			try {
				const git = new GitManager(project.repoPath);
				await git.removeWorktree(wt.path);
				output.appendLine(`[AutoDev] Cleaned up stale worktree: ${wt.path}`);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				output.appendLine(`[AutoDev] Failed to clean worktree ${wt.path}: ${msg}`);
			}
		}
	}
}

/**
 * Creates a GitHub Pull Request using the `gh` CLI.
 * Shows the PR URL in a clickable notification on success.
 */
async function createPullRequest(
	title: string,
	branch: string,
	body: string,
	repoPath: string,
	output: vscode.OutputChannel,
): Promise<void> {
	// 1. Check for gh CLI
	let ghBin: string;
	try {
		const { stdout } = await execFileAsync('which', ['gh']);
		ghBin = stdout.trim();
		if (!ghBin) { throw new Error('empty'); }
	} catch {
		vscode.window.showErrorMessage(
			'AutoDev: The GitHub CLI (`gh`) is not installed. Install it from https://cli.github.com/ then run `gh auth login`.',
			'Open Install Page',
		).then(action => {
			if (action === 'Open Install Page') {
				vscode.env.openExternal(vscode.Uri.parse('https://cli.github.com/'));
			}
		});
		return;
	}

	// 2. Push the branch to origin
	try {
		await execFileAsync('git', ['push', '--set-upstream', 'origin', branch], { cwd: repoPath });
		output.appendLine(`[AutoDev] Pushed branch ${branch} to origin.`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`AutoDev: Failed to push branch. ${msg}`);
		return;
	}

	// 3. Create the PR
	let prUrl: string;
	try {
		const { stdout } = await execFileAsync(
			ghBin,
			['pr', 'create', '--title', title, '--body', body || title, '--web=false'],
			{ cwd: repoPath },
		);
		// gh outputs the PR URL as the last line
		prUrl = stdout.trim().split('\n').pop() ?? '';
		output.appendLine(`[AutoDev] Created PR: ${prUrl}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// Common auth error — guide the user
		if (msg.includes('auth')) {
			vscode.window.showErrorMessage(
				'AutoDev: `gh` is not authenticated. Run `gh auth login` in your terminal.',
			);
		} else {
			vscode.window.showErrorMessage(`AutoDev: Failed to create PR. ${msg}`);
		}
		return;
	}

	// 4. Show clickable notification
	vscode.window.showInformationMessage(
		`AutoDev: Pull request created for "${title}".`,
		'Open PR',
	).then(action => {
		if (action === 'Open PR' && prUrl) {
			vscode.env.openExternal(vscode.Uri.parse(prUrl));
		}
	});
}

/**
 * First-run onboarding: shows a welcome notification and opens WELCOME.md in
 * a markdown preview tab.
 */
async function runOnboarding(context: vscode.ExtensionContext): Promise<void> {
	// Write the WELCOME.md file to the extension's data directory if needed
	const welcomePath = path.join(context.extensionPath, 'WELCOME.md');
	if (!fs.existsSync(welcomePath)) {
		fs.writeFileSync(welcomePath, WELCOME_CONTENT, 'utf8');
	}

	const action = await vscode.window.showInformationMessage(
		'Welcome to AutoDev Studio! Run autonomous AI coding jobs from your editor.',
		'Open Welcome Guide',
		'Add First Project',
	);

	if (action === 'Open Welcome Guide') {
		const uri = vscode.Uri.file(welcomePath);
		await vscode.commands.executeCommand('markdown.showPreview', uri);
		// After they close the preview, prompt to add a project
		const next = await vscode.window.showInformationMessage(
			'Ready to get started? Add your first project.',
			'Add Project',
		);
		if (next === 'Add Project') {
			await vscode.commands.executeCommand('autodev.addProject');
		}
	} else if (action === 'Add First Project') {
		await vscode.commands.executeCommand('autodev.addProject');
	}
}

/**
 * Project Settings quick-input wizard.
 * Lets the user edit settings for any registered project.
 */
async function openProjectSettings(database: AutoDevDatabase, kanbanProvider: KanbanViewProvider, output: vscode.OutputChannel): Promise<void> {
	const projects = database.projects.findAll();
	if (projects.length === 0) {
		vscode.window.showWarningMessage('AutoDev: No projects registered. Add a project first.');
		return;
	}

	// Step 1 — Pick project
	const projectPick = await vscode.window.showQuickPick(
		projects.map(p => ({ label: p.name, description: p.repoPath, id: p.id })),
		{ title: 'AutoDev — Project Settings (1/6)', placeHolder: 'Select a project to configure' },
	);
	if (!projectPick) { return; }

	const project = database.projects.findById(projectPick.id);
	if (!project) { return; }

	const s = project.settings;

	// Step 2 — Max parallel jobs
	const maxJobsStr = await vscode.window.showInputBox({
		title: 'AutoDev — Project Settings (2/6)',
		prompt: 'Max parallel Claude Code sessions for this project',
		value: String(s.maxParallelJobs),
		validateInput: v => {
			const n = Number(v);
			return Number.isInteger(n) && n >= 1 && n <= 8 ? undefined : 'Enter a number between 1 and 8';
		},
	});
	if (maxJobsStr === undefined) { return; }

	// Step 3 — Test command
	const testCommand = await vscode.window.showInputBox({
		title: 'AutoDev — Project Settings (3/6)',
		prompt: 'Test command (leave blank to use auto-detected)',
		value: s.testCommand ?? '',
		placeHolder: 'e.g. npm test',
	});
	if (testCommand === undefined) { return; }

	// Step 4 — Build command
	const buildCommand = await vscode.window.showInputBox({
		title: 'AutoDev — Project Settings (4/6)',
		prompt: 'Build command (leave blank to use auto-detected)',
		value: s.buildCommand ?? '',
		placeHolder: 'e.g. npm run build',
	});
	if (buildCommand === undefined) { return; }

	// Step 5 — Lint command
	const lintCommand = await vscode.window.showInputBox({
		title: 'AutoDev — Project Settings (5/6)',
		prompt: 'Lint command (leave blank to use auto-detected)',
		value: s.lintCommand ?? '',
		placeHolder: 'e.g. npm run lint',
	});
	if (lintCommand === undefined) { return; }

	// Step 6 — Auto-execute after plan
	const autoExecPick = await vscode.window.showQuickPick(
		[
			{ label: 'No — require manual review before executing', value: false },
			{ label: 'Yes — execute automatically after planning', value: true },
		],
		{ title: 'AutoDev — Project Settings (6/6)', placeHolder: 'Auto-execute after plan?' },
	);
	if (!autoExecPick) { return; }

	// Save
	database.projects.update(project.id, {
		settings: {
			...s,
			maxParallelJobs: Number(maxJobsStr),
			testCommand: testCommand.trim() || undefined,
			buildCommand: buildCommand.trim() || undefined,
			lintCommand: lintCommand.trim() || undefined,
			autoExecuteAfterPlan: autoExecPick.value,
		},
	});

	output.appendLine(`[AutoDev] Updated settings for project: ${project.name}`);
	vscode.window.showInformationMessage(`AutoDev: Settings saved for "${project.name}".`);
	kanbanProvider.sendState();
}

// ── WELCOME.md content ────────────────────────────────────────────────────────

const WELCOME_CONTENT = `# Welcome to AutoDev Studio 🤖

AutoDev Studio lets you run **autonomous AI coding jobs** from inside VS Code, powered by Claude Code.

## How it works

1. **Add a project** — Point AutoDev at any local git repository.
2. **Create a ticket** — Describe a task: a feature, a bug fix, a refactor, a test suite.
3. **Choose a template** — Pick the planning approach (Simple Plan, PRD, Bug Fix, etc.).
4. **Execute** — AutoDev creates an isolated git worktree, runs Claude Code, and commits the result on a new branch.
5. **Review** — See the live logs, the changed files, and the generated plan in the Ticket Detail view.
6. **Merge or PR** — Merge directly or create a GitHub Pull Request with one click.

## Key concepts

| Concept | Description |
|---------|-------------|
| **Ticket** | A unit of autonomous work — a task for Claude to complete |
| **Plan** | A structured implementation plan generated before coding begins |
| **Worktree** | An isolated copy of your repository where Claude works safely |
| **Template** | A prompt template that guides Claude's planning and execution |

## Quick start

1. Open the Command Palette (\`Ctrl+Shift+P\` / \`Cmd+Shift+P\`)
2. Run **AutoDev: Add Project** and select your git repository
3. Run **AutoDev: Open Board** to see the Kanban view
4. Click **+ New Ticket** and describe your task
5. Click **Execute** and watch Claude work

## Tips

- Use the **Simple Plan** template for most tasks (fast, focused)
- Use **PRD** for large features that need detailed planning
- Use **Bug Fix** to investigate and fix a reported issue
- Use **Direct Execute** to skip planning and code immediately
- Add context files in Project Settings to give Claude extra context about your codebase

## Support

Open an issue at [github.com/your-org/autodev-studio](https://github.com)

---

*AutoDev Studio is a fork of VS Code with Claude Code integration.*
`;
