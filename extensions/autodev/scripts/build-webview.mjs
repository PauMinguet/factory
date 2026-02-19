#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builds the AutoDev webview bundles using esbuild.
 * Outputs to out/webview/ relative to the extension root.
 *
 * Usage:
 *   node scripts/build-webview.mjs          # production build
 *   node scripts/build-webview.mjs --watch  # watch mode
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const watch = process.argv.includes('--watch');

const sharedOptions = {
	bundle: true,
	platform: 'browser',
	target: 'es2020',
	jsx: 'automatic',
	sourcemap: true,
	loader: {
		'.tsx': 'tsx',
		'.ts': 'ts',
		'.css': 'css',
	},
	define: {
		'process.env.NODE_ENV': '"production"',
	},
	// Mark VS Code extension API as external — it is provided by the webview host
	external: [],
};

const entries = [
	{
		entryPoints: [path.join(root, 'src/webview/kanban/index.tsx')],
		outfile: path.join(root, 'out/webview/kanban.js'),
	},
	{
		entryPoints: [path.join(root, 'src/webview/ticket-detail/index.tsx')],
		outfile: path.join(root, 'out/webview/ticket-detail.js'),
	},
	{
		entryPoints: [path.join(root, 'src/webview/templates/index.tsx')],
		outfile: path.join(root, 'out/webview/template-editor.js'),
	},
	{
		entryPoints: [path.join(root, 'src/webview/analytics/index.tsx')],
		outfile: path.join(root, 'out/webview/analytics.js'),
	},
	{
		entryPoints: [path.join(root, 'src/webview/sidebar/index.tsx')],
		outfile: path.join(root, 'out/webview/sidebar.js'),
	},
];

// Ensure output directory exists
fs.mkdirSync(path.join(root, 'out', 'webview'), { recursive: true });

if (watch) {
	console.log('[autodev] Watching webview sources...');
	for (const entry of entries) {
		const ctx = await esbuild.context({ ...sharedOptions, ...entry });
		await ctx.watch();
	}
} else {
	console.log('[autodev] Building webview bundles...');
	for (const entry of entries) {
		const result = await esbuild.build({ ...sharedOptions, ...entry });
		if (result.errors.length > 0) {
			console.error('[autodev] Build errors:', result.errors);
			process.exit(1);
		}
	}
	console.log('[autodev] Webview bundles built successfully.');
}
