# AutoDev Studio — Product Specification

## A VS Code Fork for Autonomous AI-Powered Development

**Version:** 1.0 Draft
**Date:** February 18, 2026
**Author:** Pau — UnleashAI / Mentor126.ai

---

## 1. Executive Summary

AutoDev Studio is a fork of VS Code that transforms the editor into an autonomous AI development workstation. It combines a visual kanban-style ticket manager, an integrated local agent orchestrator, and a Claude Code execution engine — all within the familiar VS Code shell. Users describe features in plain English, the system generates plans and PRDs, then autonomously writes code, runs tests, creates branches, and produces merge-ready pull requests — all while the user is away.

**Core thesis:** The best AI development tool isn't a separate web app that talks to your codebase — it's your editor, extended to orchestrate autonomous work natively.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   AutoDev Studio (VS Code Fork)          │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐            │
│  │  Kanban   │  │  Ticket  │  │ Analytics  │  ← Webview │
│  │  Board    │  │  Detail  │  │ Dashboard  │    Panels  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘            │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼──────┐            │
│  │         AutoDev Extension Host          │            │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ │            │
│  │  │ Project  │ │  Ticket  │ │ Template │ │            │
│  │  │ Manager  │ │  Engine  │ │  Engine  │ │            │
│  │  └─────────┘ └──────────┘ └──────────┘ │            │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ │            │
│  │  │   Git    │ │  Agent   │ │   Log    │ │            │
│  │  │ Manager  │ │ Orch.    │ │ Streamer │ │            │
│  │  └─────────┘ └──────────┘ └──────────┘ │            │
│  └─────────────────┬───────────────────────┘            │
│                    │                                    │
└────────────────────┼────────────────────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │     Local Agent Runtime     │
        │                             │
        │  ┌───────────────────────┐  │
        │  │  Job Queue (SQLite)   │  │
        │  └───────────┬───────────┘  │
        │              │              │
        │  ┌───────────▼───────────┐  │
        │  │  Worker Pool          │  │
        │  │  ┌─────┐ ┌─────┐     │  │
        │  │  │ W-1 │ │ W-2 │ ... │  │
        │  │  └──┬──┘ └──┬──┘     │  │
        │  └─────┼───────┼────────┘  │
        │        │       │           │
        │  ┌─────▼───────▼────────┐  │
        │  │  Claude Code CLI     │  │
        │  │  (User's own sub)    │  │
        │  └──────────────────────┘  │
        │                             │
        │  ┌──────────────────────┐  │
        │  │  Git Worktree Pool   │  │
        │  │  /worktrees/ticket-* │  │
        │  └──────────────────────┘  │
        └─────────────────────────────┘
```

### Key Architectural Decisions

1. **VS Code fork, not extension-only.** We fork VS Code to own the sidebar, activity bar, and default panel layout. The kanban board becomes a first-class citizen, not a webview fighting for space.
2. **Local-first execution.** All agent work runs on the user's machine. No cloud servers required beyond Claude's API (via Claude Code CLI). Data stays local in SQLite.
3. **Claude Code as the engine.** We don't reinvent agentic coding. We orchestrate Claude Code sessions in isolated git worktrees, feeding them plans and capturing their output.
4. **Git worktrees for isolation.** Every ticket gets its own worktree and branch. Multiple tickets execute in parallel without conflicts.

---

## 3. Data Model

### 3.1 Project

```typescript
interface Project {
	id: string; // UUID
	name: string; // "My SaaS App"
	repoPath: string; // /Users/pau/code/my-saas
	defaultBranch: string; // "main"
	worktreeRoot: string; // /Users/pau/code/my-saas/.worktrees
	createdAt: Date;
	settings: ProjectSettings;
}

interface ProjectSettings {
	maxParallelJobs: number; // Default: 2
	defaultPlanTemplate: string; // Template ID
	autoExecuteAfterPlan: boolean; // Skip review step
	testCommand?: string; // "npm test", "pytest", etc.
	buildCommand?: string; // "npm run build"
	lintCommand?: string; // "npm run lint"
	claudeCodePath?: string; // Custom claude-code binary path
	contextFiles?: string[]; // Always-include files for Claude context
}
```

### 3.2 Ticket

```typescript
interface Ticket {
	id: string; // UUID
	projectId: string; // FK → Project
	title: string; // "Add dark mode"
	description: string; // Full description in plain English
	status: TicketStatus;
	planType: PlanType;
	plan?: string; // Generated PRD / plan markdown
	branch?: string; // "autodev/ticket-abc123-dark-mode"
	worktreePath?: string; // Resolved worktree path
	attachments: Attachment[]; // Screenshots, designs, reference files
	executionLog: string[]; // Streamed log lines
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	error?: string;
	metadata: {
		tokensUsed?: number;
		costEstimate?: number;
		filesChanged?: string[];
		testsWritten?: number;
		testsPassed?: boolean;
		commitSha?: string;
	};
}

type TicketStatus =
	| "backlog" // Created, not started
	| "planning" // Generating plan/PRD
	| "plan_review" // Plan ready for human review
	| "queued" // Approved, waiting for worker
	| "in_progress" // Claude Code is executing
	| "testing" // Running tests/validation
	| "completed" // Done, branch ready for review
	| "failed" // Execution failed
	| "merged"; // Branch merged to main

type PlanType =
	| "prd" // Full product requirements document
	| "simple_plan" // Lightweight plan
	| "analysis" // Analyze codebase for feasibility
	| "bug_fix" // Bug investigation + fix
	| "test" // Write tests for existing code
	| "direct" // Skip planning, execute immediately
	| "refactor"; // Code improvement / refactor
```

### 3.3 Template

```typescript
interface PlanTemplate {
	id: string;
	name: string; // "Full PRD"
	type: PlanType;
	systemPrompt: string; // The prompt template
	variables: TemplateVariable[]; // Dynamic slots
	isDefault: boolean;
	createdAt: Date;
}

interface TemplateVariable {
	name: string; // "{{PROJECT_NAME}}"
	description: string;
	source: "project" | "ticket" | "user_input" | "auto";
}
```

### 3.4 Execution Job

```typescript
interface ExecutionJob {
	id: string;
	ticketId: string;
	phase: "plan" | "execute" | "test" | "fix";
	status: "pending" | "running" | "completed" | "failed";
	workerPid?: number;
	claudeSessionId?: string;
	startedAt?: Date;
	completedAt?: Date;
	exitCode?: number;
	logPath: string; // Path to full log file
}
```

### 3.5 Storage

All data lives in a local SQLite database at `~/.autodev-studio/autodev.db`. Logs are stored as files under `~/.autodev-studio/logs/{ticketId}/`. This keeps everything portable and inspectable.

---

## 4. Core Subsystems

### 4.1 Agent Orchestrator

The orchestrator is the heart of the system. It's a long-running Node.js process (spawned by the extension host) that manages the job queue and worker pool.

```
                ┌──────────────────┐
                │   Orchestrator   │
                │                  │
  Ticket ──────▶│  Job Scheduler   │
  created/      │       │          │
  approved      │       ▼          │
                │  ┌──────────┐    │
                │  │ Worker 1 │────┼──▶ Claude Code (worktree A)
                │  └──────────┘    │
                │  ┌──────────┐    │
                │  │ Worker 2 │────┼──▶ Claude Code (worktree B)
                │  └──────────┘    │
                │       ...        │
                └──────────────────┘
```

**Lifecycle of a ticket execution:**

1. **Plan phase** — Orchestrator spawns Claude Code in the project repo (main branch) with the plan template + ticket description. Claude Code analyzes the codebase and outputs a plan as markdown. Ticket moves to `plan_review`.

2. **Review gate** — If `autoExecuteAfterPlan` is off, the ticket waits in `plan_review` for the user to approve/edit. If on, it skips straight to execution.

3. **Worktree setup** — Orchestrator creates a new git worktree:

   ```bash
   git worktree add .worktrees/ticket-{id} -b autodev/ticket-{id}-{slug} {defaultBranch}
   ```

4. **Execute phase** — Claude Code is spawned inside the worktree directory with the approved plan as its prompt. It writes code, creates files, runs commands, iterates on failures.

5. **Test phase** — After Claude Code signals completion, the orchestrator runs the project's test/build/lint commands in the worktree. If tests fail, it feeds the errors back to Claude Code for a fix cycle (up to 3 retries).

6. **Completion** — Ticket moves to `completed`. Worktree stays in place for user review. Commits are ready for PR.

**Worker spawning via Claude Code CLI:**

```typescript
// Simplified worker execution
async function executeInWorktree(
	job: ExecutionJob,
	ticket: Ticket,
	project: Project,
) {
	const worktreePath = path.join(project.worktreeRoot, `ticket-${ticket.id}`);

	// Build the prompt from template + plan
	const prompt = buildPrompt(ticket, project);

	// Spawn Claude Code in the worktree
	const proc = spawn(
		"claude",
		[
			"--print", // Non-interactive mode
			"--output-format",
			"stream-json", // Structured streaming output
			"--max-turns",
			"50", // Safety limit
			prompt,
		],
		{
			cwd: worktreePath,
			env: { ...process.env, CLAUDE_CODE_TRUST: "allow-read-write" },
		},
	);

	// Stream output to log file and UI
	proc.stdout.on("data", (chunk) => {
		appendLog(job.logPath, chunk);
		emitToUI("job:log", { ticketId: ticket.id, data: chunk.toString() });
	});

	return new Promise((resolve, reject) => {
		proc.on("exit", (code) => {
			code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
		});
	});
}
```

### 4.2 Git Manager

Handles all git operations. Keeps worktrees clean and isolated.

```typescript
class GitManager {
	// Create isolated worktree for a ticket
	async createWorktree(project: Project, ticket: Ticket): Promise<string>;

	// Clean up worktree after merge or abandonment
	async removeWorktree(project: Project, ticket: Ticket): Promise<void>;

	// Get diff summary for completed ticket
	async getChangeSummary(worktreePath: string): Promise<ChangeSummary>;

	// Create PR-ready branch with squashed/organized commits
	async prepareBranch(worktreePath: string, ticket: Ticket): Promise<void>;

	// Merge completed branch into default branch
	async mergeBranch(project: Project, ticket: Ticket): Promise<void>;

	// List all active worktrees
	async listWorktrees(project: Project): Promise<WorktreeInfo[]>;
}
```

### 4.3 Template Engine

Templates are markdown files with variable interpolation. Users can edit them in-editor (they're just files on disk).

**Default templates ship with the fork:**

```
~/.autodev-studio/templates/
  ├── prd.md                  # Full PRD generation
  ├── simple-plan.md          # Lightweight plan
  ├── analysis.md             # Codebase analysis
  ├── bug-fix.md              # Bug investigation
  ├── test-gen.md             # Test writing
  ├── direct-execute.md       # Skip planning
  └── refactor.md             # Code improvement
```

**Example PRD template (abbreviated):**

```markdown
You are a senior software engineer. Analyze the codebase and create a detailed
implementation plan for the following feature:

## Feature Request

{{TICKET_TITLE}}

{{TICKET_DESCRIPTION}}

## Project Context

- Repository: {{PROJECT_NAME}}
- Language/Framework: {{AUTO_DETECTED_STACK}}
- Test framework: {{TEST_COMMAND}}

## Your Task

1. Analyze the existing codebase structure
2. Identify all files that need modification
3. Outline the implementation step by step
4. Specify any new dependencies required
5. Describe test cases to validate the feature

{{#ATTACHMENTS}}

## Reference Materials

{{ATTACHMENT_DESCRIPTIONS}}
{{/ATTACHMENTS}}

Output your plan as structured markdown.
```

### 4.4 Log Streamer

Real-time log streaming from Claude Code workers to the UI.

```typescript
class LogStreamer extends EventEmitter {
	// Watch a job's log file and emit lines
	watch(jobId: string, logPath: string): void;

	// Get historical logs for a completed job
	getHistory(jobId: string): Promise<string[]>;

	// Aggregate stats from structured log output
	getStats(jobId: string): Promise<JobStats>;
}
```

The UI subscribes via VS Code's webview messaging:

```
Extension Host  ──message──▶  Webview (Kanban/Detail panel)
     │                              │
     │  { type: 'log:line',         │
     │    ticketId: '...',          │
     │    line: 'Creating file...'  │
     │  }                           │
     │                              │
```

---

## 5. UI Design

### 5.1 Layout

The fork modifies VS Code's default layout to include AutoDev as a first-class panel system:

```
┌────────────────────────────────────────────────────────────────┐
│  Menu Bar                                             □ ▣ ✕  │
├────┬───────────────────────────────────────────────────────────┤
│    │  Tab Bar: [Kanban Board] [Analytics] [editor tabs...]    │
│ A  ├──────────────────────────────────────────────────────────┤
│ C  │                                                          │
│ T  │                    MAIN EDITOR AREA                      │
│ I  │                                                          │
│ V  │    (When Kanban tab active, shows the board)             │
│ I  │    (When file tab active, shows normal editor)           │
│ T  │                                                          │
│ Y  ├──────────────────────────────────────────────────────────┤
│    │  BOTTOM PANEL                                            │
│ B  │  [Terminal] [Problems] [Live Logs] [Output]              │
│ A  │                                                          │
│ R  │  Live Logs shows real-time Claude Code output            │
│    │  for the selected/active ticket                          │
├────┴──────────────────────────────────────────────────────────┤
│  Status Bar: 🤖 2 jobs running │ ✅ 3 completed │ ⏳ 1 queued │
└────────────────────────────────────────────────────────────────┘
```

**Activity Bar additions:**

| Icon | View                     |
| ---- | ------------------------ |
| 📋   | Kanban Board (main view) |
| 📊   | Analytics Dashboard      |
| 📁   | Project Manager          |
| 📝   | Template Editor          |

### 5.2 Kanban Board

The kanban is a webview panel rendered with React, styled to match VS Code's theme tokens.

```
┌─────────────────────────────────────────────────────────────┐
│  🔽 Project: My SaaS App ▾     [+ New Ticket]   [⚙ Settings]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  BACKLOG      PLANNING     IN REVIEW    IN PROGRESS  DONE  │
│  ─────────   ──────────   ──────────   ───────────  ────── │
│  ┌────────┐  ┌────────┐  ┌────────┐   ┌────────┐  ┌──────┐│
│  │Add SSO │  │Mobile  │  │        │   │Dark    │  │Redis ││
│  │        │  │Resp.   │  │        │   │Mode    │  │Cache ││
│  │ 📝 PRD │  │ ⏳ Gen. │  │        │   │ 🔄 Run │  │ ✅ 4m ││
│  └────────┘  └────────┘  │        │   │ ██░░ 2m│  └──────┘│
│  ┌────────┐              │        │   └────────┘  ┌──────┐│
│  │Fix nav │              │        │   ┌────────┐  │Auth  ││
│  │bug     │              │        │   │BG Red  │  │Flow  ││
│  │ 🐛 Bug │              │        │   │ 🔄 Run │  │ ✅ 7m ││
│  └────────┘              │        │   │ █░░░ 1m│  └──────┘│
│                          │        │   └────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Ticket card states:**

| Badge | Meaning                                      |
| ----- | -------------------------------------------- |
| 📝    | Waiting (backlog, has plan type assigned)    |
| ⏳    | Plan generating                              |
| 👁️    | Plan ready for review                        |
| 🔄    | Executing (with elapsed time + progress bar) |
| ✅    | Completed (with total execution time)        |
| ❌    | Failed (click to see error)                  |
| 🔀    | Merged                                       |

**Drag-and-drop:** Tickets can be dragged between columns. Moving a ticket to "In Progress" triggers execution. Moving back to "Backlog" cancels the job.

### 5.3 Ticket Detail View

Opens as a webview editor tab when a ticket card is clicked.

```
┌────────────────────────────────────────────────────────────┐
│  ← Back to Board                                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Add dark mode                              STATUS: 🔄 │  │
│  │ Project: My SaaS App                                  │  │
│  │ Branch: autodev/ticket-abc123-dark-mode               │  │
│  │ Created: 2 hours ago   Started: 45 min ago            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [Description] [Plan] [Live Log] [Changes] [Actions]       │
│  ──────────────────────────────────────────────────────     │
│                                                            │
│  ┌─ PLAN TAB ───────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  ## Implementation Plan                               │  │
│  │                                                       │  │
│  │  ### 1. Create Theme Provider                         │  │
│  │  - Add ThemeContext with light/dark tokens             │  │
│  │  - Wrap app root in provider                          │  │
│  │                                                       │  │
│  │  ### 2. CSS Variable System                           │  │
│  │  - Define CSS custom properties for both themes       │  │
│  │  - Replace hard-coded colors                          │  │
│  │                                                       │  │
│  │  ### 3. Toggle Component                              │  │
│  │  - Add toggle to settings page                        │  │
│  │  - Persist preference in localStorage                 │  │
│  │                                                       │  │
│  │  [✏️ Edit Plan]  [▶️ Execute Plan]  [🗑️ Regenerate]    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ LIVE LOG TAB ───────────────────────────────────────┐  │
│  │  14:23:01  Analyzing project structure...             │  │
│  │  14:23:05  Found: React + TypeScript + Tailwind       │  │
│  │  14:23:08  Creating src/contexts/ThemeContext.tsx      │  │
│  │  14:23:12  Writing theme tokens...                    │  │
│  │  14:23:15  Modifying src/App.tsx...                   │  │
│  │  14:23:20  Running: npm test                          │  │
│  │  14:23:35  ✅ 42 tests passed                         │  │
│  │  ▊                                                    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ CHANGES TAB ────────────────────────────────────────┐  │
│  │  5 files changed, 142 insertions, 12 deletions        │  │
│  │                                                       │  │
│  │  M  src/App.tsx                         (+8, -2)      │  │
│  │  A  src/contexts/ThemeContext.tsx        (+45)         │  │
│  │  M  src/components/Settings.tsx          (+32, -5)     │  │
│  │  M  src/styles/globals.css              (+48, -5)      │  │
│  │  A  src/__tests__/dark-mode.test.tsx    (+9)           │  │
│  │                                                       │  │
│  │  [View Full Diff]  [Open in Editor]  [Checkout Branch] │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ ACTIONS ────────────────────────────────────────────┐  │
│  │  [Checkout Branch]  [Create PR]  [Merge to Main]      │  │
│  │  [Re-execute]  [Delete Ticket]                        │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 5.4 New Ticket Modal

Triggered by [+ New Ticket] button. Opens as a VS Code Quick Input wizard or an inline webview form.

```
┌─────────────────────────────────────────────┐
│  New Ticket                                  │
│                                              │
│  Project:  [My SaaS App ▾]                   │
│                                              │
│  Title:    [Add dark mode support       ]    │
│                                              │
│  Description:                                │
│  ┌────────────────────────────────────────┐  │
│  │ Add a dark mode toggle to the app.    │  │
│  │ It should respect system preferences  │  │
│  │ and persist the user's choice.        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Plan Type:                                  │
│  ○ Full PRD       ○ Simple Plan              │
│  ○ Analysis       ○ Bug Fix                  │
│  ○ Test Gen       ● Direct Execute           │
│  ○ Refactor                                  │
│                                              │
│  Attachments:  [+ Add Screenshot/File]       │
│    📎 design-mockup.png                      │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  [Save to Backlog]                    │    │
│  │  [Save & Generate Plan]               │    │
│  │  [Save & Execute Now]                 │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### 5.5 Analytics Dashboard

Webview panel accessible from the activity bar.

```
┌────────────────────────────────────────────────────────────┐
│  📊 Analytics                     Project: [All ▾]         │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Total Jobs: 47   │  │  Success Rate    │               │
│  │  This Week: 12    │  │     91.4%        │               │
│  └──────────────────┘  └──────────────────┘               │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Avg Time: 4.2m   │  │  Tokens Used     │               │
│  │  Median: 3.1m     │  │  1.2M this week  │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                            │
│  ┌─ Execution Volume Over Time ─────────────────────────┐  │
│  │  12│        ╭─╮                                       │  │
│  │  10│     ╭──╯ │  ╭╮                                   │  │
│  │   8│  ╭──╯    ╰──╯╰─╮                                │  │
│  │   6│──╯              ╰──╮                             │  │
│  │   4│                    ╰──                           │  │
│  │   2│                                                  │  │
│  │    └──────────────────────────────                    │  │
│  │     Mon  Tue  Wed  Thu  Fri  Sat  Sun                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ Recent Executions ──────────────────────────────────┐  │
│  │  Ticket              Status   Duration  Files  Tests  │  │
│  │  Dark mode           ✅       4m 12s    5      3/3   │  │
│  │  Redis cache         ✅       7m 01s    8      5/5   │  │
│  │  Fix nav bug         ❌       2m 33s    -      0/2   │  │
│  │  Auth flow           ✅       6m 44s    12     8/8   │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 5.6 Template Editor

Opens templates as editable markdown files in the normal editor with a preview pane showing variable interpolation.

```
┌────────────────────────────┬─────────────────────────────┐
│  prd.md (editing)          │  Preview (with sample data)  │
│                            │                              │
│  You are a senior...       │  You are a senior...         │
│                            │                              │
│  ## Feature Request        │  ## Feature Request          │
│  {{TICKET_TITLE}}          │  Add dark mode               │
│                            │                              │
│  {{TICKET_DESCRIPTION}}    │  Add a dark mode toggle to   │
│                            │  the application...          │
│  ## Project Context        │                              │
│  - Repo: {{PROJECT_NAME}} │  ## Project Context           │
│  - Stack: {{AUTO_...}}     │  - Repo: My SaaS App         │
│                            │  - Stack: React + TypeScript  │
└────────────────────────────┴─────────────────────────────┘
```

### 5.7 Status Bar

Always visible at the bottom of VS Code:

```
🤖 AutoDev: 2 running │ ✅ 12 completed │ ⏳ 1 queued │ 📋 My SaaS App
```

Clicking it opens a quick-pick menu with running jobs and shortcuts.

### 5.8 VS Code Theme Integration

All webview UIs use VS Code's CSS custom properties so they respect the user's theme:

```css
.ticket-card {
	background: var(--vscode-editor-background);
	color: var(--vscode-editor-foreground);
	border: 1px solid var(--vscode-panel-border);
}

.ticket-card:hover {
	background: var(--vscode-list-hoverBackground);
}

.status-badge.running {
	color: var(--vscode-debugIcon-startForeground);
}

.status-badge.completed {
	color: var(--vscode-testing-iconPassed);
}

.status-badge.failed {
	color: var(--vscode-testing-iconFailed);
}
```

---

## 6. Command Palette Integration

Register these commands so power users can drive everything from the keyboard:

| Command                            | Description                     |
| ---------------------------------- | ------------------------------- |
| `AutoDev: New Ticket`              | Open new ticket form            |
| `AutoDev: Open Board`              | Focus kanban board              |
| `AutoDev: Show Running Jobs`       | Quick pick of active jobs       |
| `AutoDev: View Ticket Logs`        | Open live log for a ticket      |
| `AutoDev: Checkout Ticket Branch`  | Switch to a ticket's worktree   |
| `AutoDev: Execute Selected Ticket` | Start execution on selected     |
| `AutoDev: Cancel Job`              | Cancel a running job            |
| `AutoDev: Open Analytics`          | Show analytics dashboard        |
| `AutoDev: Edit Templates`          | Open template directory         |
| `AutoDev: Add Project`             | Register a new project          |
| `AutoDev: Merge Ticket`            | Merge completed ticket to main  |
| `AutoDev: Create PR`               | Push branch + open PR on GitHub |

---

## 7. Detailed Execution Flow

### 7.1 Plan Generation

```
User clicks "Save & Generate Plan"
        │
        ▼
Ticket created (status: 'planning')
        │
        ▼
Orchestrator picks up job
        │
        ▼
Load plan template for ticket.planType
        │
        ▼
Interpolate variables:
  - {{TICKET_TITLE}} → ticket.title
  - {{TICKET_DESCRIPTION}} → ticket.description
  - {{PROJECT_NAME}} → project.name
  - {{AUTO_DETECTED_STACK}} → auto-detect from package.json, etc.
  - {{TEST_COMMAND}} → project.settings.testCommand
  - {{CONTEXT_FILES}} → read project.settings.contextFiles
        │
        ▼
Spawn Claude Code in project root:
  claude --print --output-format stream-json \
    "Based on the following project, generate a plan: ..."
        │
        ▼
Capture output → ticket.plan (markdown)
        │
        ▼
Ticket status → 'plan_review'
        │
        ▼
Notification: "Plan ready for: Add dark mode"
```

### 7.2 Code Execution

```
User clicks "Execute Plan" (or auto-execute)
        │
        ▼
Ticket status → 'queued'
        │
        ▼
Orchestrator checks worker pool capacity
        │
        ▼
If slot available:
  ├── Create git worktree
  │     git worktree add .worktrees/ticket-{id} \
  │       -b autodev/ticket-{id}-{slug} main
  │
  ├── Build execution prompt:
  │     "You are implementing the following feature in this codebase.
  │      Here is the plan: {ticket.plan}
  │      Requirements: {ticket.description}
  │      When done, ensure all tests pass: {testCommand}
  │      Commit your changes with clear messages."
  │
  ├── Spawn Claude Code in worktree:
  │     claude --print --output-format stream-json \
  │       --allowedTools "Edit,Write,Bash,Read" \
  │       "{prompt}"
  │
  ├── Stream logs to UI in real-time
  │
  ├── On Claude Code exit (code 0):
  │     ├── Run test command in worktree
  │     ├── If tests pass → status: 'completed'
  │     ├── If tests fail → feed errors back to Claude Code
  │     │     (up to 3 retry cycles)
  │     └── If retries exhausted → status: 'failed'
  │
  └── On Claude Code exit (code ≠ 0):
        └── status: 'failed', capture error
```

### 7.3 Parallel Execution

Multiple tickets across multiple projects can run simultaneously. The orchestrator respects `maxParallelJobs` per project and a global limit.

```typescript
class Orchestrator {
	private globalMaxWorkers = 4; // Total concurrent Claude Code sessions
	private workers: Map<string, Worker> = new Map();
	private queue: PriorityQueue<ExecutionJob>;

	async tick() {
		// Check for available capacity
		while (this.workers.size < this.globalMaxWorkers && !this.queue.isEmpty()) {
			const job = this.queue.dequeue();
			const project = await getProject(job.projectId);

			// Respect per-project limits
			const projectWorkers = [...this.workers.values()].filter(
				(w) => w.projectId === project.id,
			).length;

			if (projectWorkers < project.settings.maxParallelJobs) {
				this.spawnWorker(job);
			} else {
				this.queue.requeue(job); // Put back, try next
			}
		}
	}
}
```

---

## 8. Extension API Surface

### 8.1 Messages (Extension Host ↔ Webview)

```typescript
// Extension → Webview
type ExtensionMessage =
	| { type: "state:update"; tickets: Ticket[]; projects: Project[] }
	| { type: "log:line"; ticketId: string; line: string; timestamp: string }
	| { type: "ticket:statusChanged"; ticketId: string; status: TicketStatus }
	| { type: "job:progress"; ticketId: string; phase: string; pct: number }
	| { type: "notification"; level: "info" | "warn" | "error"; message: string };

// Webview → Extension
type WebviewMessage =
	| { type: "ticket:create"; data: CreateTicketInput }
	| { type: "ticket:move"; ticketId: string; status: TicketStatus }
	| { type: "ticket:execute"; ticketId: string }
	| { type: "ticket:cancel"; ticketId: string }
	| { type: "ticket:updatePlan"; ticketId: string; plan: string }
	| { type: "ticket:delete"; ticketId: string }
	| { type: "ticket:merge"; ticketId: string }
	| { type: "ticket:openDiff"; ticketId: string }
	| { type: "ticket:checkoutBranch"; ticketId: string }
	| { type: "project:select"; projectId: string }
	| { type: "analytics:refresh" };
```

### 8.2 SQLite Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  worktree_root TEXT,
  settings_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  plan_type TEXT NOT NULL DEFAULT 'simple_plan',
  plan TEXT,
  branch TEXT,
  worktree_path TEXT,
  error TEXT,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE execution_jobs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  worker_pid INTEGER,
  log_path TEXT,
  exit_code INTEGER,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT REFERENCES tickets(id),
  project_id TEXT REFERENCES projects(id),
  event_type TEXT NOT NULL,
  data_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_project ON tickets(project_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_jobs_ticket ON execution_jobs(ticket_id);
CREATE INDEX idx_analytics_time ON analytics_events(created_at);
```

---

## 9. Project Structure

```
autodev-studio/
├── src/
│   ├── extension/                    # VS Code extension host code
│   │   ├── extension.ts              # Activation, command registration
│   │   ├── commands/                 # Command handlers
│   │   │   ├── newTicket.ts
│   │   │   ├── executeTicket.ts
│   │   │   ├── mergeTicket.ts
│   │   │   └── ...
│   │   ├── providers/                # VS Code providers
│   │   │   ├── kanbanViewProvider.ts
│   │   │   ├── analyticsViewProvider.ts
│   │   │   ├── statusBarProvider.ts
│   │   │   └── ticketDetailProvider.ts
│   │   ├── services/                 # Core logic
│   │   │   ├── orchestrator.ts       # Job scheduling + worker pool
│   │   │   ├── gitManager.ts         # Worktree + branch operations
│   │   │   ├── templateEngine.ts     # Prompt template processing
│   │   │   ├── logStreamer.ts        # Real-time log forwarding
│   │   │   ├── database.ts          # SQLite wrapper
│   │   │   ├── projectDetector.ts   # Auto-detect stack/tools
│   │   │   └── claudeCodeRunner.ts  # Claude Code CLI wrapper
│   │   └── types/                   # TypeScript interfaces
│   │       ├── ticket.ts
│   │       ├── project.ts
│   │       └── messages.ts
│   │
│   └── webview/                     # React webview UIs
│       ├── kanban/
│       │   ├── KanbanBoard.tsx
│       │   ├── TicketCard.tsx
│       │   ├── Column.tsx
│       │   ├── NewTicketModal.tsx
│       │   └── kanban.css
│       ├── ticket-detail/
│       │   ├── TicketDetail.tsx
│       │   ├── PlanEditor.tsx
│       │   ├── LiveLog.tsx
│       │   ├── ChangesSummary.tsx
│       │   └── detail.css
│       ├── analytics/
│       │   ├── AnalyticsDashboard.tsx
│       │   ├── charts/
│       │   └── analytics.css
│       ├── templates/
│       │   ├── TemplateEditor.tsx
│       │   └── TemplatePreview.tsx
│       └── shared/
│           ├── useVSCodeApi.ts       # Messaging hook
│           ├── theme.css             # VS Code theme variables
│           └── components/
│
├── templates/                        # Default plan templates
│   ├── prd.md
│   ├── simple-plan.md
│   ├── analysis.md
│   ├── bug-fix.md
│   ├── test-gen.md
│   ├── direct-execute.md
│   └── refactor.md
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│   └── build-fork.sh                # VS Code fork build script
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 10. Settings & Configuration

### 10.1 VS Code Settings (settings.json)

```jsonc
{
	// Global
	"autodev.maxParallelJobs": 4,
	"autodev.claudeCodePath": "/usr/local/bin/claude",
	"autodev.dataDir": "~/.autodev-studio",
	"autodev.logRetentionDays": 30,

	// Notifications
	"autodev.notifications.onPlanReady": true,
	"autodev.notifications.onJobComplete": true,
	"autodev.notifications.onJobFailed": true,
	"autodev.notifications.sound": false,

	// Execution defaults
	"autodev.defaults.planType": "simple_plan",
	"autodev.defaults.autoExecuteAfterPlan": false,
	"autodev.defaults.maxRetries": 3,
	"autodev.defaults.claudeMaxTurns": 50,

	// Git
	"autodev.git.branchPrefix": "autodev/",
	"autodev.git.autoCleanWorktrees": true,
	"autodev.git.cleanAfterDays": 7,
}
```

---

## 11. Notification System

| Event         | Notification Type     | Content                                     |
| ------------- | --------------------- | ------------------------------------------- |
| Plan ready    | Info toast + badge    | "Plan ready for: {title}"                   |
| Job completed | Success toast + badge | "✅ {title} completed in {time}"            |
| Job failed    | Error toast + badge   | "❌ {title} failed: {summary}"              |
| Tests failing | Warning toast         | "⚠️ Tests failing for {title}, retrying..." |
| Queue full    | Info toast            | "Job queued. {n} jobs ahead."               |

All notifications are clickable and navigate to the ticket detail view.

---

## 12. Security Considerations

1. **No cloud dependency.** All data stored locally. No account, no tokens (beyond Claude Code's own auth).
2. **Claude Code trust model.** We run Claude Code with `allow-read-write` scoped to the worktree directory only. No network access by default.
3. **Branch isolation.** Worktrees prevent any ticket from modifying the main branch directly. All changes require explicit merge.
4. **Audit trail.** Every Claude Code session is fully logged. Users can replay exactly what the agent did.
5. **No credential exposure.** Templates and prompts never include API keys or secrets. If `.env` files exist, they're `.gitignored` by default.

---

## 13. Build & Distribution

### 13.1 Fork Strategy

We fork VS Code's `main` branch and maintain a minimal patch set:

1. **Activity bar customization** — Add AutoDev icons to the default activity bar configuration
2. **Welcome tab** — Replace default welcome with AutoDev onboarding
3. **Default layout** — Pre-configure panel layout with Live Logs tab
4. **Branding** — Custom icon, splash screen, product name
5. **Bundled extension** — The AutoDev extension is pre-installed and cannot be disabled

Everything else (the kanban, detail views, analytics, orchestrator) lives in the bundled extension and is maintained separately from the fork.

### 13.2 Build Pipeline

```bash
# 1. Sync fork with upstream VS Code
git fetch upstream && git rebase upstream/main

# 2. Apply AutoDev patches
git am patches/*.patch

# 3. Build VS Code
yarn && yarn compile

# 4. Build AutoDev extension
cd extensions/autodev && npm run build

# 5. Package for distribution
node build/electron-builder.js --mac --win --linux
```

### 13.3 Distribution

| Platform | Format                         |
| -------- | ------------------------------ |
| macOS    | `.dmg` + auto-update           |
| Windows  | `.exe` installer + auto-update |
| Linux    | `.AppImage` + `.deb`           |

---

## 14. Implementation Phases

### Phase 1 — Core Loop (Weeks 1–3)

- SQLite database + data model
- Project registration (add/remove repos)
- Ticket CRUD (create, update status, delete)
- Claude Code runner (spawn, capture output, handle exit)
- Git worktree management (create, cleanup)
- Basic orchestrator (single job queue, one worker)
- Minimal webview: kanban board with columns and cards
- Status bar showing running jobs

**Milestone:** Create a ticket, generate a plan, execute it, see code on a branch.

### Phase 2 — UI Polish (Weeks 4–5)

- Full ticket detail view (description, plan, log, changes, actions)
- Live log streaming to webview
- New ticket modal with all plan types
- Drag-and-drop between kanban columns
- VS Code theme integration
- Command palette commands
- Notification toasts

**Milestone:** Complete workflow from ticket creation to branch checkout, all in the editor.

### Phase 3 — Power Features (Weeks 6–7)

- Parallel execution (multi-worker pool)
- Per-project job limits
- Template editor with preview
- Attachment support (screenshots, files)
- Test/build/lint validation after execution
- Retry loop on test failure
- Change summary view (file diff list)

**Milestone:** Run 4 tickets across 2 projects simultaneously with auto-test validation.

### Phase 4 — Analytics & Polish (Weeks 8–9)

- Analytics dashboard (charts, stats, history)
- Analytics event tracking throughout execution
- "Create PR" integration (GitHub CLI)
- "Merge to Main" action
- Worktree auto-cleanup for stale tickets
- Onboarding flow for first-time users
- Error recovery and edge case handling

**Milestone:** Full product parity with RalphBlaster. Ship beta.

### Phase 5 — Distribution (Week 10)

- VS Code fork build pipeline
- macOS / Windows / Linux packaging
- Auto-update mechanism
- Documentation and README
- Landing page

---

## 15. Open Questions

1. **Extension vs. fork trade-off.** A VS Code extension (no fork) would be far easier to distribute and maintain. The fork only buys us activity bar customization, branding, and default layout — all of which can be approximated with an extension. Consider shipping as an extension first, fork later.

2. **Claude Code API stability.** We depend heavily on Claude Code's CLI flags (`--print`, `--output-format stream-json`, `--allowedTools`). These may change. We should pin to a specific Claude Code version and test upgrades.

3. **Multi-machine sync.** Currently local-only. Future versions could sync state via a lightweight cloud layer or git-based state (store tickets as YAML in the repo itself).

4. **GitHub/GitLab integration.** Auto-creating PRs, linking to issues, posting status updates. This is a natural Phase 5+ feature.

5. **Cost visibility.** Claude Code doesn't expose token usage granularly. We may need to estimate costs from log output or wait for better API reporting.

6. **Context window management.** Large codebases may exceed Claude's context limits. We should investigate automatic chunking, file relevance scoring, and `.autodevignore` files to control what gets sent.
