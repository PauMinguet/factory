/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Job count for a single calendar day. */
export interface DailyStat {
	/** ISO date string, e.g. "2026-02-18" */
	date: string;
	count: number;
}

/** Summary of a completed (or failed) ticket execution. */
export interface RecentJob {
	ticketId: string;
	ticketTitle: string;
	status: string;
	planType: string;
	/** Duration in seconds, or null if timing data is unavailable */
	durationSeconds: number | null;
	filesChanged: number;
	testsPassed: boolean | null;
	retryCount: number;
	completedAt: Date | null;
}

/** Full analytics payload sent to the dashboard webview. */
export interface AnalyticsData {
	weeklySummary: DailyStat[];
	successRate: number | null;
	avgDurationSeconds: number | null;
	totalJobs: number;
	recentJobs: RecentJob[];
}
