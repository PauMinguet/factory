/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useEffect } from 'react';
import type { Project } from '../../extension/types/project';
import type { PlanType } from '../../extension/types/ticket';

interface NewTicketModalProps {
	projects: Project[];
	initialProjectId?: string;
	onClose(): void;
	onSaveBacklog(data: ModalFormData): void;
	onSavePlan(data: ModalFormData): void;
	onSaveExecute(data: ModalFormData): void;
}

export interface ModalFormData {
	projectId: string;
	title: string;
	description: string;
	planType: PlanType;
}

const PLAN_TYPES: Array<{ value: PlanType; label: string; description: string }> = [
	{ value: 'simple_plan', label: 'Simple Plan', description: 'Plan then execute — for new features or multi-step work' },
	{ value: 'prd', label: 'PRD', description: 'Full product spec — for large features needing a detailed requirements doc' },
	{ value: 'bug_fix', label: 'Bug Fix', description: 'Trace unknown root cause, fix it, add a regression test — for real bugs' },
	{ value: 'test', label: 'Test Generation', description: 'Write tests for an existing module' },
	{ value: 'analysis', label: 'Analysis', description: 'Read and report — no code changes made' },
	{ value: 'refactor', label: 'Refactor', description: 'Clean up and restructure existing code' },
	{ value: 'direct', label: 'Direct Execute', description: 'Skip planning, just do it — for simple, obvious tasks (add a file, fix a typo, small change)' },
];

export function NewTicketModal({
	projects,
	initialProjectId,
	onClose,
	onSaveBacklog,
	onSavePlan,
	onSaveExecute,
}: NewTicketModalProps): React.ReactElement {
	const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '');
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [planType, setPlanType] = useState<PlanType>('simple_plan');
	const [errors, setErrors] = useState<{ title?: string; description?: string; project?: string }>({});
	const [submitting, setSubmitting] = useState(false);

	// Close on Escape key
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { onClose(); }
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	const validate = (): boolean => {
		const newErrors: typeof errors = {};
		if (!projectId) { newErrors.project = 'Please select a project.'; }
		if (!title.trim()) { newErrors.title = 'Title is required.'; }
		if (!description.trim()) { newErrors.description = 'Description is required.'; }
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const formData = (): ModalFormData => ({
		projectId,
		title: title.trim(),
		description: description.trim(),
		planType,
	});

	const handleSaveBacklog = () => {
		if (!validate()) { return; }
		setSubmitting(true);
		onSaveBacklog(formData());
	};

	const handleSavePlan = () => {
		if (!validate()) { return; }
		setSubmitting(true);
		onSavePlan(formData());
	};

	const handleSaveExecute = () => {
		if (!validate()) { return; }
		setSubmitting(true);
		onSaveExecute(formData());
	};

	return (
		<div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { onClose(); } }}>
			<div className="modal-dialog" role="dialog" aria-modal="true" aria-label="New Ticket">
				<div className="modal-header">
					<h2 className="modal-title">New Ticket</h2>
					<button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
				</div>

				<div className="modal-body">
					{/* Project selector */}
					<div className="modal-field">
						<label className="modal-label" htmlFor="ntm-project">Project *</label>
						<select
							id="ntm-project"
							className={`modal-select ${errors.project ? 'modal-input--error' : ''}`}
							value={projectId}
							onChange={e => setProjectId(e.target.value)}
						>
							<option value="">Select a project...</option>
							{projects.map(p => (
								<option key={p.id} value={p.id}>{p.name}</option>
							))}
						</select>
						{errors.project && <span className="modal-error">{errors.project}</span>}
					</div>

					{/* Title */}
					<div className="modal-field">
						<label className="modal-label" htmlFor="ntm-title">Title *</label>
						<input
							id="ntm-title"
							type="text"
							className={`modal-input ${errors.title ? 'modal-input--error' : ''}`}
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="e.g. Add dark mode toggle to settings page"
							maxLength={200}
						/>
						{errors.title && <span className="modal-error">{errors.title}</span>}
					</div>

					{/* Description */}
					<div className="modal-field">
						<label className="modal-label" htmlFor="ntm-desc">Description *</label>
						<textarea
							id="ntm-desc"
							className={`modal-textarea ${errors.description ? 'modal-input--error' : ''}`}
							value={description}
							onChange={e => setDescription(e.target.value)}
							placeholder="Describe the task in detail — requirements, context, acceptance criteria..."
							rows={5}
						/>
						{errors.description && <span className="modal-error">{errors.description}</span>}
					</div>

					{/* Plan type */}
					<div className="modal-field">
						<label className="modal-label">Execution Template</label>
						<div className="modal-radio-group">
							{PLAN_TYPES.map(pt => (
								<label
									key={pt.value}
									className={`modal-radio-option ${planType === pt.value ? 'modal-radio-option--selected' : ''}`}
								>
									<input
										type="radio"
										name="planType"
										value={pt.value}
										checked={planType === pt.value}
										onChange={() => setPlanType(pt.value)}
									/>
									<span className="modal-radio-label">{pt.label}</span>
									<span className="modal-radio-desc">{pt.description}</span>
								</label>
							))}
						</div>
					</div>
				</div>

				<div className="modal-footer">
					<button className="modal-btn" onClick={onClose} disabled={submitting}>
						Cancel
					</button>
					<button
						className="modal-btn"
						onClick={handleSaveBacklog}
						disabled={submitting}
						title="Create ticket and save to backlog"
					>
						Save to Backlog
					</button>
					<button
						className="modal-btn modal-btn--secondary"
						onClick={handleSavePlan}
						disabled={submitting || planType === 'direct'}
						title="Create ticket and generate a plan for review"
					>
						Save &amp; Generate Plan
					</button>
					<button
						className="modal-btn modal-btn--primary"
						onClick={handleSaveExecute}
						disabled={submitting}
						title="Create ticket and execute immediately"
					>
						Save &amp; Execute Now
					</button>
				</div>
			</div>
		</div>
	);
}
