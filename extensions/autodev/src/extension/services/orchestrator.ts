/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import type { Ticket, Project, ExecutionJob } from '../types';
import type { AutoDevDatabase } from './database';
import type { ClaudeCodeRunner } from './claudeCodeRunner';
import { GitManager } from './gitManager';
import { LogStreamer } from './logStreamer';
import { TemplateEngine, resolveContextFiles } from './templateEngine';
import { detectStack } from './projectDetector';

const TICK_INTERVAL_MS = 500;

export interface OrchestratorConfig {
	/** Global cap on concurrent Claude Code processes */
	maxWorkers: number;
	/** Max test-fix retry cycles per ticket */
	maxRetries: number;
	/** Max Claude Code turns per session */
	claudeMaxTurns: number;
	/** Branch prefix for new worktree branches */
	branchPrefix: string;
	/** Absolute path to the AutoDev logs directory */
	logsDir: string;
	/** Absolute path to the AutoDev templates directory */
	templatesDir: string;
	/** Optional override path to the claude binary */
	claudeCodePath?: string;
	/** How to handle Claude Code tool-use permission prompts */
	permissionMode?: 'skip' | 'allowedTools' | 'prompt';
	/** Tools to pre-approve when permissionMode is 'allowedTools' */
	allowedTools?: string[];
}

interface ActiveWorker {
	job: ExecutionJob;
	ticket: Ticket;
	project: Project;
}

/**
 * The Orchestrator is the single entry point for all autonomous execution.
 * It maintains a job queue, a worker pool, and drives each ticket through its
 * full lifecycle: plan → (review) → execute → test → fix loop → complete.
 *
 * Events emitted:
 *   'ticket:status'  (ticketId: string, status: TicketStatus)
 *   'job:progress'   (ticketId: string, phase: string, pct: number)
 *   'log:line'       (ticketId: string, line: string, timestamp: string)
 *   'job:completed'  (ticketId: string)
 *   'job:failed'     (ticketId: string, error: string)
 */
export class Orchestrator extends EventEmitter {
	private readonly queue: ExecutionJob[] = [];
	private readonly activeWorkers = new Map<string, ActiveWorker>();
	private tickTimer: NodeJS.Timeout | undefined;
	private readonly templateEngine: TemplateEngine;

	constructor(
		private readonly db: AutoDevDatabase,
		private readonly runner: ClaudeCodeRunner,
		private readonly logStreamer: LogStreamer,
		private readonly config: OrchestratorConfig,
	) {
		super();
		this.templateEngine = new TemplateEngine(config.templatesDir);

		// Forward log lines from the streamer to our own event
		this.logStreamer.on('line', (jobId: string, line: string, timestamp: string) => {
			const worker = [...this.activeWorkers.values()].find(w => w.job.id === jobId);
			if (worker) {
				this.emit('log:line', worker.ticket.id, line, timestamp);
			}
		});
	}

	/** Starts the polling tick loop. */
	start(): void {
		if (this.tickTimer) {
			return;
		}
		this.tickTimer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
	}

