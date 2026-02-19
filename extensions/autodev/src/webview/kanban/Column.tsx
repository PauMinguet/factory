/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import type { Ticket, TicketStatus } from '../../extension/types/ticket';
import { TicketCard } from './TicketCard';

interface ColumnProps {
	status: TicketStatus;
	label: string;
	icon: string;
	tickets: Ticket[];
	isDragTarget: boolean;
	/** Maps ticketId → progress percentage for running tickets. */
	progressMap: ReadonlyMap<string, number>;
	onExecute(ticketId: string): void;
	onCancel(ticketId: string): void;
	onDelete(ticketId: string): void;
	onOpenDetail(ticketId: string): void;
	onDragStart(ticketId: string): void;
	onDragOver(e: React.DragEvent): void;
	onDrop(status: TicketStatus): void;
	onDragLeave(): void;
}

export function Column({
	status,
	label,
	icon,
	tickets,
	isDragTarget,
	progressMap,
	onExecute,
	onCancel,
	onDelete,
	onOpenDetail,
	onDragStart,
	onDragOver,
	onDrop,
	onDragLeave,
}: ColumnProps): React.ReactElement {
	return (
		<div
			className={`kanban-column kanban-column--${status} ${isDragTarget ? 'kanban-column--drop-target' : ''}`}
			onDragOver={onDragOver}
			onDrop={() => onDrop(status)}
			onDragLeave={onDragLeave}
		>
			<div className="kanban-column__header">
				<span className="kanban-column__icon">{icon}</span>
				<span className="kanban-column__label">{label}</span>
				{tickets.length > 0 && (
					<span className="kanban-column__count">{tickets.length}</span>
				)}
			</div>
			<div className="kanban-column__cards">
				{tickets.map(ticket => (
					<TicketCard
						key={ticket.id}
						ticket={ticket}
						progress={progressMap.get(ticket.id)}
						onExecute={onExecute}
						onCancel={onCancel}
						onDelete={onDelete}
						onOpenDetail={onOpenDetail}
						onDragStart={onDragStart}
					/>
				))}
				{tickets.length === 0 && (
					<div className={`kanban-column__empty ${isDragTarget ? 'kanban-column__empty--highlight' : ''}`}>
						{isDragTarget ? 'Drop here' : 'No tickets'}
					</div>
				)}
			</div>
		</div>
	);
}
