/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project } from './project';
import type { Ticket, TicketStatus, CreateTicketInput } from './ticket';
import type { ExecutionJob } from './job';
import type { AnalyticsData } from './analytics';

// ── Extension Host → Webview ──────────────────────────────────────────────────

export type ExtensionMessage =
	// Kanban board messages
	| { type: 'state:update'; tickets: Ticket[]; projects: Project[] }
	| { type: 'log:line'; ticketId: string; line: string; timestamp: string }
	| { type: 'ticket:statusChanged'; ticketId: string; status: TicketStatus }
	| { type: 'job:progress'; ticketId: string; phase: string; pct: number }
	| { type: 'notification'; level: 'info' | 'warn' | 'error'; message: string }
	// Ticket detail panel messages
	| { type: 'detail:init'; ticket: Ticket; jobs: ExecutionJob[]; project: Project | undefined; initialTab?: string; logHistory?: Array<{ line: string; timestamp: string }> }
	| { type: 'detail:ticketUpdated'; ticket: Ticket }
	| { type: 'detail:log:line'; line: string; timestamp: string }
	| { type: 'detail:switchTab'; tab: string }
	| { type: 'detail:attachmentAdded'; ticketId: string; filename: string; filepath: string }
	// Template editor messages
	| { type: 'templates:init'; templates: Array<{ name: string; displayName: string; content: string }> }
	| { type: 'template:loaded'; name: string; content: string }
	| { type: 'template:saved'; name: string }
	| { type: 'template:reset:done'; name: string; content: string }
	// Analytics dashboard messages
	| { type: 'analytics:data'; data: AnalyticsData; projects: Project[]; selectedProjectId: string | null };

// ── Webview → Extension Host ──────────────────────────────────────────────────

export type WebviewMessage =
	// Kanban board messages
	| { type: 'ticket:create'; data: CreateTicketInput }
	| { type: 'ticket:move'; ticketId: string; status: TicketStatus }
	| { type: 'ticket:execute'; ticketId: string }
	| { type: 'ticket:cancel'; ticketId: string }
	| { type: 'ticket:updatePlan'; ticketId: string; plan: string }
	| { type: 'ticket:delete'; ticketId: string }
	| { type: 'ticket:merge'; ticketId: string }
	| { type: 'ticket:openDiff'; ticketId: string }
	| { type: 'ticket:checkoutBranch'; ticketId: string }
	| { type: 'ticket:openDetail'; ticketId: string; tab?: string }
	| { type: 'project:select'; projectId: string }
	| { type: 'analytics:refresh'; projectId?: string }
	// Ticket detail panel messages
	| { type: 'detail:execute'; ticketId: string }
	| { type: 'detail:cancel'; ticketId: string }
	| { type: 'detail:delete'; ticketId: string }
	| { type: 'detail:merge'; ticketId: string }
	| { type: 'detail:checkoutBranch'; ticketId: string }
	| { type: 'detail:updatePlan'; ticketId: string; plan: string }
	| { type: 'detail:openDiff'; ticketId: string }
	| { type: 'detail:regeneratePlan'; ticketId: string }
	| { type: 'detail:requestAttachment'; ticketId: string }
	| { type: 'detail:ready' }
	// Template editor messages
	| { type: 'template:load'; name: string }
	| { type: 'template:save'; name: string; content: string }
	| { type: 'template:reset'; name: string };
