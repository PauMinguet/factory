/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import type { Ticket } from '../../extension/types/ticket';

interface ChangesSummaryProps {
	ticket: Ticket;
	onOpenDiff(): void;
	onCheckout(): void;
}

const STATUS_ICONS: Record<string, string> = {
	added: '＋',
	modified: '⟳',
	deleted: '−',
	renamed: '➜',
};

export function ChangesSummary({ ticket, onOpenDiff, onCheckout }: ChangesSummaryProps): React.ReactElement {
	const filesChanged = ticket.metadata.filesChanged;
	const hasChanges = filesChanged && filesChanged.length > 0;

	if (ticket.status === 'backlog' || ticket.status === 'planning' || ticket.status === 'queued') {
		return (
			<div className="td-tab-pane td-changes-empty">
				<p>Changes will appear here once the job completes.</p>
			</div>
		);
	}

	if (!hasChanges) {
		return (
			<div className="td-tab-pane td-changes-empty">
				<p>No file changes recorded.</p>
				{ticket.branch && (
					<div className="td-changes-actions">
						<button className="td-btn" onClick={onOpenDiff}>
							🔍 View Diff in Terminal
						</button>
						<button className="td-btn" onClick={onCheckout}>
							⎇ Checkout Branch
						</button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="td-tab-pane td-changes">
			<div className="td-changes-summary-bar">
				<span className="td-changes-count">
					{filesChanged.length} file{filesChanged.length !== 1 ? 's' : ''} changed
				</span>
				<div className="td-changes-actions">
					<button className="td-btn" onClick={onOpenDiff}>
						🔍 View Diff
					</button>
					<button className="td-btn" onClick={onCheckout}>
						⎇ Checkout Branch
					</button>
				</div>
			</div>
			<ul className="td-changes-list">
				{filesChanged.map((filePath, i) => {
					// filesChanged is string[] from metadata — just show paths
					const parts = filePath.split('/');
					const filename = parts[parts.length - 1];
					const dir = parts.slice(0, -1).join('/');
					return (
						<li key={i} className="td-changes-file">
							<span className="td-changes-status-icon" title="modified">
								{STATUS_ICONS['modified']}
							</span>
							<span className="td-changes-filepath">
								{dir && <span className="td-changes-dir">{dir}/</span>}
								<span className="td-changes-filename">{filename}</span>
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
