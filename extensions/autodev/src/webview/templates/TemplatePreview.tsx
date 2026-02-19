/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';

/** Sample data used to preview template variable interpolation. */
const SAMPLE_VARS: Record<string, string> = {
	TICKET_TITLE: 'Add dark mode toggle to settings page',
	TICKET_DESCRIPTION: 'Users have requested a dark mode option. Add a toggle in the user settings that persists across sessions using localStorage.',
	PROJECT_NAME: 'My SaaS App',
	AUTO_DETECTED_STACK: 'TypeScript, React 18, Vite, Vitest',
	TEST_COMMAND: 'npm test',
	BUILD_COMMAND: 'npm run build',
	LINT_COMMAND: 'npm run lint',
	CONTEXT_FILES: '```typescript\n// src/types/user.ts\nexport interface User { id: string; theme: "light" | "dark"; }\n```',
};

/** Interpolates {{VARIABLE}} tokens using sample data. */
function interpolate(template: string): string {
	let result = template;

	// Replace conditional blocks
	result = result.replace(/\{\{#ATTACHMENTS\}\}[\s\S]*?\{\{\/ATTACHMENTS\}\}/g,
		'[Attachments: example.pdf, screenshot.png]'
	);
	result = result.replace(/\{\{#CONTEXT_FILES\}\}([\s\S]*?)\{\{\/CONTEXT_FILES\}\}/g,
		`\n${SAMPLE_VARS.CONTEXT_FILES}\n`
	);

	// Replace simple variables
	for (const [key, value] of Object.entries(SAMPLE_VARS)) {
		result = result.replaceAll(`{{${key}}}`, value);
	}

	// Remove any remaining unknown {{TOKENS}}
	result = result.replace(/\{\{[^}]+\}\}/g, match => `[${match}]`);

	return result;
}

interface TemplatePreviewProps {
	content: string;
}

export function TemplatePreview({ content }: TemplatePreviewProps): React.ReactElement {
	const interpolated = useMemo(() => interpolate(content), [content]);

	return (
		<div className="te-preview">
			<pre className="te-preview__content">{interpolated}</pre>
		</div>
	);
}
