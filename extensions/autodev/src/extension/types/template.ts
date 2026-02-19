/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PlanType } from './ticket';

export interface PlanTemplate {
	id: string;
	name: string;
	type: PlanType;
	/** The full markdown template content */
	systemPrompt: string;
	variables: TemplateVariable[];
	isDefault: boolean;
	createdAt: Date;
}

export interface TemplateVariable {
	/** Placeholder token, e.g. "{{TICKET_TITLE}}" */
	name: string;
	description: string;
	source: 'project' | 'ticket' | 'user_input' | 'auto';
}

/** All variables available for interpolation in a template */
export interface TemplateContext {
	ticketTitle: string;
	ticketDescription: string;
	projectName: string;
	autoDetectedStack: string;
	testCommand: string;
	buildCommand: string;
	/** Inlined content of context files, formatted as fenced code blocks */
	contextFiles?: string;
	/** Formatted list of attachment descriptions */
	attachmentDescriptions?: string;
}
