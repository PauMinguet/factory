/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AutoDevDatabase } from '../../src/extension/services/database';

/**
 * Unit tests for the AutoDevDatabase stores.
 * Uses an in-memory SQLite database so no file system setup is needed.
 *
 * Run with: npm test (requires better-sqlite3 native module to be built)
 */
suite('AutoDevDatabase', () => {
	let db: AutoDevDatabase;

	setup(() => {
		db = new AutoDevDatabase(':memory:');
	});

	teardown(() => {
		db.close();
	});

	// ── ProjectStore ──────────────────────────────────────────────────────────

	suite('ProjectStore', () => {
		test('creates and retrieves a project', () => {
			const project = db.projects.create({ name: 'My App', repoPath: '/tmp/my-app' });
			assert.strictEqual(project.name, 'My App');
			assert.strictEqual(project.repoPath, '/tmp/my-app');
			assert.strictEqual(project.defaultBranch, 'main');
			assert.ok(project.id);

			const found = db.projects.findById(project.id);
			assert.deepStrictEqual(found, project);
		});

		test('findAll returns all projects ordered by createdAt', () => {
			db.projects.create({ name: 'A', repoPath: '/a' });
			db.projects.create({ name: 'B', repoPath: '/b' });
			const all = db.projects.findAll();
			assert.strictEqual(all.length, 2);
			assert.strictEqual(all[0].name, 'A');
			assert.strictEqual(all[1].name, 'B');
		});

		test('findById returns undefined for unknown id', () => {
			assert.strictEqual(db.projects.findById('no-such-id'), undefined);
		});

		test('update changes project fields', () => {
			const p = db.projects.create({ name: 'Old', repoPath: '/old' });
			db.projects.update(p.id, { name: 'New' });
			const updated = db.projects.findById(p.id)!;
			assert.strictEqual(updated.name, 'New');
			assert.strictEqual(updated.repoPath, '/old'); // unchanged
		});

		test('delete removes the project', () => {
			const p = db.projects.create({ name: 'Del', repoPath: '/del' });
			db.projects.delete(p.id);
			assert.strictEqual(db.projects.findById(p.id), undefined);
		});

		test('settings are persisted and restored as JSON', () => {
			const p = db.projects.create({
				name: 'App',
				repoPath: '/app',
				settings: { maxParallelJobs: 3, defaultPlanTemplate: 'prd', autoExecuteAfterPlan: true, testCommand: 'vitest' },
			});
			const found = db.projects.findById(p.id)!;
			assert.deepStrictEqual(found.settings, {
				maxParallelJobs: 3,
				defaultPlanTemplate: 'prd',
				autoExecuteAfterPlan: true,
				testCommand: 'vitest',
			});
		});
	});

	// ── TicketStore ───────────────────────────────────────────────────────────

	suite('TicketStore', () => {
		let projectId: string;

		setup(() => {
			const p = db.projects.create({ name: 'P', repoPath: '/p' });
			projectId = p.id;
		});

		test('creates a ticket with backlog status', () => {
			const ticket = db.tickets.create({
				projectId,
				title: 'Add dark mode',
				description: 'Support dark mode',
				planType: 'simple_plan',
			});
			assert.strictEqual(ticket.status, 'backlog');
			assert.strictEqual(ticket.planType, 'simple_plan');
			assert.deepStrictEqual(ticket.attachments, []);
		});

		test('findByProject returns tickets for the correct project only', () => {
			const p2 = db.projects.create({ name: 'P2', repoPath: '/p2' });
			db.tickets.create({ projectId, title: 'T1', description: '', planType: 'direct' });
			db.tickets.create({ projectId: p2.id, title: 'T2', description: '', planType: 'direct' });

			const tickets = db.tickets.findByProject(projectId);
			assert.strictEqual(tickets.length, 1);
			assert.strictEqual(tickets[0].title, 'T1');
		});

		test('updateStatus changes status and timestamps', () => {
			const t = db.tickets.create({ projectId, title: 'T', description: '', planType: 'direct' });
			const now = new Date();
			db.tickets.updateStatus(t.id, 'in_progress', { startedAt: now });
			const updated = db.tickets.findById(t.id)!;
			assert.strictEqual(updated.status, 'in_progress');
			assert.ok(updated.startedAt);
		});

		test('updatePlan saves plan text', () => {
			const t = db.tickets.create({ projectId, title: 'T', description: '', planType: 'prd' });
			db.tickets.updatePlan(t.id, '## Plan\n1. Do thing');
			const updated = db.tickets.findById(t.id)!;
			assert.strictEqual(updated.plan, '## Plan\n1. Do thing');
		});

		test('setMetadata round-trips JSON correctly', () => {
			const t = db.tickets.create({ projectId, title: 'T', description: '', planType: 'direct' });
			db.tickets.setMetadata(t.id, { filesChanged: ['a.ts', 'b.ts'], testsPassed: true, retryCount: 1 });
			const updated = db.tickets.findById(t.id)!;
			assert.deepStrictEqual(updated.metadata, { filesChanged: ['a.ts', 'b.ts'], testsPassed: true, retryCount: 1 });
		});

		test('delete cascades to related jobs', () => {
			const t = db.tickets.create({ projectId, title: 'T', description: '', planType: 'direct' });
			db.jobs.create(t.id, 'execute', '/tmp/log.txt');
			db.tickets.delete(t.id);
			assert.strictEqual(db.tickets.findById(t.id), undefined);
			assert.deepStrictEqual(db.jobs.findByTicket(t.id), []);
		});
	});

	// ── JobStore ──────────────────────────────────────────────────────────────

	suite('JobStore', () => {
		let ticketId: string;

		setup(() => {
			const p = db.projects.create({ name: 'P', repoPath: '/p' });
			const t = db.tickets.create({ projectId: p.id, title: 'T', description: '', planType: 'direct' });
			ticketId = t.id;
		});

		test('creates a job in pending state', () => {
			const job = db.jobs.create(ticketId, 'plan', '/logs/job.log');
			assert.strictEqual(job.phase, 'plan');
			assert.strictEqual(job.status, 'pending');
			assert.strictEqual(job.retryCount, 0);
		});

		test('updateStatus marks job as running with pid', () => {
			const job = db.jobs.create(ticketId, 'execute', '/logs/job.log');
			const now = new Date();
			db.jobs.updateStatus(job.id, 'running', { startedAt: now, workerPid: 1234 });
			const updated = db.jobs.findById(job.id)!;
			assert.strictEqual(updated.status, 'running');
			assert.strictEqual(updated.workerPid, 1234);
		});

		test('incrementRetry increases retryCount', () => {
			const job = db.jobs.create(ticketId, 'execute', '/logs/job.log');
			db.jobs.incrementRetry(job.id);
			db.jobs.incrementRetry(job.id);
			const updated = db.jobs.findById(job.id)!;
			assert.strictEqual(updated.retryCount, 2);
		});

		test('findByTicket returns all jobs for a ticket in order', () => {
			db.jobs.create(ticketId, 'plan', '/logs/plan.log');
			db.jobs.create(ticketId, 'execute', '/logs/exec.log');
			const jobs = db.jobs.findByTicket(ticketId);
			assert.strictEqual(jobs.length, 2);
			assert.strictEqual(jobs[0].phase, 'plan');
			assert.strictEqual(jobs[1].phase, 'execute');
		});
	});
});
