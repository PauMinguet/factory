/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export interface DetectedStack {
	/** Primary language, e.g. "TypeScript", "Python", "Rust" */
	language: string;
	/** Framework or runtime, e.g. "React", "Next.js", "Express" */
	framework: string | undefined;
	/** Inferred test command */
	testCommand: string | undefined;
	/** Inferred build command */
	buildCommand: string | undefined;
	/** Inferred lint command */
	lintCommand: string | undefined;
	/** Package manager detected */
	packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'cargo' | 'pip' | 'go' | 'unknown';
	/** Human-readable description, used in template interpolation */
	description: string;
}

interface PackageJson {
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export function detectStack(repoPath: string): DetectedStack {
	// Node.js / TypeScript project
	const pkgPath = path.join(repoPath, 'package.json');
	if (fs.existsSync(pkgPath)) {
		return detectNodeStack(repoPath, pkgPath);
	}

	// Python project
	if (fs.existsSync(path.join(repoPath, 'pyproject.toml')) || fs.existsSync(path.join(repoPath, 'setup.py'))) {
		return detectPythonStack(repoPath);
	}

	// Rust project
	if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
		return { language: 'Rust', framework: undefined, testCommand: 'cargo test', buildCommand: 'cargo build', lintCommand: 'cargo clippy', packageManager: 'cargo', description: 'Rust' };
	}

	// Go project
	if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
		return { language: 'Go', framework: undefined, testCommand: 'go test ./...', buildCommand: 'go build ./...', lintCommand: 'golangci-lint run', packageManager: 'go', description: 'Go' };
	}

	// Java — Maven
	if (fs.existsSync(path.join(repoPath, 'pom.xml'))) {
		return { language: 'Java', framework: undefined, testCommand: 'mvn test', buildCommand: 'mvn compile', lintCommand: undefined, packageManager: 'unknown', description: 'Java (Maven)' };
	}

	// Java — Gradle
	if (fs.existsSync(path.join(repoPath, 'build.gradle')) || fs.existsSync(path.join(repoPath, 'build.gradle.kts'))) {
		return { language: 'Java', framework: undefined, testCommand: './gradlew test', buildCommand: './gradlew build', lintCommand: undefined, packageManager: 'unknown', description: 'Java (Gradle)' };
	}

	return { language: 'Unknown', framework: undefined, testCommand: undefined, buildCommand: undefined, lintCommand: undefined, packageManager: 'unknown', description: 'Unknown' };
}

function detectNodeStack(repoPath: string, pkgPath: string): DetectedStack {
	let pkg: PackageJson = {};
	try {
		pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
	} catch {
		// ignore
	}

	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const scripts = pkg.scripts ?? {};

	// Detect language
	const language = deps['typescript'] || deps['ts-node'] || fs.existsSync(path.join(repoPath, 'tsconfig.json'))
		? 'TypeScript'
		: 'JavaScript';

	// Detect framework
	const framework = detectNodeFramework(deps);

	// Detect package manager
	const packageManager = detectNodePackageManager(repoPath);

	// Infer commands from scripts, then fall back to framework defaults
	const testCommand = scripts['test'] ?? inferTestCommand(deps, packageManager);
	const buildCommand = scripts['build'] ?? inferBuildCommand(deps, packageManager);
	const lintCommand = scripts['lint'] ?? inferLintCommand(deps, packageManager);

	const frameworkLabel = framework ? ` + ${framework}` : '';
	const description = `${language}${frameworkLabel}`;

	return { language, framework, testCommand, buildCommand, lintCommand, packageManager, description };
}

function detectNodeFramework(deps: Record<string, string>): string | undefined {
	if (deps['next']) { return 'Next.js'; }
	if (deps['nuxt']) { return 'Nuxt'; }
	if (deps['@sveltejs/kit']) { return 'SvelteKit'; }
	if (deps['svelte']) { return 'Svelte'; }
	if (deps['react']) { return 'React'; }
	if (deps['vue']) { return 'Vue'; }
	if (deps['express']) { return 'Express'; }
	if (deps['fastify']) { return 'Fastify'; }
	if (deps['@nestjs/core']) { return 'NestJS'; }
	if (deps['@remix-run/react']) { return 'Remix'; }
	if (deps['astro']) { return 'Astro'; }
	return undefined;
}

function detectNodePackageManager(repoPath: string): DetectedStack['packageManager'] {
	if (fs.existsSync(path.join(repoPath, 'bun.lockb'))) { return 'bun'; }
	if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) { return 'pnpm'; }
	if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) { return 'yarn'; }
	return 'npm';
}

function inferTestCommand(deps: Record<string, string>, pm: DetectedStack['packageManager']): string | undefined {
	const runner = pm === 'bun' ? 'bun' : (pm === 'pnpm' ? 'pnpm' : (pm === 'yarn' ? 'yarn' : 'npm'));
	if (deps['vitest']) { return `${runner} run vitest`; }
	if (deps['jest'] || deps['@jest/core']) { return `${runner} test`; }
	if (deps['mocha']) { return `${runner} test`; }
	if (deps['playwright'] || deps['@playwright/test']) { return `${runner} run playwright test`; }
	return undefined;
}

function inferBuildCommand(deps: Record<string, string>, pm: DetectedStack['packageManager']): string | undefined {
	const runner = pm === 'bun' ? 'bun' : (pm === 'pnpm' ? 'pnpm' : (pm === 'yarn' ? 'yarn' : 'npm'));
	if (deps['vite'] || deps['next'] || deps['nuxt']) { return `${runner} run build`; }
	if (deps['typescript']) { return `${runner} run build`; }
	return undefined;
}

function inferLintCommand(deps: Record<string, string>, pm: DetectedStack['packageManager']): string | undefined {
	const runner = pm === 'bun' ? 'bun' : (pm === 'pnpm' ? 'pnpm' : (pm === 'yarn' ? 'yarn' : 'npm'));
	if (deps['eslint']) { return `${runner} run lint`; }
	if (deps['biome']) { return `${runner} run lint`; }
	return undefined;
}

function detectPythonStack(repoPath: string): DetectedStack {
	let testCommand = 'pytest';
	let framework: string | undefined;

	try {
		const pyproject = fs.readFileSync(path.join(repoPath, 'pyproject.toml'), 'utf8');
		if (pyproject.includes('django')) { framework = 'Django'; testCommand = 'python manage.py test'; }
		else if (pyproject.includes('fastapi')) { framework = 'FastAPI'; }
		else if (pyproject.includes('flask')) { framework = 'Flask'; }
	} catch {
		// ignore
	}

	return {
		language: 'Python',
		framework,
		testCommand,
		buildCommand: undefined,
		lintCommand: 'ruff check .',
		packageManager: 'pip',
		description: framework ? `Python + ${framework}` : 'Python',
	};
}
