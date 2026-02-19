/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import type { ChangeSummary, WorktreeInfo } from '../types';

const execFileAsync = promisify(execFile);

/**
 * All git operations needed by AutoDev, scoped to a single repository.
 * Methods throw on failure with the git stderr as the error message.
 */
export class GitManager {
	constructor(private readonly repoPath: string) {}

	// ── Worktree management ────────────────────────────────────────────────────

	/**
	 * Creates an isolated git worktree for a ticket on a new branch.
	 * Returns the absolute path to the created worktree.
	 *
	 * Equivalent to:
	 *   git worktree add <worktreeRoot>/ticket-<ticketId> -b <branch> <defaultBranch>
	 */
	async createWorktree(worktreeRoot: string, ticketId: string, slug: string, defaultBranch: string, branchPrefix: string): Promise<string> {
		const branch = `${branchPrefix}ticket-${ticketId}-${slug}`;
		const worktreePath = path.join(worktreeRoot, `ticket-${ticketId}`);

		// Ensure the worktree root exists
		fs.mkdirSync(worktreeRoot, { recursive: true });

		// If the worktree already exists (e.g. from a previous crashed run), reuse it
		if (fs.existsSync(worktreePath)) {
			return worktreePath;
		}

		await this.git('worktree', 'add', worktreePath, '-b', branch, defaultBranch);
		return worktreePath;
	}

	/**
	 * Removes a git worktree and deletes its directory.
	 */
	async removeWorktree(worktreePath: string): Promise<void> {
		await this.git('worktree', 'remove', '--force', worktreePath);
	}

	/**
	 * Lists all worktrees for this repository.
	 */
	async listWorktrees(): Promise<WorktreeInfo[]> {
		const { stdout } = await this.git('worktree', 'list', '--porcelain');
		return parseWorktreeList(stdout);
	}

	// ── Diff and summary ──────────────────────────────────────────────────────

	/**
	 * Returns a summary of all changes committed in the worktree relative to the
	 * default branch origin.
	 */
	async getChangeSummary(worktreePath: string): Promise<ChangeSummary> {
		// Get the merge-base so we only show changes introduced by this branch
		const { stdout: base } = await execFileAsync('git', ['merge-base', 'HEAD', 'origin/HEAD'], { cwd: worktreePath });
		const mergeBase = base.trim();

		const { stdout: stat } = await execFileAsync('git', ['diff', '--stat', `${mergeBase}..HEAD`], { cwd: worktreePath });
		const { stdout: nameStatus } = await execFileAsync('git', ['diff', '--name-status', `${mergeBase}..HEAD`], { cwd: worktreePath });

		return parseChangeSummary(stat, nameStatus);
	}

	// ── Branch operations ─────────────────────────────────────────────────────

	/**
	 * Ensures the worktree has at least one commit (required before creating a PR).
	 * If there are unstaged changes, stages and commits them.
	 */
	async prepareBranch(worktreePath: string, message = 'autodev: final commit'): Promise<void> {
		const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: worktreePath });
		if (status.trim() !== '') {
			await execFileAsync('git', ['add', '-A'], { cwd: worktreePath });
			await execFileAsync('git', ['commit', '-m', message], { cwd: worktreePath });
		}
	}

	/**
	 * Merges the ticket branch into the default branch using --no-ff.
	 */
	async mergeBranch(branch: string, defaultBranch: string): Promise<void> {
		await this.git('checkout', defaultBranch);
		await this.git('merge', '--no-ff', branch, '-m', `Merge ${branch} into ${defaultBranch}`);
	}

	/**
	 * Returns the current git version string.
	 * Throws if git is not found or the version is below 2.5.
	 */
	async checkGitVersion(): Promise<string> {
		const { stdout } = await execFileAsync('git', ['--version']);
		const version = stdout.trim();
		const match = version.match(/(\d+)\.(\d+)/);
		if (match) {
			const [, major, minor] = match;
			if (parseInt(major) < 2 || (parseInt(major) === 2 && parseInt(minor) < 5)) {
				throw new Error(`git worktree requires git 2.5+. Found: ${version}`);
			}
		}
		return version;
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private async git(...args: string[]): Promise<{ stdout: string; stderr: string }> {
		return execFileAsync('git', args, { cwd: this.repoPath });
	}
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parses `git worktree list --porcelain` output.
 *
 * Example block:
 *   worktree /path/to/worktree
 *   HEAD abc123
 *   branch refs/heads/autodev/ticket-xxx-slug
 */
export function parseWorktreeList(output: string): WorktreeInfo[] {
	const results: WorktreeInfo[] = [];
	const blocks = output.trim().split(/\n\n+/);

	for (const block of blocks) {
		if (!block.trim()) {
			continue;
		}
		const lines = block.split('\n');
		const wPath = lines.find(l => l.startsWith('worktree '))?.slice('worktree '.length) ?? '';
		const branchLine = lines.find(l => l.startsWith('branch '));
		const branch = branchLine ? branchLine.replace('refs/heads/', '').slice('branch '.length) : '(detached)';
		const isLocked = lines.some(l => l.startsWith('locked'));

		// Extract ticketId from the worktree directory name: ticket-{id}
		const dirName = path.basename(wPath);
		const ticketMatch = dirName.match(/^ticket-([a-f0-9-]{36})$/);

		results.push({
			path: wPath,
			branch,
			ticketId: ticketMatch?.[1],
			isLocked,
		});
	}

	return results;
}

/**
 * Parses `git diff --stat` and `git diff --name-status` output into a ChangeSummary.
 */
export function parseChangeSummary(stat: string, nameStatus: string): ChangeSummary {
	// Parse insertions/deletions from stat summary line, e.g.:
	// " 3 files changed, 142 insertions(+), 12 deletions(-)"
	let insertions = 0;
	let deletions = 0;
	const summaryMatch = stat.match(/(\d+) insertion[s]?\(\+\)/);
	const deletionMatch = stat.match(/(\d+) deletion[s]?\(-\)/);
	if (summaryMatch) { insertions = parseInt(summaryMatch[1]); }
	if (deletionMatch) { deletions = parseInt(deletionMatch[1]); }

	// Parse file stats from name-status lines, e.g.:
	// M	src/App.tsx
	// A	src/contexts/ThemeContext.tsx
	// D	src/old.ts
	const fileStats = nameStatus.trim().split('\n').filter(Boolean).map(line => {
		const parts = line.split('\t');
		const statusChar = parts[0]?.trim() ?? 'M';
		const filePath = parts[1] ?? '';

		let status: ChangeSummary['fileStats'][0]['status'] = 'modified';
		if (statusChar.startsWith('A')) { status = 'added'; }
		else if (statusChar.startsWith('D')) { status = 'deleted'; }
		else if (statusChar.startsWith('R')) { status = 'renamed'; }

		return { path: filePath, insertions: 0, deletions: 0, status };
	});

	return { totalFiles: fileStats.length, insertions, deletions, fileStats };
}
