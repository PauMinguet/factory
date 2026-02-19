/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
	Project, ProjectSettings, CreateProjectInput,
	Ticket, TicketStatus, PlanType, TicketMetadata, Attachment, CreateTicketInput,
	ExecutionJob, JobPhase, JobStatus,
} from '../types';
import type { DailyStat, RecentJob } from '../types/analytics';

// Re-export DEFAULT_PROJECT_SETTINGS so callers don't need a separate import
export { DEFAULT_PROJECT_SETTINGS } from '../types';

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	repo_path TEXT NOT NULL,
	default_branch TEXT NOT NULL DEFAULT 'main',
	worktree_root TEXT NOT NULL,
	settings_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'backlog',
	plan_type TEXT NOT NULL DEFAULT 'simple_plan',
	plan TEXT,
	branch TEXT,
	worktree_path TEXT,
	error TEXT,
	metadata_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL,
	started_at TEXT,
	completed_at TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
	id TEXT PRIMARY KEY,
	ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
	filename TEXT NOT NULL,
	filepath TEXT NOT NULL,
	mime_type TEXT,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_jobs (
	id TEXT PRIMARY KEY,
	ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
	phase TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	worker_pid INTEGER,
	log_path TEXT NOT NULL DEFAULT '',
	exit_code INTEGER,
	retry_count INTEGER NOT NULL DEFAULT 0,
	started_at TEXT,
	completed_at TEXT
);

CREATE TABLE IF NOT EXISTS analytics_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
	project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
	event_type TEXT NOT NULL,
	data_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_jobs_ticket ON execution_jobs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics_events(created_at);
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
	return d.toISOString();
}

function fromIso(s: string | null | undefined): Date | undefined {
	return s ? new Date(s) : undefined;
}

function requireDate(s: string): Date {
	return new Date(s);
}

// ── Row types (raw DB rows) ───────────────────────────────────────────────────

interface ProjectRow {
	id: string;
	name: string;
	repo_path: string;
	default_branch: string;
	worktree_root: string;
	settings_json: string;
	created_at: string;
}

interface TicketRow {
	id: string;
	project_id: string;
	title: string;
	description: string;
	status: string;
	plan_type: string;
	plan: string | null;
	branch: string | null;
	worktree_path: string | null;
	error: string | null;
	metadata_json: string;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
}

interface JobRow {
	id: string;
	ticket_id: string;
	phase: string;
	status: string;
	worker_pid: number | null;
	log_path: string;
	exit_code: number | null;
	retry_count: number;
	started_at: string | null;
	completed_at: string | null;
}

interface AttachmentRow {
	id: string;
	ticket_id: string;
	filename: string;
	filepath: string;
	mime_type: string | null;
	created_at: string;
}

// ── Converters ────────────────────────────────────────────────────────────────

function rowToProject(row: ProjectRow): Project {
	return {
		id: row.id,
		name: row.name,
		repoPath: row.repo_path,
		defaultBranch: row.default_branch,
		worktreeRoot: row.worktree_root,
		createdAt: requireDate(row.created_at),
		settings: JSON.parse(row.settings_json) as ProjectSettings,
	};
}

function rowToTicket(row: TicketRow): Ticket {
	return {
		id: row.id,
		projectId: row.project_id,
		title: row.title,
		description: row.description,
		status: row.status as TicketStatus,
		planType: row.plan_type as PlanType,
		plan: row.plan ?? undefined,
		branch: row.branch ?? undefined,
		worktreePath: row.worktree_path ?? undefined,
		error: row.error ?? undefined,
		metadata: JSON.parse(row.metadata_json) as TicketMetadata,
		attachments: [],
		createdAt: requireDate(row.created_at),
		startedAt: fromIso(row.started_at),
		completedAt: fromIso(row.completed_at),
	};
}

function rowToJob(row: JobRow): ExecutionJob {
	return {
		id: row.id,
		ticketId: row.ticket_id,
		phase: row.phase as JobPhase,
		status: row.status as JobStatus,
		workerPid: row.worker_pid ?? undefined,
		logPath: row.log_path,
		exitCode: row.exit_code ?? undefined,
		retryCount: row.retry_count,
		startedAt: fromIso(row.started_at),
		completedAt: fromIso(row.completed_at),
	};
}

// ── ProjectStore ──────────────────────────────────────────────────────────────

export class ProjectStore {
	constructor(private readonly db: Database.Database) {}

