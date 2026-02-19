/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectStack } from '../../src/extension/services/projectDetector';

/**
 * Creates a temporary directory, writes the given files to it, runs the test
 * callback, then deletes the temp dir.
 */
function withTempRepo(files: Record<string, string>, fn: (dir: string) => void): void {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodev-test-'));
	try {
		for (const [relPath, content] of Object.entries(files)) {
			const fullPath = path.join(dir, relPath);
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
			fs.writeFileSync(fullPath, content);
		}
		fn(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

suite('detectStack', () => {
	test('detects TypeScript + React from package.json', () => {
		withTempRepo({
			'package.json': JSON.stringify({
				dependencies: { react: '^18.0.0' },
				devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' },
				scripts: { test: 'jest', build: 'tsc' },
			}),
			'tsconfig.json': '{}',
		}, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.language, 'TypeScript');
			assert.strictEqual(stack.framework, 'React');
			assert.strictEqual(stack.testCommand, 'jest');
			assert.strictEqual(stack.buildCommand, 'tsc');
		});
	});

	test('detects Next.js project', () => {
		withTempRepo({
			'package.json': JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
			'tsconfig.json': '{}',
		}, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.framework, 'Next.js');
		});
	});

	test('detects Rust project from Cargo.toml', () => {
		withTempRepo({ 'Cargo.toml': '[package]\nname = "my-app"' }, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.language, 'Rust');
			assert.strictEqual(stack.testCommand, 'cargo test');
			assert.strictEqual(stack.packageManager, 'cargo');
		});
	});

	test('detects Go project from go.mod', () => {
		withTempRepo({ 'go.mod': 'module example.com/app\n\ngo 1.22' }, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.language, 'Go');
			assert.strictEqual(stack.testCommand, 'go test ./...');
		});
	});

	test('detects Python project from pyproject.toml', () => {
		withTempRepo({ 'pyproject.toml': '[project]\nname = "myapp"' }, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.language, 'Python');
			assert.strictEqual(stack.testCommand, 'pytest');
		});
	});

	test('returns Unknown for empty directory', () => {
		withTempRepo({}, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.language, 'Unknown');
		});
	});

	test('infers npm test command when scripts.test is missing but jest is in deps', () => {
		withTempRepo({
			'package.json': JSON.stringify({
				devDependencies: { jest: '^29.0.0' },
			}),
		}, dir => {
			const stack = detectStack(dir);
			assert.ok(stack.testCommand?.includes('jest') || stack.testCommand?.includes('test'), stack.testCommand);
		});
	});

	test('detects yarn as package manager', () => {
		withTempRepo({
			'package.json': JSON.stringify({}),
			'yarn.lock': '# yarn lockfile v1',
		}, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.packageManager, 'yarn');
		});
	});

	test('detects pnpm as package manager', () => {
		withTempRepo({
			'package.json': JSON.stringify({}),
			'pnpm-lock.yaml': 'lockfileVersion: 9',
		}, dir => {
			const stack = detectStack(dir);
			assert.strictEqual(stack.packageManager, 'pnpm');
		});
	});
});
