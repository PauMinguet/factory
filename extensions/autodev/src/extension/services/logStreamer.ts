/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { JobStats } from '../types';

const POLL_INTERVAL_MS = 200;
const MAX_TAIL_BYTES = 1_000_000; // 1 MB tail limit for history reads

interface WatchState {
	logPath: string;
	offset: number;
	timer: NodeJS.Timeout;
}

/**
 * Tails log files written by Claude Code workers and emits 'line' events
 * in real time for forwarding to the webview.
 *
 * Events:
 *   - 'line' (ticketId: string, line: string, timestamp: string)
 */
export class LogStreamer extends EventEmitter {
	private readonly watchers = new Map<string, WatchState>();

	/**
	 * Begins tailing the log file at `logPath`, emitting one 'line' event per
	 * newline-terminated chunk. The file does not need to exist at call time —
	 * polling will begin once it appears.
	 */
	watch(jobId: string, logPath: string): void {
		if (this.watchers.has(jobId)) {
			return; // already watching
		}

		const state: WatchState = {
			logPath,
			offset: 0,
			timer: setInterval(() => this.poll(jobId), POLL_INTERVAL_MS),
		};
		this.watchers.set(jobId, state);
	}

	/** Stops tailing a specific job log. */
	stop(jobId: string): void {
		const state = this.watchers.get(jobId);
		if (state) {
			clearInterval(state.timer);
			this.watchers.delete(jobId);
		}
	}

	/** Stops all active watchers. */
	stopAll(): void {
		for (const jobId of this.watchers.keys()) {
			this.stop(jobId);
		}
	}

	/**
	 * Returns the full history of a completed job's log file as an array of lines.
	 */
	getHistory(_jobId: string, logPath: string): string[] {
		if (!fs.existsSync(logPath)) {
			return [];
		}
		try {
			const stat = fs.statSync(logPath);
			const start = Math.max(0, stat.size - MAX_TAIL_BYTES);
			const fd = fs.openSync(logPath, 'r');
			const buf = Buffer.alloc(stat.size - start);
			fs.readSync(fd, buf, 0, buf.length, start);
			fs.closeSync(fd);
			return buf.toString('utf8').split('\n').filter(Boolean);
		} catch {
			return [];
		}
	}

	/**
	 * Parses aggregate stats from a completed log file.
	 * Looks for Claude Code stream-json summary patterns.
	 */
	getStats(logPath: string, exitCode: number): JobStats {
		const lines = this.getHistory('_stats', logPath);
		let filesModified = 0;
		let testResult: 'pass' | 'fail' | undefined;

		for (const line of lines) {
			// Count file edit/write operations
			if (line.includes('"tool":"Write"') || line.includes('"tool":"Edit"')) {
				filesModified++;
			}
			// Detect test results
			if (/\d+ (tests?|specs?) passed/i.test(line) || /all tests pass/i.test(line)) {
				testResult = 'pass';
			}
			if (/\d+ (tests?|specs?) failed/i.test(line) || /test suite failed/i.test(line)) {
				testResult = 'fail';
			}
		}

		return { totalLogLines: lines.length, filesModified, testResult, exitCode };
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private poll(jobId: string): void {
		const state = this.watchers.get(jobId);
		if (!state) {
			return;
		}

		if (!fs.existsSync(state.logPath)) {
			return; // file not created yet
		}

		try {
			const stat = fs.statSync(state.logPath);
			if (stat.size <= state.offset) {
				return; // no new data
			}

			const fd = fs.openSync(state.logPath, 'r');
			const buf = Buffer.alloc(stat.size - state.offset);
			fs.readSync(fd, buf, 0, buf.length, state.offset);
			fs.closeSync(fd);

			state.offset = stat.size;

			const chunk = buf.toString('utf8');
			const lines = chunk.split('\n');

			// The last element may be a partial line — keep it for next poll
			for (let i = 0; i < lines.length - 1; i++) {
				const line = lines[i];
				if (line) {
					this.emit('line', jobId, line, new Date().toISOString());
				}
			}

			// Carry forward any partial line by rolling back the offset
			const lastPartial = lines[lines.length - 1];
			if (lastPartial) {
				state.offset -= Buffer.byteLength(lastPartial, 'utf8');
			}
		} catch {
			// File may be deleted or locked — silently skip this poll cycle
		}
	}

	/**
	 * Ensures the directory for a log file exists and returns the log path.
	 */
	static logPath(logsDir: string, ticketId: string, jobId: string): string {
		const dir = path.join(logsDir, ticketId);
		fs.mkdirSync(dir, { recursive: true });
		return path.join(dir, `${jobId}.log`);
	}
}