	create(input: CreateProjectInput): Project {
		const project: Project = {
			id: randomUUID(),
			name: input.name,
			repoPath: input.repoPath,
			defaultBranch: input.defaultBranch ?? 'main',
			worktreeRoot: `${input.repoPath}/.worktrees`,
			createdAt: new Date(),
			settings: { ...defaultSettings(), ...input.settings },
		};

		this.db.prepare(`
			INSERT INTO projects (id, name, repo_path, default_branch, worktree_root, settings_json, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			project.id,
			project.name,
			project.repoPath,
			project.defaultBranch,
			project.worktreeRoot,
			JSON.stringify(project.settings),
			toIso(project.createdAt),
		);

		return project;
	}

	findById(id: string): Project | undefined {
		const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
		return row ? rowToProject(row) : undefined;
	}

	findAll(): Project[] {
		const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as ProjectRow[];
		return rows.map(rowToProject);
	}

	update(id: string, patch: Partial<Pick<Project, 'name' | 'defaultBranch' | 'worktreeRoot' | 'settings'>>): void {
		const existing = this.findById(id);
		if (!existing) {
			throw new Error(`Project not found: ${id}`);
		}
		const merged = { ...existing, ...patch };
		this.db.prepare(`
			UPDATE projects SET name = ?, default_branch = ?, worktree_root = ?, settings_json = ? WHERE id = ?
		`).run(merged.name, merged.defaultBranch, merged.worktreeRoot, JSON.stringify(merged.settings), id);
	}

	delete(id: string): void {
		this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
	}
}

// ── TicketStore ───────────────────────────────────────────────────────────────

export class TicketStore {
	constructor(private readonly db: Database.Database) {}

	create(input: CreateTicketInput): Ticket {
		const ticket: Ticket = {
			id: randomUUID(),
			projectId: input.projectId,
			title: input.title,
			description: input.description,
			status: 'backlog',
			planType: input.planType,
			attachments: [],
			metadata: {},
			createdAt: new Date(),
		};

		this.db.prepare(`
			INSERT INTO tickets
				(id, project_id, title, description, status, plan_type, metadata_json, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			ticket.id,
			ticket.projectId,
			ticket.title,
			ticket.description,
			ticket.status,
			ticket.planType,
			JSON.stringify(ticket.metadata),
			toIso(ticket.createdAt),
		);

		return ticket;
	}

	findById(id: string): Ticket | undefined {
		const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as TicketRow | undefined;
		if (!row) {
			return undefined;
		}
		const ticket = rowToTicket(row);
		ticket.attachments = this.getAttachments(id);
		return ticket;
	}

	findByProject(projectId: string): Ticket[] {
		const rows = this.db.prepare(
			'SELECT * FROM tickets WHERE project_id = ? ORDER BY created_at DESC'
		).all(projectId) as TicketRow[];
		return rows.map(row => {
			const t = rowToTicket(row);
			t.attachments = this.getAttachments(t.id);
			return t;
		});
	}

	findAll(): Ticket[] {
		const rows = this.db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all() as TicketRow[];
		return rows.map(row => {
			const t = rowToTicket(row);
			t.attachments = this.getAttachments(t.id);
			return t;
		});
	}

	updateStatus(id: string, status: TicketStatus, extra?: { startedAt?: Date; completedAt?: Date; error?: string }): void {
		this.db.prepare(`
			UPDATE tickets SET status = ?, started_at = COALESCE(?, started_at), completed_at = ?, error = ? WHERE id = ?
		`).run(
			status,
			extra?.startedAt ? toIso(extra.startedAt) : null,
			extra?.completedAt ? toIso(extra.completedAt) : null,
			extra?.error ?? null,
			id,
		);
	}

	updatePlan(id: string, plan: string): void {
		this.db.prepare('UPDATE tickets SET plan = ? WHERE id = ?').run(plan, id);
	}

	updateBranch(id: string, branch: string, worktreePath: string): void {
		this.db.prepare('UPDATE tickets SET branch = ?, worktree_path = ? WHERE id = ?')
			.run(branch, worktreePath, id);
	}

	setMetadata(id: string, metadata: TicketMetadata): void {
		this.db.prepare('UPDATE tickets SET metadata_json = ? WHERE id = ?')
			.run(JSON.stringify(metadata), id);
	}

	delete(id: string): void {
		this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
	}

	private getAttachments(ticketId: string): Attachment[] {
		const rows = this.db.prepare(
			'SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at ASC'
		).all(ticketId) as AttachmentRow[];
		return rows.map(r => ({
			id: r.id,
			ticketId: r.ticket_id,
			filename: r.filename,
			filepath: r.filepath,
			mimeType: r.mime_type ?? undefined,
			createdAt: requireDate(r.created_at),
		}));
	}

	addAttachment(ticketId: string, filename: string, filepath: string, mimeType?: string): Attachment {
		const attachment: Attachment = {
			id: randomUUID(),
			ticketId,
			filename,
			filepath,
			mimeType,
			createdAt: new Date(),
		};
		this.db.prepare(`
			INSERT INTO attachments (id, ticket_id, filename, filepath, mime_type, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(attachment.id, ticketId, filename, filepath, mimeType ?? null, toIso(attachment.createdAt));
		return attachment;
	}
}

// ── JobStore ──────────────────────────────────────────────────────────────────

export class JobStore {
	constructor(private readonly db: Database.Database) {}

	create(ticketId: string, phase: JobPhase, logPath: string): ExecutionJob {
		const job: ExecutionJob = {
			id: randomUUID(),
			ticketId,
			phase,
			status: 'pending',
			logPath,
			retryCount: 0,
		};
		this.db.prepare(`
			INSERT INTO execution_jobs (id, ticket_id, phase, status, log_path, retry_count)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(job.id, job.ticketId, job.phase, job.status, job.logPath, job.retryCount);
		return job;
	}

	findById(id: string): ExecutionJob | undefined {
		const row = this.db.prepare('SELECT * FROM execution_jobs WHERE id = ?').get(id) as JobRow | undefined;
		return row ? rowToJob(row) : undefined;
	}

	findByTicket(ticketId: string): ExecutionJob[] {
		const rows = this.db.prepare(
			'SELECT * FROM execution_jobs WHERE ticket_id = ? ORDER BY rowid ASC'
		).all(ticketId) as JobRow[];
		return rows.map(rowToJob);
	}

	updateStatus(id: string, status: JobStatus, extra?: { startedAt?: Date; completedAt?: Date; exitCode?: number; workerPid?: number }): void {
		this.db.prepare(`
			UPDATE execution_jobs
			SET status = ?, started_at = COALESCE(?, started_at), completed_at = ?, exit_code = ?, worker_pid = COALESCE(?, worker_pid)
			WHERE id = ?
		`).run(
			status,
			extra?.startedAt ? toIso(extra.startedAt) : null,
			extra?.completedAt ? toIso(extra.completedAt) : null,
			extra?.exitCode ?? null,
			extra?.workerPid ?? null,
			id,
		);
	}

	incrementRetry(id: string): void {
		this.db.prepare('UPDATE execution_jobs SET retry_count = retry_count + 1 WHERE id = ?').run(id);
	}
}

// ── AnalyticsStore ────────────────────────────────────────────────────────────

export class AnalyticsStore {
	constructor(private readonly db: Database.Database) {}

	record(eventType: string, data: Record<string, unknown>, ticketId?: string, projectId?: string): void {
		this.db.prepare(`
			INSERT INTO analytics_events (ticket_id, project_id, event_type, data_json, created_at)
			VALUES (?, ?, ?, ?, ?)
		`).run(ticketId ?? null, projectId ?? null, eventType, JSON.stringify(data), toIso(new Date()));
	}

	/**
	 * Returns the number of completed execution jobs per day for the last 7 days.
	 * Each entry represents one calendar day (in UTC), even if no jobs ran that day.
	 */
	getWeeklySummary(projectId?: string): DailyStat[] {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
		sevenDaysAgo.setUTCHours(0, 0, 0, 0);

		const projectClause = projectId ? 'AND t.project_id = ?' : '';
		const params: (string | number)[] = [sevenDaysAgo.toISOString()];
		if (projectId) { params.push(projectId); }

		const rows = this.db.prepare(`
			SELECT substr(j.completed_at, 1, 10) AS date, COUNT(*) AS count
			FROM execution_jobs j
			JOIN tickets t ON j.ticket_id = t.id
			WHERE j.phase = 'execute'
			  AND j.status = 'completed'
			  AND j.completed_at >= ?
			  ${projectClause}
			GROUP BY substr(j.completed_at, 1, 10)
			ORDER BY date ASC
		`).all(...params) as Array<{ date: string; count: number }>;

		// Fill in missing days with zero counts
		const byDate = new Map(rows.map(r => [r.date, r.count]));
		const result: DailyStat[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setUTCDate(d.getUTCDate() - i);
			const dateStr = d.toISOString().slice(0, 10);
			result.push({ date: dateStr, count: byDate.get(dateStr) ?? 0 });
		}
		return result;
	}

	/**
	 * Returns the fraction of execute jobs that completed successfully, as a value 0–1.
	 * Returns null if no jobs have run in the given window.
	 */
	getSuccessRate(projectId?: string, days = 30): number | null {
		const since = new Date();
		since.setUTCDate(since.getUTCDate() - days);

		const projectClause = projectId ? 'AND t.project_id = ?' : '';
		const params: (string | number)[] = [since.toISOString()];
		if (projectId) { params.push(projectId); }

		const row = this.db.prepare(`
			SELECT
				SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) AS completed,
				COUNT(*) AS total
			FROM execution_jobs j
			JOIN tickets t ON j.ticket_id = t.id
			WHERE j.phase = 'execute'
			  AND j.completed_at >= ?
			  ${projectClause}
		`).get(...params) as { completed: number; total: number } | undefined;

		if (!row || row.total === 0) {
			return null;
		}
		return row.completed / row.total;
	}

	/**
	 * Returns the mean execution duration in seconds for completed execute jobs.
	 * Returns null if no jobs have completed in the given window.
	 */
	getAverageDuration(projectId?: string, days = 30): number | null {
		const since = new Date();
		since.setUTCDate(since.getUTCDate() - days);

		const projectClause = projectId ? 'AND t.project_id = ?' : '';
		const params: (string | number)[] = [since.toISOString()];
		if (projectId) { params.push(projectId); }

		const row = this.db.prepare(`
			SELECT AVG(
				(julianday(j.completed_at) - julianday(j.started_at)) * 86400
			) AS avg_seconds
			FROM execution_jobs j
			JOIN tickets t ON j.ticket_id = t.id
			WHERE j.phase = 'execute'
			  AND j.status = 'completed'
			  AND j.started_at IS NOT NULL
			  AND j.completed_at >= ?
			  ${projectClause}
		`).get(...params) as { avg_seconds: number | null } | undefined;

		return row?.avg_seconds ?? null;
	}

	/**
	 * Returns the most recently completed tickets with execution metadata.
	 */
	getRecentJobs(projectId?: string, limit = 20): RecentJob[] {
		const projectClause = projectId ? 'AND t.project_id = ?' : '';
		const params: (string | number)[] = [];
		if (projectId) { params.push(projectId); }
		params.push(limit);

		const rows = this.db.prepare(`
			SELECT
				t.id AS ticket_id,
				t.title AS ticket_title,
				t.status,
				t.plan_type,
				t.completed_at,
				t.metadata_json,
				(julianday(j.completed_at) - julianday(j.started_at)) * 86400 AS duration_seconds
			FROM tickets t
			LEFT JOIN execution_jobs j ON j.ticket_id = t.id AND j.phase = 'execute'
			WHERE t.status IN ('completed', 'failed', 'merged')
			  ${projectClause}
			ORDER BY t.completed_at DESC
			LIMIT ?
		`).all(...params) as Array<{
			ticket_id: string;
			ticket_title: string;
			status: string;
			plan_type: string;
			completed_at: string | null;
			metadata_json: string;
			duration_seconds: number | null;
		}>;

		return rows.map(r => {
			const meta = JSON.parse(r.metadata_json) as { filesChanged?: string[]; testsPassed?: boolean; retryCount?: number };
			return {
				ticketId: r.ticket_id,
				ticketTitle: r.ticket_title,
				status: r.status,
				planType: r.plan_type,
				durationSeconds: r.duration_seconds,
				filesChanged: meta.filesChanged?.length ?? 0,
				testsPassed: meta.testsPassed ?? null,
				retryCount: meta.retryCount ?? 0,
				completedAt: r.completed_at ? new Date(r.completed_at) : null,
			};
		});
	}

	/** Returns the total number of tickets ever created. */
	getTotalJobCount(projectId?: string): number {
		const projectClause = projectId ? 'WHERE project_id = ?' : '';
		const params = projectId ? [projectId] : [];
		const row = this.db.prepare(`SELECT COUNT(*) AS n FROM tickets ${projectClause}`).get(...params) as { n: number };
		return row.n;
	}
}

// ── AutoDevDatabase ───────────────────────────────────────────────────────────

export class AutoDevDatabase {
	private readonly db: Database.Database;
	readonly projects: ProjectStore;
	readonly tickets: TicketStore;
	readonly jobs: JobStore;
	readonly analytics: AnalyticsStore;

	constructor(dbPath: string) {
		this.db = new Database(dbPath);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.runMigrations();
		this.projects = new ProjectStore(this.db);
		this.tickets = new TicketStore(this.db);
		this.jobs = new JobStore(this.db);
		this.analytics = new AnalyticsStore(this.db);
	}

	private runMigrations(): void {
		this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
		const versionRow = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
		const current = versionRow?.version ?? 0;

		if (current < SCHEMA_VERSION) {
			this.db.exec(SCHEMA_V1);
			if (current === 0) {
				this.db.prepare('INSERT INTO schema_version VALUES (?)').run(SCHEMA_VERSION);
			} else {
				this.db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
			}
		}
	}

	close(): void {
		this.db.close();
	}
}

function defaultSettings(): ProjectSettings {
	return {
		maxParallelJobs: 2,
		defaultPlanTemplate: 'simple_plan',
		autoExecuteAfterPlan: false,
	};
}
