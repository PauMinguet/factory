/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useCallback } from 'react';

interface LogEntry {
	line: string;
	timestamp: string;
}

interface LiveLogProps {
	lines: LogEntry[];
}

function classifyLine(line: string): 'success' | 'error' | 'default' {
	const lower = line.toLowerCase();
	if (lower.includes('✅') || lower.includes('passed') || lower.includes('success') || lower.includes('completed')) {
		return 'success';
	}
	if (lower.includes('❌') || lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
		return 'error';
	}
	return 'default';
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	const h = d.getHours().toString().padStart(2, '0');
	const m = d.getMinutes().toString().padStart(2, '0');
	const s = d.getSeconds().toString().padStart(2, '0');
	return `${h}:${m}:${s}`;
}

export function LiveLog({ lines }: LiveLogProps): React.ReactElement {
	const bottomRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const userScrolledUp = useRef(false);

	// Auto-scroll to bottom when new lines arrive, unless the user has scrolled up
	useEffect(() => {
		if (!userScrolledUp.current) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [lines]);

	const handleScroll = () => {
		const el = containerRef.current;
		if (!el) { return; }
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		userScrolledUp.current = !atBottom;
	};

	const handleClear = useCallback(() => {
		// We can't mutate the lines prop — signal the parent via a custom event or just hide them
		// For simplicity, we'll dispatch a custom DOM event the parent can listen to.
		// Since TicketDetail manages the lines state, we use a window event.
		window.dispatchEvent(new CustomEvent('autodev:clearLog'));
	}, []);

	const handleCopy = useCallback(() => {
		const text = lines.map(e => `[${formatTimestamp(e.timestamp)}] ${e.line}`).join('\n');
		navigator.clipboard.writeText(text).then(() => {
			// Visual feedback could be added here
		});
	}, [lines]);

	return (
		<div className="live-log">
			<div className="live-log__toolbar">
				<span className="live-log__count">{lines.length} lines</span>
				<div className="live-log__actions">
					<button className="td-btn live-log__btn" onClick={handleCopy} title="Copy all log output">
						📋 Copy
					</button>
					<button className="td-btn live-log__btn" onClick={handleClear} title="Clear log display">
						🗑 Clear
					</button>
				</div>
			</div>
			<div
				className="live-log__output"
				ref={containerRef}
				onScroll={handleScroll}
			>
				{lines.length === 0 ? (
					<div className="live-log__empty">
						No log output yet. Start a job to see live output here.
					</div>
				) : (
					lines.map((entry, i) => (
						<div
							key={i}
							className={`live-log__line live-log__line--${classifyLine(entry.line)}`}
						>
							<span className="live-log__ts">{formatTimestamp(entry.timestamp)}</span>
							<span className="live-log__text">{entry.line}</span>
						</div>
					))
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
