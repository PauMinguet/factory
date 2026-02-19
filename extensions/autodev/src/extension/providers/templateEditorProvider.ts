/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { WebviewMessage } from '../types/messages';

const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
	'simple-plan': 'Simple Plan',
	'prd': 'Product Requirements Document',
	'bug-fix': 'Bug Fix',
	'test-gen': 'Test Generation',
	'analysis': 'Codebase Analysis',
	'direct-execute': 'Direct Execute',
	'refactor': 'Refactor',
};

/**
 * Manages the Template Editor webview panel.
 * Allows users to edit, preview, and reset prompt templates.
 */
export class TemplateEditorProvider {
	private panel: vscode.WebviewPanel | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly templatesDir: string,
		private readonly bundledTemplatesDir: string,
	) {}

	/** Opens or focuses the template editor panel. */
	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'autodev.templateEditor',
			'AutoDev — Template Editor',
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

		this.panel.webview.onDidReceiveMessage(
			(msg: WebviewMessage) => void this.handleMessage(msg),
			undefined,
			this.context.subscriptions,
		);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		}, undefined, this.context.subscriptions);

		// Send initial template list
		this.sendTemplateList();
	}

	// ── Message handlers ──────────────────────────────────────────────────────

	private async handleMessage(msg: WebviewMessage): Promise<void> {
		switch (msg.type) {
			case 'template:load':
				this.sendTemplateContent(msg.name);
				break;
			case 'template:save':
				this.saveTemplate(msg.name, msg.content);
				break;
			case 'template:reset':
				this.resetTemplate(msg.name);
				break;
			default:
				break;
		}
	}

	private sendTemplateList(): void {
		const templates = this.loadAllTemplates();
		this.panel?.webview.postMessage({ type: 'templates:init', templates });
	}

	private sendTemplateContent(name: string): void {
		const filePath = path.join(this.templatesDir, `${name}.md`);
		if (!fs.existsSync(filePath)) {
			return;
		}
		const content = fs.readFileSync(filePath, 'utf-8');
		this.panel?.webview.postMessage({ type: 'template:loaded', name, content });
	}

	private saveTemplate(name: string, content: string): void {
		const filePath = path.join(this.templatesDir, `${name}.md`);
		fs.mkdirSync(this.templatesDir, { recursive: true });
		fs.writeFileSync(filePath, content, 'utf-8');
		this.panel?.webview.postMessage({ type: 'template:saved', name });
		vscode.window.showInformationMessage(`AutoDev: Template "${TEMPLATE_DISPLAY_NAMES[name] ?? name}" saved.`);
	}

	private resetTemplate(name: string): void {
		const bundledPath = path.join(this.bundledTemplatesDir, `${name}.md`);
		const userPath = path.join(this.templatesDir, `${name}.md`);
		if (!fs.existsSync(bundledPath)) {
			vscode.window.showErrorMessage(`AutoDev: No bundled template found for "${name}".`);
			return;
		}
		const content = fs.readFileSync(bundledPath, 'utf-8');
		fs.writeFileSync(userPath, content, 'utf-8');
		this.panel?.webview.postMessage({ type: 'template:reset:done', name, content });
		vscode.window.showInformationMessage(`AutoDev: Template "${TEMPLATE_DISPLAY_NAMES[name] ?? name}" reset to default.`);
	}

	private loadAllTemplates(): Array<{ name: string; displayName: string; content: string }> {
		const templateFiles = [
			'simple-plan',
			'prd',
			'bug-fix',
			'test-gen',
			'analysis',
			'direct-execute',
			'refactor',
		];
		const results: Array<{ name: string; displayName: string; content: string }> = [];
		for (const name of templateFiles) {
			const filePath = path.join(this.templatesDir, `${name}.md`);
			if (fs.existsSync(filePath)) {
				const content = fs.readFileSync(filePath, 'utf-8');
				results.push({
					name,
					displayName: TEMPLATE_DISPLAY_NAMES[name] ?? name,
					content,
				});
			}
		}
		return results;
	}

	// ── HTML generation ───────────────────────────────────────────────────────

	private buildHtml(webview: vscode.Webview): string {
		const nonce = randomBytes(16).toString('hex');
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'template-editor.js'),
		);
		const cssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'template-editor.css'),
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
	<link rel="stylesheet" href="${cssUri}">
	<title>Template Editor</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
