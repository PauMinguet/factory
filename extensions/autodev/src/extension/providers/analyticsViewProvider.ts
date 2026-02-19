/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { AutoDevDatabase } from '../services/database';
import type { WebviewMessage, AnalyticsData } from '../types';

/**
 * Manages the Analytics Dashboard webview panel.
 * Opens as an editor tab and displays execution statistics with charts.
 */
export class AnalyticsViewProvider {
	private panel: vscode.WebviewPanel | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly db: AutoDevDatabase,
	) {}

	/** Opens the analytics panel, or focuses it if already open. */
	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			this.sendData();
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'autodev.analytics',
			'AutoDev Analytics',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
				],
			},
		);

		this.panel.webview.html = this.buildHtml(this.panel.webview);
		this.sendData();

		this.panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => {
				if (msg.type === 'analytics:refresh') {
					this.sendData(msg.projectId ?? undefined);
				}
			},
			undefined,
			this.context.subscriptions,
		);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		}, undefined, this.context.subscriptions);
	}

	/** Sends fresh analytics data to the webview. */
	sendData(projectId?: string): void {
		if (!this.panel) {
			return;
		}

		const projects = this.db.projects.findAll();
		const data: AnalyticsData = {
			weeklySummary: this.db.analytics.getWeeklySummary(projectId),
			successRate: this.db.analytics.getSuccessRate(projectId),
			avgDurationSeconds: this.db.analytics.getAverageDuration(projectId),
			totalJobs: this.db.analytics.getTotalJobCount(projectId),
			recentJobs: this.db.analytics.getRecentJobs(projectId, 20),
		};

		this.panel.webview.postMessage({ type: 'analytics:data', data, projects, selectedProjectId: projectId ?? null });
	}

	private buildHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('hex');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'analytics.js'),
		);
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'analytics.css'),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
	<link rel="stylesheet" href="${cssUri}">
	<title>AutoDev Analytics</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
