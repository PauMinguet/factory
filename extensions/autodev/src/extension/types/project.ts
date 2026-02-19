/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Project {
	/** UUID */
	id: string;
	/** Human-readable name, e.g. "My SaaS App" */
	name: string;
	/** Absolute path to the git repository root */
	repoPath: string;
	/** Default branch to base new worktrees on, e.g. "main" */
	defaultBranch: string;
	/** Absolute path to the worktrees container directory */
	worktreeRoot: string;
	createdAt: Date;
	settings: ProjectSettings;
}

export interface ProjectSettings {
	/** Maximum concurrent Claude Code sessions for this project */
	maxParallelJobs: number;
	/** Template ID to use when none is specified */
	defaultPlanTemplate: string;
	/** Skip the plan-review step and execute immediately after planning */
	autoExecuteAfterPlan: boolean;
	/** Shell command to run tests, e.g. "npm test" */
	testCommand?: string;
	/** Shell command to build the project, e.g. "npm run build" */
	buildCommand?: string;
	/** Shell command to run the linter, e.g. "npm run lint" */
	lintCommand?: string;
	/** Override path to the claude CLI binary */
	claudeCodePath?: string;
	/** Glob patterns for files to always include in Claude's context */
	contextFiles?: string[];
}

export interface CreateProjectInput {
	name: string;
	repoPath: string;
	defaultBranch?: string;
	settings?: Partial<ProjectSettings>;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	maxParallelJobs: 2,
	defaultPlanTemplate: 'simple_plan',
	autoExecuteAfterPlan: false,
};
