/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Returns the root data directory for AutoDev Studio.
 * Respects the `autodev.dataDir` setting; defaults to `~/.autodev-studio`.
 */
export function getDataDir(): string {
	const configured = vscode.workspace.getConfiguration('autodev').get<string>('dataDir');
	if (configured && configured.trim() !== '') {
		return configured.trim();
	}
	return path.join(os.homedir(), '.autodev-studio');
}

/** Path to the SQLite database file. */
export function getDbPath(): string {
	return path.join(getDataDir(), 'autodev.db');
}

/** Directory for per-ticket log files. */
export function getLogsDir(): string {
	return path.join(getDataDir(), 'logs');
}

/** Directory for user-editable plan prompt templates. */
export function getTemplatesDir(): string {
	return path.join(getDataDir(), 'templates');
}

/**
 * Ensures the AutoDev data directory tree exists on disk.
 * Also seeds the templates directory with bundled defaults if it is empty.
 */
export function ensureDataDir(context: vscode.ExtensionContext): void {
	const dirs = [getDataDir(), getLogsDir(), getTemplatesDir()];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	seedTemplates(context);
}

/**
 * Copies bundled templates into the user's templates directory
 * if they do not already exist there (never overwrites user edits).
 */
function seedTemplates(context: vscode.ExtensionContext): void {
	const bundledDir = path.join(context.extensionPath, 'templates');
	const userDir = getTemplatesDir();

	if (!fs.existsSync(bundledDir)) {
		return;
	}

	const files = fs.readdirSync(bundledDir).filter(f => f.endsWith('.md'));
	for (const file of files) {
		const dest = path.join(userDir, file);
		if (!fs.existsSync(dest)) {
			fs.copyFileSync(path.join(bundledDir, file), dest);
		}
	}
}
