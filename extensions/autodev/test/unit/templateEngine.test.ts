/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { renderTemplate } from '../../src/extension/services/templateEngine';
import type { TemplateContext } from '../../src/extension/types';

const BASE_CTX: TemplateContext = {
	ticketTitle: 'Add dark mode',
	ticketDescription: 'Support dark mode with a toggle.',
	projectName: 'My SaaS App',
	autoDetectedStack: 'TypeScript + React',
	testCommand: 'npm test',
	buildCommand: 'npm run build',
};

suite('renderTemplate', () => {
	test('substitutes simple tokens', () => {
		const template = 'Project: {{PROJECT_NAME}}\nStack: {{AUTO_DETECTED_STACK}}';
		const result = renderTemplate(template, BASE_CTX);
		assert.strictEqual(result, 'Project: My SaaS App\nStack: TypeScript + React');
	});

	test('substitutes ticket tokens', () => {
		const template = '## {{TICKET_TITLE}}\n{{TICKET_DESCRIPTION}}';
		const result = renderTemplate(template, BASE_CTX);
		assert.strictEqual(result, '## Add dark mode\nSupport dark mode with a toggle.');
	});

	test('renders context files block when contextFiles is set', () => {
		const template = 'Before\n{{#CONTEXT_FILES}}\n{{CONTEXT_FILES}}\n{{/CONTEXT_FILES}}\nAfter';
		const ctx = { ...BASE_CTX, contextFiles: '```ts\nconst x = 1;\n```' };
		const result = renderTemplate(template, ctx);
		assert.ok(result.includes('```ts'), result);
		assert.ok(result.includes('Before'), result);
		assert.ok(result.includes('After'), result);
	});

	test('removes context files block when contextFiles is absent', () => {
		const template = 'Before\n{{#CONTEXT_FILES}}\nSome context\n{{/CONTEXT_FILES}}\nAfter';
		const result = renderTemplate(template, BASE_CTX);
		assert.ok(!result.includes('Some context'), result);
		assert.ok(result.includes('Before'), result);
		assert.ok(result.includes('After'), result);
	});

	test('renders attachments block when attachmentDescriptions is set', () => {
		const template = '{{#ATTACHMENTS}}\nSee: {{ATTACHMENT_DESCRIPTIONS}}\n{{/ATTACHMENTS}}';
		const ctx = { ...BASE_CTX, attachmentDescriptions: 'design.png — UI mockup' };
		const result = renderTemplate(template, ctx);
		assert.ok(result.includes('design.png'), result);
	});

	test('removes attachments block when attachmentDescriptions is absent', () => {
		const template = 'Before\n{{#ATTACHMENTS}}\nAttachments here\n{{/ATTACHMENTS}}\nAfter';
		const result = renderTemplate(template, BASE_CTX);
		assert.ok(!result.includes('Attachments here'), result);
	});

	test('uses (not configured) fallback for missing testCommand', () => {
		const ctx = { ...BASE_CTX, testCommand: '' };
		const template = 'Test: {{TEST_COMMAND}}';
		const result = renderTemplate(template, ctx);
		assert.strictEqual(result, 'Test: (not configured)');
	});

	test('handles templates with no tokens gracefully', () => {
		const template = 'Hello, world!';
		const result = renderTemplate(template, BASE_CTX);
		assert.strictEqual(result, 'Hello, world!');
	});

	test('trims leading/trailing whitespace from result', () => {
		const template = '\n\n  Hello  \n\n';
		const result = renderTemplate(template, BASE_CTX);
		assert.strictEqual(result, 'Hello');
	});
});
