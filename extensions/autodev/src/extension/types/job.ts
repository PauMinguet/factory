/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type JobPhase = 'plan' | 'execute' | 'fix';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExecutionJob {
	/** UUID */
	id: string;
	ticketId: string;
	phase: JobPhase;
	status: JobStatus;
	/** PID of the spawned Claude Code process, set when running */
	workerPid?: number;
	startedAt?: Date;
	completedAt?: Date;
	exitCode?: number;
	/** Absolute path to the streaming log file */
	logPath: string;
	/** Number of test-fix retry cycles attempted (execute phase) */
	retryCount: number;
}
