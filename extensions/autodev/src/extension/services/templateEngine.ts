/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type { TemplateContext } from '../types';
import type { PlanType } from '../types';

// ── Context file resolution ────────────────────────────────────────────────────

/** Directories to skip when walking a project tree. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'out', '.next', '__pycache__', 'target', '.gradle']);

/** Maximum file size (bytes) to inline as context — 100 KB. */
const MAX_FILE_BYTES = 100 * 1024;

/**
 * Walks a directory recursively and returns all file paths relative to `baseDir`,
 * skipping common build/dependency directories.
 */
function walkDir(dir: string, baseDir: string): string[] {
	const results: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) {
				results.push(...walkDir(path.join(dir, entry.name), baseDir));
			}
		} else if (entry.isFile()) {
			results.push(path.relative(baseDir, path.join(dir, entry.name)));
		}
	}
	return results;
}

/**
 * Converts a glob pattern to a RegExp for file matching.
 * Supports `*` (any chars except `/`) and `**` (any chars including `/`).
 */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars (not * or ?)
		.replace(/\\\*/g, '__STAR__')            // temporarily hide escaped stars
		.replace(/__STAR____STAR__/g, '(.+)')   // ** → match any path segment
		.replace(/__STAR__/g, '([^/]+)');        // * → match within a single segment
	return new RegExp(`^${escaped}$`);
}

/**
 * Resolves an array of glob patterns relative to `repoPath` and returns the
 * contents of matched files formatted as fenced code blocks.
 *
 * Files larger than 100 KB are skipped. Binary files are skipped.
 * Returns an empty string if no files match.
 */
export function resolveContextFiles(repoPath: string, patterns: string[]): string {
	if (!patterns.length) {
		return '';
	}

	const allFiles = walkDir(repoPath, repoPath);
	const regexes = patterns.map(p => globToRegex(p.startsWith('./') ? p.slice(2) : p));

	const matched = allFiles.filter(f =>
		regexes.some(re => re.test(f.replace(/\\/g, '/')))
	);

	const blocks: string[] = [];
	for (const relativePath of matched) {
		const fullPath = path.join(repoPath, relativePath);
		try {
			const stat = fs.statSync(fullPath);
			if (stat.size > MAX_FILE_BYTES) {
				continue;
			}
			const content = fs.readFileSync(fullPath, 'utf8');
			// Skip files with null bytes (binary)
			if (content.includes('\0')) {
				continue;
			}
			const ext = path.extname(relativePath).slice(1) || 'text';
			blocks.push(`\`\`\`${ext}\n// ${relativePath}\n${content}\n\`\`\``);
		} catch {
			// Skip unreadable files
		}
	}

	return blocks.join('\n\n');
}

/** Maps a PlanType to its template filename (without extension). */
const TEMPLATE_FILE: Record<PlanType, string> = {
	prd: 'prd',
	simple_plan: 'simple-plan',
	analysis: 'analysis',
	bug_fix: 'bug-fix',
	test: 'test-gen',
	direct: 'direct-execute',
	refactor: 'refactor',
};

export class TemplateEngine {
	constructor(private readonly templatesDir: string) {}

	/**
	 * Loads the template for a given plan type and renders it with the provided context.
	 */
	render(planType: PlanType, context: TemplateContext): string {
		const filename = TEMPLATE_FILE[planType];
		const templatePath = path.join(this.templatesDir, `${filename}.md`);

		let content: string;
		try {
			content = fs.readFileSync(templatePath, 'utf8');
		} catch {
			throw new Error(`Template not found for plan type "${planType}": ${templatePath}`);
		}

		return renderTemplate(content, context);
	}
}

/**
 * Renders a template string by substituting all known variable tokens.
 *
 * Supported tokens:
 *   {{TICKET_TITLE}}, {{TICKET_DESCRIPTION}}, {{PROJECT_NAME}},
 *   {{AUTO_DETECTED_STACK}}, {{TEST_COMMAND}}, {{BUILD_COMMAND}}
 *
 * Conditional blocks:
 *   {{#CONTEXT_FILES}}...{{/CONTEXT_FILES}}   — rendered only when contextFiles is set
 *   {{#ATTACHMENTS}}...{{/ATTACHMENTS}}        — rendered only when attachmentDescriptions is set
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
	let result = template;

	// Conditional blocks — must be processed before simple substitutions
	result = renderConditionalBlock(result, 'CONTEXT_FILES', !!ctx.contextFiles);
	result = renderConditionalBlock(result, 'ATTACHMENTS', !!ctx.attachmentDescriptions);

	// Simple token substitutions
	const substitutions: Record<string, string> = {
		'{{TICKET_TITLE}}': ctx.ticketTitle,
		'{{TICKET_DESCRIPTION}}': ctx.ticketDescription,
		'{{PROJECT_NAME}}': ctx.projectName,
		'{{AUTO_DETECTED_STACK}}': ctx.autoDetectedStack,
		'{{TEST_COMMAND}}': ctx.testCommand || '(not configured)',
		'{{BUILD_COMMAND}}': ctx.buildCommand || '(not configured)',
		'{{CONTEXT_FILES}}': ctx.contextFiles ?? '',
		'{{ATTACHMENT_DESCRIPTIONS}}': ctx.attachmentDescriptions ?? '',
	};

	for (const [token, value] of Object.entries(substitutions)) {
		result = result.replaceAll(token, value);
	}

	return result.trim();
}

/**
 * Renders or removes a `{{#TAG}}...{{/TAG}}` conditional block based on `include`.
 * When included, the tags themselves are stripped but the inner content is kept.
 * When excluded, the entire block including tags is removed.
 */
function renderConditionalBlock(template: string, tag: string, include: boolean): string {
	const openTag = `{{#${tag}}}`;
	const closeTag = `{{/${tag}}}`;
	const regex = new RegExp(`${escapeRegex(openTag)}([\\s\\S]*?)${escapeRegex(closeTag)}`, 'g');

	if (include) {
		// Keep the inner content, strip the block tags
		return template.replace(regex, (_match, inner: string) => inner);
	} else {
		// Remove the entire block
		return template.replace(regex, '');
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
