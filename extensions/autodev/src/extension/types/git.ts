/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ChangeSummary {
	/** Total number of files modified, added, or deleted */
	totalFiles: number;
	insertions: number;
	deletions: number;
	fileStats: FileChangeStat[];
}

export interface FileChangeStat {
	/** Repo-relative path */
	path: string;
	insertions: number;
	deletions: number;
	status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface WorktreeInfo {
	/** Absolute path to the worktree directory */
	path: string;
	/** Branch checked out in this worktree */
	branch: string;
	/** Extracted from the worktree directory name if it follows the autodev/ convention */
	ticketId?: string;
	isLocked: boolean;
}

export interface JobStats {
	totalLogLines: number;
	filesModified: number;
	testResult?: 'pass' | 'fail';
	exitCode: number;
}
