/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { AutoDevDatabase } from '../services/database';
import type { Orchestrator } from '../services/orchestrator';

/**
 * Manages the AutoDev status bar item.
 * Displays the number of running, queued, and completed tickets.
 * Clicking the item opens the "Show Running Jobs" quick-pick.
 */
export class StatusBarProvider {
	private readonly item: vscode.StatusBarItem;

	constructor(
		private readonly db: AutoDevDatabase,
		private readonly orchestrator: Orchestrator,
		context: vscode.ExtensionContext,
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.command = 'autodev.showRunningJobs';
		this.item.tooltip = 'AutoDev Studio — click to see running jobs';
		context.subscriptions.push(this.item);

		// Update on every orchestrator status change
		this.orchestrator.on('ticket:status', () => this.update());
		this.orchestrator.on('job:completed', () => this.update());
		this.orchestrator.on('job:failed', () => this.update());

		this.update();
		this.item.show();
	}

	/** Refreshes the status bar text from the current DB state. */
	update(): void {
		const tickets = this.db.tickets.findAll();
		const running = tickets.filter(
			t => t.status === 'in_progress' || t.status === 'planning' || t.status === 'testing'
		).length;
		const queued = tickets.filter(t => t.status === 'queued').length;
		const completed = tickets.filter(t => t.status === 'completed').length;

		const parts: string[] = ['🤖 AutoDev'];
		if (running > 0) {
			parts.push(`🔄 ${running} running`);
		}
		if (queued > 0) {
			parts.push(`⏳ ${queued} queued`);
		}
		if (completed > 0) {
			parts.push(`✅ ${completed} done`);
		}

		this.item.text = parts.join(' │ ');
	}
}
