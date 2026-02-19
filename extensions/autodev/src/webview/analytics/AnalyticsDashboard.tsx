/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { postMessage } from '../shared/useVSCodeApi';
import type { AnalyticsData, DailyStat, RecentJob } from '../../extension/types/analytics';
import type { Project } from '../../extension/types/project';
import type { ExtensionMessage } from '../../extension/types/messages';

interface DashboardState {
	data: AnalyticsData | null;
	projects: Project[];
	selectedProjectId: string | null;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }): React.ReactElement {
	return (
		<div className="stat-card">
			<div className="stat-card__value">{value}</div>
			<div className="stat-card__label">{label}</div>
			{sub && <div className="stat-card__sub">{sub}</div>}
		</div>
	);
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: DailyStat[] }): React.ReactElement {
	const maxCount = Math.max(...data.map(d => d.count), 1);

	return (
		<div className="bar-chart">
			{data.map(d => {
				const heightPct = (d.count / maxCount) * 100;
				const dayLabel = new Date(d.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' });
				return (
					<div key={d.date} className="bar-chart__col">
						<div className="bar-chart__bar-wrap">
							<div
								className="bar-chart__bar"
								style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%` }}
								title={`${d.date}: ${d.count} job${d.count !== 1 ? 's' : ''}`}
							/>
						</div>
						<div className="bar-chart__count">{d.count > 0 ? d.count : ''}</div>
						<div className="bar-chart__label">{dayLabel}</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Recent Jobs Table ─────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
	completed: '✅',
	failed: '❌',
	merged: '🔀',
};

function formatDuration(secs: number | null): string {
	if (secs === null) { return '—'; }
	if (secs < 60) { return `${Math.round(secs)}s`; }
	return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}

function RecentJobsTable({ jobs }: { jobs: RecentJob[] }): React.ReactElement {
	if (jobs.length === 0) {
		return <p className="empty-jobs">No completed jobs yet.</p>;
	}

	return (
		<table className="jobs-table">
			<thead>
				<tr>
					<th>Status</th>
					<th>Ticket</th>
					<th>Type</th>
					<th>Duration</th>
					<th>Files</th>
					<th>Tests</th>
					<th>Retries</th>
				</tr>
			</thead>
			<tbody>
				{jobs.map(job => (
					<tr key={job.ticketId} className={`jobs-table__row jobs-table__row--${job.status}`}>
						<td className="jobs-table__status">
							{STATUS_ICONS[job.status] ?? job.status}
						</td>
						<td className="jobs-table__title" title={job.ticketTitle}>
							{job.ticketTitle}
						</td>
						<td>{job.planType.replace('_', ' ')}</td>
						<td>{formatDuration(job.durationSeconds)}</td>
						<td>{job.filesChanged > 0 ? job.filesChanged : '—'}</td>
						<td>
							{job.testsPassed === null ? '—' : job.testsPassed ? '✅' : '❌'}
						</td>
						<td>{job.retryCount > 0 ? job.retryCount : '—'}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function AnalyticsDashboard(): React.ReactElement {
	const [state, setState] = useState<DashboardState>({
		data: null,
		projects: [],
		selectedProjectId: null,
	});

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const msg = event.data as ExtensionMessage;
			if (msg.type === 'analytics:data') {
				setState({
					data: msg.data,
					projects: msg.projects,
					selectedProjectId: msg.selectedProjectId,
				});
			}
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, []);

	const handleProjectChange = useCallback((projectId: string) => {
		const id = projectId || undefined;
		setState(prev => ({ ...prev, selectedProjectId: projectId || null }));
		postMessage({ type: 'analytics:refresh', projectId: id });
	}, []);

	const handleRefresh = useCallback(() => {
		postMessage({ type: 'analytics:refresh', projectId: state.selectedProjectId ?? undefined });
	}, [state.selectedProjectId]);

	const { data, projects, selectedProjectId } = state;

	const successPct = data?.successRate !== null && data?.successRate !== undefined
		? `${Math.round(data.successRate * 100)}%`
		: '—';

	return (
		<div className="analytics-dashboard">
			<div className="analytics-header">
				<div className="analytics-title">
					<span className="analytics-logo">📊</span>
					<span>AutoDev Analytics</span>
				</div>
				<div className="analytics-controls">
					<select
						className="project-filter"
						value={selectedProjectId ?? ''}
						onChange={e => handleProjectChange(e.target.value)}
					>
						<option value="">All Projects</option>
						{projects.map(p => (
							<option key={p.id} value={p.id}>{p.name}</option>
						))}
					</select>
					<button className="refresh-btn" onClick={handleRefresh}>↻ Refresh</button>
				</div>
			</div>

			{data === null ? (
				<div className="loading">Loading analytics…</div>
			) : (
				<div className="analytics-body">
					{/* Summary Stats */}
					<section className="section">
						<div className="stats-grid">
							<StatCard label="Total Jobs" value={String(data.totalJobs)} />
							<StatCard label="Success Rate" value={successPct} sub="last 30 days" />
							<StatCard
								label="Avg Duration"
								value={formatDuration(data.avgDurationSeconds)}
								sub="last 30 days"
							/>
							<StatCard
								label="Jobs This Week"
								value={String(data.weeklySummary.reduce((s, d) => s + d.count, 0))}
							/>
						</div>
					</section>

					{/* 7-day bar chart */}
					<section className="section">
						<h2 className="section-title">Executions — Last 7 Days</h2>
						<BarChart data={data.weeklySummary} />
					</section>

					{/* Recent executions */}
					<section className="section">
						<h2 className="section-title">Recent Executions</h2>
						<RecentJobsTable jobs={data.recentJobs} />
					</section>
				</div>
			)}
		</div>
	);
}
