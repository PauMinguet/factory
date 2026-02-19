/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { execFile } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface RunOptions {
	/** The full prompt to pass to Claude Code */
	prompt: string;
	/** Working directory for the Claude Code process */
	cwd: string;
	/** Absolute path to the log file to write output to */
	logPath: string;
	/** Maximum number of agentic turns (default: 50) */
	maxTurns?: number;
	/** Override the claude binary path */
	claudeCodePath?: string;
	/** Called with each line of output as it arrives */
	onLine?: (line: string) => void;
	/**
	 * Permission mode for tool calls.
	 * - 'skip': pass --dangerously-skip-permissions (recommended for isolated worktrees)
	 * - 'allowedTools': pre-approve a specific list of tools via --allowedTools
	 * - 'prompt': do nothing; Claude will block on permission prompts (only works interactively)
	 * Defaults to 'skip'.
	 */
	permissionMode?: 'skip' | 'allowedTools' | 'prompt';
	/** Tool names to pre-approve when permissionMode is 'allowedTools' */
	allowedTools?: string[];
}

export interface RunResult {
	exitCode: number;
	/** Captured stdout content */
	output: string;
}

/**
 * Thin wrapper around the Claude Code CLI.
 * Runs Claude Code in non-interactive mode (`--print`) with structured JSON output,
 * streams the output to a log file, and returns the exit code.
 */
export class ClaudeCodeRunner {
	/** Active processes, keyed by ticketId, for cancellation */
	private readonly processes = new Map<string, ReturnType<typeof spawn>>();

	/**
	 * Locates the Claude Code binary.
	 * Priority: configuredPath → PATH lookup.
	 * Throws with an actionable message if not found.
	 */
	async findClaudeCode(configuredPath?: string): Promise<string> {
		if (configuredPath && configuredPath.trim() !== '') {
			if (!fs.existsSync(configuredPath)) {
				throw new Error(`Claude Code binary not found at configured path: ${configuredPath}`);
			}
			return configuredPath;
		}

		try {
			const { stdout } = await execFileAsync('which', ['claude']);
			const bin = stdout.trim();
			if (bin) {
				return bin;
			}
		} catch {
			// fall through
		}

		throw new Error(
			'Claude Code CLI not found. Install it with:\n  npm install -g @anthropic-ai/claude-code\nThen restart VS Code.',
		);
	}

	/**
	 * Runs Claude Code with the given prompt in the given directory.
	 * Streams output to the log file and calls `onLine` for each line.
	 */
	async run(trackingId: string, options: RunOptions): Promise<RunResult> {
		const claudeBin = await this.findClaudeCode(options.claudeCodePath);
		const maxTurns = options.maxTurns ?? 50;

		const permissionMode = options.permissionMode ?? 'skip';
		const args = [
			'--print',
			'--verbose',
			'--output-format', 'stream-json',
			'--max-turns', String(maxTurns),
		];

		if (permissionMode === 'skip') {
			args.push('--dangerously-skip-permissions');
		} else if (permissionMode === 'allowedTools' && options.allowedTools?.length) {
			args.push('--allowedTools', options.allowedTools.join(','));
		}

		args.push(options.prompt);

		const logStream = fs.createWriteStream(options.logPath, { flags: 'a' });

		return new Promise((resolve, reject) => {
			const proc = spawn(claudeBin, args, {
				cwd: options.cwd,
				env: { ...process.env },
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			this.processes.set(trackingId, proc);

			let outputBuffer = '';
			let lineBuffer = '';

			const handleData = (chunk: Buffer): void => {
				const text = chunk.toString('utf8');
				outputBuffer += text;
				logStream.write(chunk);

				// Emit complete lines to the onLine callback
				lineBuffer += text;
				const lines = lineBuffer.split('\n');
				lineBuffer = lines.pop() ?? '';
				for (const line of lines) {
					if (line && options.onLine) {
						options.onLine(line);
					}
				}
			};

			proc.stdout?.on('data', handleData);
			proc.stderr?.on('data', handleData);

			proc.on('error', err => {
				this.processes.delete(trackingId);
				logStream.end();
				reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
			});

			proc.on('close', exitCode => {
				this.processes.delete(trackingId);
				// Flush any remaining line buffer
				if (lineBuffer && options.onLine) {
					options.onLine(lineBuffer);
				}
				logStream.end(() => {
					resolve({ exitCode: exitCode ?? 1, output: outputBuffer });
				});
			});
		});
	}

	/**
	 * Cancels a running Claude Code session by sending SIGTERM to the process.
	 */
	cancel(trackingId: string): void {
		const proc = this.processes.get(trackingId);
		if (proc) {
			proc.kill('SIGTERM');
			this.processes.delete(trackingId);
		}
	}

	/** Returns true if a session with this trackingId is currently running. */
	isRunning(trackingId: string): boolean {
		return this.processes.has(trackingId);
	}
}
