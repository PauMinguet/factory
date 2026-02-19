/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { postMessage } from '../shared/useVSCodeApi';
import { TemplatePreview } from './TemplatePreview';
import type { ExtensionMessage, WebviewMessage } from '../../extension/types/messages';

interface TemplateInfo {
	name: string;
	displayName: string;
	content: string;
}

export function TemplateEditor(): React.ReactElement {
	const [templates, setTemplates] = useState<TemplateInfo[]>([]);
	const [selectedName, setSelectedName] = useState<string>('');
	const [content, setContent] = useState('');
	const [savedContent, setSavedContent] = useState('');
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);

	const send = useCallback((msg: WebviewMessage) => postMessage(msg), []);

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const msg = event.data as ExtensionMessage;
			switch (msg.type) {
				case 'templates:init':
					setTemplates(msg.templates);
					if (msg.templates.length > 0 && !selectedName) {
						const first = msg.templates[0];
						setSelectedName(first.name);
						setContent(first.content);
						setSavedContent(first.content);
						setDirty(false);
					}
					break;
				case 'template:loaded':
					setContent(msg.content);
					setSavedContent(msg.content);
					setDirty(false);
					break;
				case 'template:saved':
					setSavedContent(content);
					setDirty(false);
					setSaving(false);
					break;
				case 'template:reset:done':
					setContent(msg.content);
					setSavedContent(msg.content);
					setDirty(false);
					break;
				default:
					break;
			}
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, [content, selectedName]);

	const handleSelectTemplate = (name: string) => {
		if (dirty) {
			// Could show a confirm dialog here — for now just switch anyway
		}
		setSelectedName(name);
		send({ type: 'template:load', name });
	};

	const handleContentChange = (newContent: string) => {
		setContent(newContent);
		setDirty(newContent !== savedContent);
	};

	const handleSave = () => {
		if (!selectedName) { return; }
		setSaving(true);
		send({ type: 'template:save', name: selectedName, content });
	};

	const handleReset = () => {
		if (!selectedName) { return; }
		send({ type: 'template:reset', name: selectedName });
	};

	const selectedTemplate = templates.find(t => t.name === selectedName);

	return (
		<div className="te-root">
			{/* Sidebar — template list */}
			<div className="te-sidebar">
				<div className="te-sidebar__header">Templates</div>
				<ul className="te-template-list">
					{templates.map(t => (
						<li
							key={t.name}
							className={`te-template-item ${t.name === selectedName ? 'te-template-item--active' : ''}`}
							onClick={() => handleSelectTemplate(t.name)}
						>
							{t.displayName}
						</li>
					))}
				</ul>
			</div>

			{/* Main editor area */}
			<div className="te-main">
				{selectedTemplate ? (
					<>
						<div className="te-toolbar">
							<span className="te-toolbar__title">
								{selectedTemplate.displayName}
								{dirty && <span className="te-dirty-indicator"> ●</span>}
							</span>
							<div className="te-toolbar__actions">
								<button
									className="te-btn te-btn--primary"
									onClick={handleSave}
									disabled={!dirty || saving}
								>
									{saving ? 'Saving...' : '💾 Save'}
								</button>
								<button className="te-btn" onClick={handleReset}>
									↺ Reset to Default
								</button>
							</div>
						</div>

						<div className="te-editor-split">
							{/* Left: editable textarea */}
							<div className="te-editor-pane">
								<div className="te-pane-label">Editor</div>
								<textarea
									className="te-editor"
									value={content}
									onChange={e => handleContentChange(e.target.value)}
									spellCheck={false}
									placeholder="Template content (Markdown with {{VARIABLES}})..."
								/>
							</div>

							{/* Right: preview */}
							<div className="te-preview-pane">
								<div className="te-pane-label">Preview (sample data)</div>
								<TemplatePreview content={content} />
							</div>
						</div>
					</>
				) : (
					<div className="te-empty">
						<p>Select a template from the sidebar to edit it.</p>
					</div>
				)}
			</div>
		</div>
	);
}
