/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { parseWorktreeList, parseChangeSummary } from '../../src/extension/services/gitManager';

/**
 * Creates a minimal git repository in a temp directory and returns its path.
 */
function createTempRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodev-git-test-'));
	execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
	execFileSync('git', ['config', 'user.email', 'test@autodev.local'], { cwd: dir });
	execFileSync('git', ['config', 'user.name', 'AutoDev Test'], { cwd: dir });
	fs.writeFileSync(path.join(dir, 'README.md'), '# test repo');
	execFileSync('git', ['add', '.'], { cwd: dir });
	execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: dir });
	return dir;
}

function removeTempRepo(dir: string): void {
	fs.rmSync(dir, { recursive: true, force: true });
}

suite('parseWorktreeList', () => {
	test('parses a single main worktree block', () => {
		const output = `worktree /home/user/my-app
HEAD abc1234567890
branch refs/heads/main

`;
		const result = parseWorktreeList(output);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].branch, 'main');
		assert.strictEqual(result[0].path, '/home/user/my-app');
		assert.strictEqual(result[0].isLocked, false);
	});

	test('parses multiple worktree blocks including a ticket worktree', () => {
		const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
		const output = `worktree /home/user/my-app
HEAD abc123
branch refs/heads/main

worktree /home/user/my-app/.worktrees/ticket-${uuid}
HEAD def456
branch refs/heads/autodev/ticket-${uuid}-add-dark-mode

`;
		const result = parseWorktreeList(output);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[1].ticketId, uuid);
		assert.ok(result[1].branch.includes('add-dark-mode'));
	});

	test('marks locked worktrees', () => {
		const output = `worktree /path/to/worktree
HEAD abc123
branch refs/heads/some-branch
locked reason: manually locked

`;
		const result = parseWorktreeList(output);
		assert.strictEqual(result[0].isLocked, true);
	});

	test('handles empty output', () => {
		assert.deepStrictEqual(parseWorktreeList(''), []);
	});
});

suite('parseChangeSummary', () => {
	test('parses insertions and deletions', () => {
		const stat = ' 3 files changed, 142 insertions(+), 12 deletions(-)\n';
		const nameStatus = 'M\tsrc/App.tsx\nA\tsrc/contexts/ThemeContext.tsx\nD\tsrc/old.ts\n';
		const result = parseChangeSummary(stat, nameStatus);
		assert.strictEqual(result.insertions, 142);
		assert.strictEqual(result.deletions, 12);
		assert.strictEqual(result.totalFiles, 3);
		assert.strictEqual(result.fileStats[0].status, 'modified');
		assert.strictEqual(result.fileStats[1].status, 'added');
		assert.strictEqual(result.fileStats[2].status, 'deleted');
	});

	test('handles stat with only insertions', () => {
		const stat = ' 1 file changed, 5 insertions(+)\n';
		const nameStatus = 'A\tnew-file.ts\n';
		const result = parseChangeSummary(stat, nameStatus);
		assert.strictEqual(result.insertions, 5);
		assert.strictEqual(result.deletions, 0);
	});

	test('handles empty diff output', () => {
		const result = parseChangeSummary('', '');
		assert.strictEqual(result.totalFiles, 0);
		assert.strictEqual(result.insertions, 0);
		assert.strictEqual(result.deletions, 0);
	});
});

suite('GitManager — live git operations', () => {
	let repoDir: string;

	setup(() => {
		repoDir = createTempRepo();
	});

	teardown(() => {
		removeTempRepo(repoDir);
	});

	test('checkGitVersion succeeds on installed git', async () => {
		const { GitManager } = await import('../../src/extension/services/gitManager');
		const gm = new GitManager(repoDir);
		const version = await gm.checkGitVersion();
		assert.ok(version.includes('git version'), version);
	});

	test('createWorktree creates a directory on a new branch', async () => {
		const { GitManager } = await import('../../src/extension/services/gitManager');
		const gm = new GitManager(repoDir);

		const worktreeRoot = path.join(repoDir, '.worktrees');
		const ticketId = 'test-ticket-id-123';
		const worktreePath = await gm.createWorktree(worktreeRoot, ticketId, 'test-feature', 'main', 'autodev/');

		assert.ok(fs.existsSync(worktreePath), `worktree dir should exist: ${worktreePath}`);

		// Calling createWorktree again with the same id should be idempotent
		const worktreePath2 = await gm.createWorktree(worktreeRoot, ticketId, 'test-feature', 'main', 'autodev/');
		assert.strictEqual(worktreePath, worktreePath2);
	});

	test('removeWorktree deletes the worktree', async () => {
		const { GitManager } = await import('../../src/extension/services/gitManager');
		const gm = new GitManager(repoDir);

		const worktreeRoot = path.join(repoDir, '.worktrees');
		const worktreePath = await gm.createWorktree(worktreeRoot, 'to-remove', 'to-remove', 'main', 'autodev/');
		assert.ok(fs.existsSync(worktreePath));

		await gm.removeWorktree(worktreePath);
		assert.ok(!fs.existsSync(worktreePath));
	});
});
