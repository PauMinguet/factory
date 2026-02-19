/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TicketStatus =
	| 'backlog'       // Created, not started
	| 'planning'      // Generating plan/PRD
	| 'plan_review'   // Plan ready for human review
	| 'queued'        // Approved, waiting for a worker slot
	| 'in_progress'   // Claude Code is executing
	| 'testing'       // Running test/validation commands
	| 'completed'     // Done — branch ready for review
	| 'failed'        // Execution failed
	| 'merged';       // Branch merged to the default branch

export type PlanType =
	| 'prd'           // Full Product Requirements Document
	| 'simple_plan'   // Lightweight plan
	| 'analysis'      // Codebase analysis (no code written)
	| 'bug_fix'       // Bug investigation + fix
	| 'test'          // Write tests for existing code
	| 'direct'        // Skip planning, execute immediately
	| 'refactor';     // Code improvement / cleanup

export interface TicketMetadata {
	tokensUsed?: number;
	costEstimate?: number;
	filesChanged?: string[];
	testsWritten?: number;
	testsPassed?: boolean;
	commitSha?: string;
	retryCount?: number;
}

export interface Attachment {
	id: string;
	ticketId: string;
	filename: string;
	filepath: string;
	mimeType?: string;
	createdAt: Date;
}

export interface Ticket {
	/** UUID */
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: TicketStatus;
	planType: PlanType;
	/** Generated plan / PRD markdown, set after the plan phase */
	plan?: string;
	/** Git branch name, e.g. "autodev/ticket-abc123-dark-mode" */
	branch?: string;
	/** Absolute path to the git worktree */
	worktreePath?: string;
	attachments: Attachment[];
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	/** Human-readable error summary if status === 'failed' */
	error?: string;
	metadata: TicketMetadata;
}

export interface CreateTicketInput {
	projectId: string;
	title: string;
	description: string;
	planType: PlanType;
	/** Optional action to take immediately after creation */
	afterAction?: 'plan' | 'execute';
}