	/** Stops the polling tick loop. Does not cancel running workers. */
	stop(): void {
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = undefined;
		}
		this.logStreamer.stopAll();
	}

	// ── Public API ─────────────────────────────────────────────────────────────

	/**
	 * Queues a plan phase for a ticket that is in 'backlog' or 'plan_review'.
	 * If the project uses autoExecuteAfterPlan, the execute phase is queued
	 * automatically when the plan completes.
	 */
	async enqueuePlan(ticket: Ticket, project: Project): Promise<ExecutionJob> {
		const logPath = LogStreamer.logPath(this.config.logsDir, ticket.id, 'plan');
		const job = this.db.jobs.create(ticket.id, 'plan', logPath);
		this.db.tickets.updateStatus(ticket.id, 'planning');
		this.emit('ticket:status', ticket.id, 'planning');

		this.queue.push(job);
		this.db.analytics.record('plan_started', {}, ticket.id, project.id);
		void this.tick();
		return job;
	}

	/**
	 * Queues an execute phase for a ticket that has an approved plan.
	 */
	async enqueueExecute(ticket: Ticket, project: Project): Promise<ExecutionJob> {
		const logPath = LogStreamer.logPath(this.config.logsDir, ticket.id, 'execute');
		const job = this.db.jobs.create(ticket.id, 'execute', logPath);
		this.db.tickets.updateStatus(ticket.id, 'queued');
		this.emit('ticket:status', ticket.id, 'queued');

		this.queue.push(job);
		this.db.analytics.record('execute_queued', {}, ticket.id, project.id);
		void this.tick();
		return job;
	}

	/**
	 * Cancels any running or queued job for the given ticket.
	 */
	async cancel(ticketId: string): Promise<void> {
		// Remove from queue
		const queueIdx = this.queue.findIndex(j => j.ticketId === ticketId);
		if (queueIdx !== -1) {
			const [job] = this.queue.splice(queueIdx, 1);
			this.db.jobs.updateStatus(job.id, 'failed', { completedAt: new Date(), exitCode: -1 });
		}

		// Cancel running worker
		this.runner.cancel(ticketId);
		const worker = this.activeWorkers.get(ticketId);
		if (worker) {
			this.activeWorkers.delete(ticketId);
			this.logStreamer.stop(worker.job.id);
			this.db.jobs.updateStatus(worker.job.id, 'failed', { completedAt: new Date(), exitCode: -1 });
		}

		this.db.tickets.updateStatus(ticketId, 'failed', { error: 'Cancelled by user.' });
		this.emit('ticket:status', ticketId, 'failed');
	}

	/** Returns the number of currently running workers. */
	getActiveWorkerCount(): number {
		return this.activeWorkers.size;
	}

	// ── Tick loop ──────────────────────────────────────────────────────────────

	private async tick(): Promise<void> {
		if (this.queue.length === 0 || this.activeWorkers.size >= this.config.maxWorkers) {
			return;
		}

		for (let i = 0; i < this.queue.length; i++) {
			if (this.activeWorkers.size >= this.config.maxWorkers) {
				break;
			}

			const job = this.queue[i];
			const ticket = this.db.tickets.findById(job.ticketId);
			if (!ticket) {
				this.queue.splice(i--, 1);
				continue;
			}

			const project = this.db.projects.findById(ticket.projectId);
			if (!project) {
				this.queue.splice(i--, 1);
				continue;
			}

			// Per-project worker limit
			const projectWorkerCount = [...this.activeWorkers.values()].filter(w => w.project.id === project.id).length;
			if (projectWorkerCount >= project.settings.maxParallelJobs) {
				continue; // try next job
			}

			// Start this worker
			this.queue.splice(i--, 1);
			this.activeWorkers.set(ticket.id, { job, ticket, project });
			void this.runWorker(job, ticket, project);
		}
	}

	// ── Worker execution ───────────────────────────────────────────────────────

	private async runWorker(job: ExecutionJob, ticket: Ticket, project: Project): Promise<void> {
		this.db.jobs.updateStatus(job.id, 'running', { startedAt: new Date(), workerPid: process.pid });

		try {
			if (job.phase === 'plan') {
				await this.runPlanPhase(job, ticket, project);
			} else if (job.phase === 'execute' || job.phase === 'fix') {
				await this.runExecutePhase(job, ticket, project);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.finishWorker(job, ticket, project, false, message);
		}
	}

	// ── Plan phase ─────────────────────────────────────────────────────────────

	private async runPlanPhase(job: ExecutionJob, ticket: Ticket, project: Project): Promise<void> {
		// Plan phase covers 0–30% of the overall progress bar.
		this.emit('job:progress', ticket.id, 'plan', 5);
		this.logStreamer.watch(job.id, job.logPath);

		const stack = detectStack(project.repoPath);

		// Resolve context files from project settings glob patterns.
		let contextFiles: string | undefined;
		if (project.settings.contextFiles?.length) {
			try {
				contextFiles = resolveContextFiles(project.repoPath, project.settings.contextFiles) || undefined;
			} catch {
				// Context file resolution is best-effort — don't fail the job.
			}
		}

		const prompt = this.templateEngine.render(ticket.planType, {
			ticketTitle: ticket.title,
			ticketDescription: ticket.description,
			projectName: project.name,
			autoDetectedStack: stack.description,
			testCommand: project.settings.testCommand ?? stack.testCommand ?? '',
			buildCommand: project.settings.buildCommand ?? stack.buildCommand ?? '',
			contextFiles,
		});

		this.emit('job:progress', ticket.id, 'plan', 10);

		const result = await this.runner.run(ticket.id, {
			prompt,
			cwd: project.repoPath,
			logPath: job.logPath,
			maxTurns: this.config.claudeMaxTurns,
			claudeCodePath: this.config.claudeCodePath ?? project.settings.claudeCodePath,
			permissionMode: this.config.permissionMode,
			allowedTools: this.config.allowedTools,
			onLine: line => this.emit('log:line', ticket.id, line, new Date().toISOString()),
		});

		this.logStreamer.stop(job.id);
		this.emit('job:progress', ticket.id, 'plan', 28);

		if (result.exitCode !== 0) {
			throw new Error(`Plan generation failed with exit code ${result.exitCode}`);
		}

		// Save plan output — Claude returns the plan as the last assistant message.
		const plan = extractPlanFromOutput(result.output);
		this.db.tickets.updatePlan(ticket.id, plan);

		// Decide next state
		if (project.settings.autoExecuteAfterPlan) {
			const refreshed = this.db.tickets.findById(ticket.id)!;
			await this.enqueueExecute(refreshed, project);
		} else {
			this.db.tickets.updateStatus(ticket.id, 'plan_review');
			this.emit('ticket:status', ticket.id, 'plan_review');
		}

		this.db.jobs.updateStatus(job.id, 'completed', { completedAt: new Date(), exitCode: 0 });
		this.activeWorkers.delete(ticket.id);
		this.db.analytics.record('plan_completed', {}, ticket.id, project.id);
		this.emit('job:progress', ticket.id, 'plan', 30);
		void this.tick();
	}

	// ── Execute phase (with test-fix retry loop) ───────────────────────────────

	private async runExecutePhase(job: ExecutionJob, ticket: Ticket, project: Project): Promise<void> {
		// Execute phase covers 30–80% of the overall progress bar.
		this.emit('job:progress', ticket.id, 'execute', 32);

		// Create or reuse the git worktree
		const gitManager = new GitManager(project.repoPath);
		await gitManager.checkGitVersion();

		const slug = slugify(ticket.title);
		const worktreePath = await gitManager.createWorktree(
			project.worktreeRoot,
			ticket.id,
			slug,
			project.defaultBranch,
			this.config.branchPrefix,
		);

		const branch = `${this.config.branchPrefix}ticket-${ticket.id}-${slug}`;
		this.db.tickets.updateBranch(ticket.id, branch, worktreePath);
		this.db.tickets.updateStatus(ticket.id, 'in_progress', { startedAt: new Date() });
		this.emit('ticket:status', ticket.id, 'in_progress');

		this.emit('job:progress', ticket.id, 'execute', 36);
		this.logStreamer.watch(job.id, job.logPath);

		const stack = detectStack(project.repoPath);
		const testCommand = project.settings.testCommand ?? stack.testCommand;
		const lintCommand = project.settings.lintCommand ?? stack.lintCommand;

		// Resolve context files for the execution prompt.
		let contextFiles: string | undefined;
		if (project.settings.contextFiles?.length) {
			try {
				contextFiles = resolveContextFiles(project.repoPath, project.settings.contextFiles) || undefined;
			} catch {
				// Best-effort
			}
		}

		// Build the execution prompt
		const executionPrompt = buildExecutionPrompt(ticket, testCommand, contextFiles);

		let retryCount = 0;
		let lastError = '';
		let success = false;

		while (retryCount <= this.config.maxRetries) {
			const promptWithContext = retryCount === 0
				? executionPrompt
				: buildFixPrompt(executionPrompt, lastError, retryCount);

			// Execute progress: 36–78% spread across the retry loop attempts.
			const pct = 36 + Math.round((retryCount / (this.config.maxRetries + 1)) * 40);
			this.emit('job:progress', ticket.id, 'execute', pct);

			const result = await this.runner.run(ticket.id, {
				prompt: promptWithContext,
				cwd: worktreePath,
				logPath: job.logPath,
				maxTurns: this.config.claudeMaxTurns,
				claudeCodePath: this.config.claudeCodePath ?? project.settings.claudeCodePath,
				permissionMode: this.config.permissionMode,
				allowedTools: this.config.allowedTools,
				onLine: line => this.emit('log:line', ticket.id, line, new Date().toISOString()),
			});

			if (result.exitCode !== 0) {
				throw new Error(`Claude Code exited with code ${result.exitCode}`);
			}

			// Test phase covers 80–95% of the overall progress bar.
			if (testCommand) {
				this.db.tickets.updateStatus(ticket.id, 'testing');
				this.emit('ticket:status', ticket.id, 'testing');
				this.emit('job:progress', ticket.id, 'test', 80);

				const testResult = await this.runCommand(testCommand, worktreePath);
				if (testResult.exitCode === 0) {
					this.db.analytics.record('test_passed', { retry: retryCount }, ticket.id, project.id);
					this.emit('job:progress', ticket.id, 'test', 93);
					success = true;
					break;
				}

				lastError = testResult.output;
				retryCount++;
				this.db.jobs.incrementRetry(job.id);
				this.db.analytics.record('test_failed', { retry: retryCount }, ticket.id, project.id);

				if (retryCount > this.config.maxRetries) {
					throw new Error(`Tests still failing after ${this.config.maxRetries} retries.\n\nLast error:\n${lastError}`);
				}
			} else {
				success = true;
				break;
			}
		}

		if (!success) {
			throw new Error('Execution failed after exhausting retries.');
		}

		// Run lint command if configured — non-blocking, log result but do not retry.
		if (lintCommand) {
			this.emit('log:line', ticket.id, `[AutoDev] Running lint: ${lintCommand}`, new Date().toISOString());
			try {
				const lintResult = await this.runCommand(lintCommand, worktreePath);
				const lintStatus = lintResult.exitCode === 0 ? 'passed' : 'failed';
				this.emit('log:line', ticket.id, `[AutoDev] Lint ${lintStatus}.`, new Date().toISOString());
				this.db.analytics.record(`lint_${lintStatus}`, {}, ticket.id, project.id);
			} catch {
				this.emit('log:line', ticket.id, '[AutoDev] Lint command failed to run.', new Date().toISOString());
			}
		}

		this.emit('job:progress', ticket.id, 'test', 95);
		this.logStreamer.stop(job.id);

		// Collect change summary and store metadata.
		let filesChanged: string[] = [];
		try {
			const summary = await gitManager.getChangeSummary(worktreePath);
			filesChanged = summary.fileStats.map(f => f.path);
			this.db.tickets.setMetadata(ticket.id, {
				filesChanged,
				testsPassed: !!testCommand,
				retryCount,
			});
		} catch {
			// Change summary is best-effort
		}

		this.finishWorker(job, ticket, project, true, undefined);
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	private finishWorker(job: ExecutionJob, ticket: Ticket, project: Project, succeeded: boolean, errorMessage: string | undefined): void {
		this.logStreamer.stop(job.id);
		this.activeWorkers.delete(ticket.id);

		if (succeeded) {
			this.db.jobs.updateStatus(job.id, 'completed', { completedAt: new Date(), exitCode: 0 });
			this.db.tickets.updateStatus(ticket.id, 'completed', { completedAt: new Date() });
			this.emit('ticket:status', ticket.id, 'completed');
			this.emit('job:completed', ticket.id);
			this.emit('job:progress', ticket.id, 'execute', 100);
			this.db.analytics.record('execute_completed', {}, ticket.id, project.id);
		} else {
			const msg = errorMessage ?? 'Unknown error';
			this.db.jobs.updateStatus(job.id, 'failed', { completedAt: new Date(), exitCode: 1 });
			this.db.tickets.updateStatus(ticket.id, 'failed', { error: msg, completedAt: new Date() });
			this.emit('ticket:status', ticket.id, 'failed');
			this.emit('job:failed', ticket.id, msg);
			this.db.analytics.record('job_failed', { error: msg }, ticket.id, project.id);
		}

		void this.tick();
	}

	private async runCommand(command: string, cwd: string): Promise<{ exitCode: number; output: string }> {
		return new Promise(resolve => {
			const parts = command.split(' ');
			const cmd = parts[0] ?? '';
			const args = parts.slice(1);
			execFile(cmd, args, { cwd, env: process.env }, (error, stdout, stderr) => {
				const exitCode = error
					? (typeof error.code === 'number' ? error.code : 1)
					: 0;
				resolve({ exitCode, output: stdout + stderr });
			});
		});
	}
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildExecutionPrompt(ticket: Ticket, testCommand: string | undefined, contextFiles?: string): string {
	const testLine = testCommand
		? `\nWhen you are done, run \`${testCommand}\` and ensure all tests pass. Fix any failures before finishing.`
		: '';
	const contextSection = contextFiles
		? `\n## Key Files for Context\n\n${contextFiles}\n`
		: '';
	return `You are implementing the following feature in this codebase.

## Task
${ticket.title}

${ticket.description}

## Implementation Plan
${ticket.plan ?? '(No plan provided — implement based on the task description above.)'}
${contextSection}
## Instructions
- Follow the existing code style and conventions.
- Write or update tests for any new behaviour.
- Commit your changes with clear, descriptive commit messages.${testLine}
`;
}

function buildFixPrompt(originalPrompt: string, testErrors: string, retryCount: number): string {
	return `${originalPrompt}

---

## Test Failure (Retry ${retryCount})

The tests are still failing. Please read the error output below carefully and fix the code:

\`\`\`
${testErrors.slice(0, 8000)}
\`\`\`

Do not change test expectations unless they are clearly wrong. Fix the implementation to match the tests.
`;
}

/**
 * Extracts the plan/analysis text from Claude Code's stream-json output.
 * Falls back to returning the raw output if parsing fails.
 */
function extractPlanFromOutput(output: string): string {
	// Claude Code stream-json emits one JSON object per line.
	// The final assistant message contains the plan.
	const lines = output.split('\n').filter(Boolean);
	let lastContent = '';

	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as Record<string, unknown>;
			if (obj.type === 'assistant' && typeof obj.message === 'object') {
				const msg = obj.message as Record<string, unknown>;
				if (Array.isArray(msg.content)) {
					for (const block of msg.content as Array<Record<string, unknown>>) {
						if (block.type === 'text' && typeof block.text === 'string') {
							lastContent = block.text;
						}
					}
				}
			}
		} catch {
			// Not JSON — skip
		}
	}

	return lastContent || output.trim();
}

/** Converts a ticket title to a URL-safe slug for branch names. */
function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.slice(0, 50);
}
