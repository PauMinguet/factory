/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';

interface LogEntry {
	line: string;
	timestamp: string;
}

type EventKind = 'claude-text' | 'tool-call' | 'system' | 'completion';

interface ActivityEvent {
	id: string;
	kind: EventKind;
	text: string;
	toolName?: string;
	timestamp: string;
}

function summarizeToolInput(name: string, input: Record<string, unknown>): string {
	switch (name) {
		case 'Bash': {
			const cmd = typeof input.command === 'string' ? input.command : '';
			return cmd.length > 160 ? `${cmd.slice(0, 160)}…` : cmd;
		}
		case 'Read':
			return typeof input.file_path === 'string' ? input.file_path : '';
		case 'Write':
			return typeof input.file_path === 'string' ? input.file_path : '';
		case 'Edit':
			return typeof input.file_path === 'string' ? input.file_path : '';
		case 'Glob':
			return typeof input.pattern === 'string' ? input.pattern : '';
		case 'Grep': {
			const pattern = typeof input.pattern === 'string' ? `"${input.pattern}"` : '';
			const inPath = typeof input.path === 'string' ? ` in ${input.path}` : '';
			return `${pattern}${inPath}`;
		}
		case 'Task': {
			const desc = typeof input.description === 'string' ? input.description : '';
			return desc.length > 120 ? `${desc.slice(0, 120)}…` : desc;
		}
		default:
			return JSON.stringify(input).slice(0, 160);
	}
}

function parseLinesToEvents(entries: LogEntry[]): ActivityEvent[] {
	const events: ActivityEvent[] = [];
	let idx = 0;

	for (const { line, timestamp } of entries) {
		// AutoDev system messages (plain text, not JSON)
		if (line.startsWith('[AutoDev]')) {
			events.push({
				id: `ev-${idx++}`,
				kind: 'system',
				text: line.slice('[AutoDev] '.length),
				timestamp,
			});
			continue;
		}

		try {
			const obj = JSON.parse(line) as Record<string, unknown>;

			if (obj.type === 'assistant') {
				const msg = obj.message as Record<string, unknown> | undefined;
				if (!msg || !Array.isArray(msg.content)) { continue; }

				for (const block of msg.content as Array<Record<string, unknown>>) {
					if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
						events.push({
							id: `ev-${idx++}`,
							kind: 'claude-text',
							text: block.text.trim(),
							timestamp,
						});
					} else if (block.type === 'tool_use' && typeof block.name === 'string') {
						const input = (block.input ?? {}) as Record<string, unknown>;
						events.push({
							id: `ev-${idx++}`,
							kind: 'tool-call',
							toolName: block.name,
							text: summarizeToolInput(block.name, input),
							timestamp,
						});
					}
					// 'thinking' blocks are intentionally skipped
				}
			} else if (obj.type === 'result') {
				const subtype = typeof obj.subtype === 'string' ? obj.subtype : 'unknown';
				const text = subtype === 'success' ? 'Completed successfully.' : `Ended: ${subtype}`;
				events.push({ id: `ev-${idx++}`, kind: 'completion', text, timestamp });
			}
		} catch {
			// Not JSON — skip non-system plain-text lines
		}
	}

	return events;
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

const TOOL_ICONS: Partial<Record<string, string>> = {
	Bash: '⚡',
	Read: '📖',
	Write: '✏️',
	Edit: '✏️',
	Glob: '🔍',
	Grep: '🔍',
	Task: '🤖',
	WebFetch: '🌐',
	WebSearch: '🌐',
};

export interface ActivityFeedProps {
	lines: LogEntry[];
}

export function ActivityFeed({ lines }: ActivityFeedProps): React.ReactElement {
	const bottomRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const userScrolledUp = useRef(false);

	const events = parseLinesToEvents(lines);

	useEffect(() => {
		if (!userScrolledUp.current) {
			bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [events.length]);

	const handleScroll = () => {
		const el = containerRef.current;
		if (!el) { return; }
		userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 40;
	};

	if (events.length === 0) {
		return (
			<div className="activity-feed activity-feed--empty">
				<div className="activity-feed__empty-msg">
					No activity yet. Start a job to see Claude's messages here.
				</div>
			</div>
		);
	}

	return (
		<div className="activity-feed" ref={containerRef} onScroll={handleScroll}>
			{events.map(ev => (
				<div key={ev.id} className={`activity-event activity-event--${ev.kind}`}>
					<span className="activity-event__ts">{formatTimestamp(ev.timestamp)}</span>
					<div className="activity-event__body">
						{ev.kind === 'claude-text' && (
							<>
								<span className="activity-event__who">Claude</span>
								<p className="activity-event__text">{ev.text}</p>
							</>
						)}
						{ev.kind === 'tool-call' && (
							<>
								<span className="activity-event__tool-badge">
									{TOOL_ICONS[ev.toolName ?? ''] ?? '🔧'} {ev.toolName}
								</span>
								{ev.text && <code className="activity-event__tool-input">{ev.text}</code>}
							</>
						)}
						{ev.kind === 'system' && (
							<span className="activity-event__system-text">⚙ {ev.text}</span>
						)}
						{ev.kind === 'completion' && (
							<span className="activity-event__completion-text">✅ {ev.text}</span>
						)}
					</div>
				</div>
			))}
			<div ref={bottomRef} />
		</div>
	);
}
