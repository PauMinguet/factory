# AutoDev Studio — Sprint Plan

**Version:** 1.0
**Date:** February 18, 2026
**Based on:** Product Specification v1.0

---

## Overview

This document translates the AutoDev Studio product specification into a concrete, sequenced sprint plan. Work is organized into **7 sprints** spanning ~11 weeks of development. Each sprint has a clear goal, a list of tasks, acceptance criteria, and known risks.

**Sprint length:** 1–2 weeks (noted per sprint)
**Team assumption:** 1–2 engineers

---

## Sprint Summary

| Sprint | Duration | Theme | Milestone |
|--------|----------|-------|-----------|
| Sprint 0 | 1 week | Environment & Foundation | Repo boots, structure in place |
| Sprint 1 | 2 weeks | Data Layer + Execution Engine | Ticket executes and produces code on a branch |
| Sprint 2 | 1 week | Minimal Kanban UI | Create ticket → see it run → see branch |
| Sprint 3 | 2 weeks | Full UI — Detail View + Live Logs | Complete in-editor workflow |
| Sprint 4 | 2 weeks | Power Features | Parallel jobs, templates, test validation |
| Sprint 5 | 2 weeks | Analytics, GitHub Integration, Polish | Beta-ready product |
| Sprint 6 | 1 week | Distribution | macOS / Windows / Linux installer ships |

---

## Sprint 0 — Environment & Foundation
**Duration:** 1 week
**Goal:** The development environment is fully operational. The repository structure, build pipeline, and core dependencies are in place so the team can write product code from day one.

### Tasks

#### Repo & Fork Setup
- [ ] Fork VS Code `main` branch into `autodev-studio` repository
- [ ] Create a clean `autodev-patches` branch to track our fork delta
- [ ] Configure upstream remote (`git remote add upstream`) for future rebases
- [ ] Verify VS Code builds from the fork (`yarn && yarn compile`)
- [ ] Document the fork rebase procedure in `CONTRIBUTING.md`

#### Project Structure
- [ ] Create `src/extension/` directory with placeholder `extension.ts`
- [ ] Create `src/webview/` directory with placeholder React app
- [ ] Create `templates/` directory with empty template stubs (7 files: `prd.md`, `simple-plan.md`, `analysis.md`, `bug-fix.md`, `test-gen.md`, `direct-execute.md`, `refactor.md`)
- [ ] Create `test/unit/`, `test/integration/`, `test/e2e/` directories
- [ ] Set up `tsconfig.json` for extension host code
- [ ] Set up webpack/esbuild config for webview bundles

#### Dependencies
- [ ] Add `better-sqlite3` for local SQLite storage
- [ ] Add `React` + `ReactDOM` for webview UIs
- [ ] Add `uuid` for ID generation
- [ ] Add `@vscode/webview-ui-toolkit` (optional — evaluate vs. raw CSS variables)
- [ ] Add `recharts` or `chart.js` (evaluate for analytics — defer final pick to Sprint 5)

#### CI/CD
- [ ] Set up GitHub Actions workflow: lint + TypeScript compile on every PR
- [ ] Add a `scripts/build-fork.sh` skeleton (executable, commented placeholders)

#### Data Directory
- [ ] Decide on and document `~/.autodev-studio/` directory layout:
  ```
  ~/.autodev-studio/
  ├── autodev.db        # SQLite database
  ├── logs/             # Per-ticket log files
  │   └── {ticketId}/
  └── templates/        # User-editable prompt templates (copied from bundled)
  ```
- [ ] Create `src/extension/services/dataDir.ts` — utility that ensures the data directory exists on activation

### Definition of Done
- `yarn compile` succeeds with no errors
- CI passes on a test PR
- A `console.log("AutoDev extension activated")` message appears in VS Code's extension host output when the fork launches
- All directory stubs exist and are committed

### Risks
- VS Code fork build can be slow on first run (expect 5–10 min). Cache the `node_modules` in CI to mitigate.
- `better-sqlite3` requires native compilation — verify it works in VS Code's Node.js version (check `.nvmrc` / electron Node version).

---

## Sprint 1 — Data Layer + Execution Engine
**Duration:** 2 weeks
**Goal:** End-to-end execution works from the command line (no UI yet). A developer can insert a ticket into the database, run the orchestrator, and see Claude Code execute in a git worktree, producing committed code on a branch.

### Week 1 — Data Layer

#### TypeScript Types (`src/extension/types/`)
- [ ] Define `Project` and `ProjectSettings` interfaces (`project.ts`)
- [ ] Define `Ticket`, `TicketStatus`, `PlanType` types (`ticket.ts`)
- [ ] Define `PlanTemplate`, `TemplateVariable` types (`template.ts`)
- [ ] Define `ExecutionJob` type (`job.ts`)
- [ ] Define `ExtensionMessage` and `WebviewMessage` union types (`messages.ts`)
- [ ] Define `ChangeSummary`, `WorktreeInfo`, `JobStats` types (`git.ts`)

#### Database Service (`src/extension/services/database.ts`)
- [ ] Initialize SQLite connection with `better-sqlite3`
- [ ] Run migrations on startup (create tables if not exists):
  - `projects`
  - `tickets`
  - `attachments`
  - `execution_jobs`
  - `analytics_events`
  - All indexes from the schema in Section 8.2 of the spec
- [ ] Implement `ProjectStore`: `create`, `findById`, `findAll`, `update`, `delete`
- [ ] Implement `TicketStore`: `create`, `findById`, `findByProject`, `updateStatus`, `updatePlan`, `setMetadata`, `delete`
- [ ] Implement `JobStore`: `create`, `findByTicket`, `updateStatus`, `setExitCode`
- [ ] Write unit tests for all store methods (use in-memory SQLite: `new Database(':memory:')`)

#### Template Engine (`src/extension/services/templateEngine.ts`)
- [ ] Load template from file on disk (from `~/.autodev-studio/templates/`)
- [ ] Interpolate known variables: `{{TICKET_TITLE}}`, `{{TICKET_DESCRIPTION}}`, `{{PROJECT_NAME}}`, `{{TEST_COMMAND}}`, `{{BUILD_COMMAND}}`
- [ ] Auto-detect stack (`{{AUTO_DETECTED_STACK}}`): parse `package.json` for framework, check for `pyproject.toml`, `Cargo.toml`, `go.mod`
- [ ] Render attachment section conditionally (`{{#ATTACHMENTS}}...{{/ATTACHMENTS}}`)
- [ ] Write unit tests for each variable substitution case

#### Project Detector (`src/extension/services/projectDetector.ts`)
- [ ] Detect stack from `package.json` (React, Vue, Next.js, Express, etc.)
- [ ] Detect test runner (`jest`, `vitest`, `mocha`, `pytest`, `cargo test`, etc.)
- [ ] Infer default test/build/lint commands
- [ ] Return a `DetectedStack` object used in template interpolation

### Week 2 — Execution Engine

#### Git Manager (`src/extension/services/gitManager.ts`)
- [ ] `createWorktree(project, ticket)` — runs:
  ```bash
  git worktree add .worktrees/ticket-{id} -b autodev/ticket-{id}-{slug} {defaultBranch}
  ```
- [ ] `removeWorktree(project, ticket)` — `git worktree remove --force`
- [ ] `listWorktrees(project)` — parse `git worktree list --porcelain`
- [ ] `getChangeSummary(worktreePath)` — parse `git diff --stat` output into `ChangeSummary`
- [ ] `prepareBranch(worktreePath, ticket)` — ensure final commit is clean
- [ ] `mergeBranch(project, ticket)` — `git merge --no-ff` into default branch
- [ ] Write unit tests using a temp git repo fixture

#### Claude Code Runner (`src/extension/services/claudeCodeRunner.ts`)
- [ ] Locate Claude Code binary (settings override → `which claude` → error)
- [ ] `runPlanPhase(job, ticket, project)` — spawn Claude Code in project root with plan template prompt, `--print --output-format stream-json`
- [ ] `runExecutePhase(job, ticket, project)` — spawn Claude Code in worktree with execution prompt
- [ ] Stream stdout/stderr to a log file at `~/.autodev-studio/logs/{ticketId}/{jobId}.log`
- [ ] Parse `stream-json` output: extract `content` lines, detect completion, detect errors
- [ ] Return exit code and final output

#### Log Streamer (`src/extension/services/logStreamer.ts`)
- [ ] `watch(jobId, logPath)` — tail the log file with `fs.watch` or polling, emit `line` events
- [ ] `getHistory(jobId)` — read full log file and return lines
- [ ] `getStats(jobId)` — parse structured output for token count (if available), file count, test results
- [ ] `stop(jobId)` — stop watching

#### Orchestrator (`src/extension/services/orchestrator.ts`)
- [ ] Start as a long-running singleton on extension activation
- [ ] Implement single-job queue (array + `tick()` loop)
- [ ] `enqueue(ticket, phase)` — add job to queue, persist to DB
- [ ] `tick()` — if worker slot available and queue non-empty, spawn worker
- [ ] Worker lifecycle:
  1. `plan` phase → `runPlanPhase` → update ticket to `plan_review` or `queued` (if `autoExecuteAfterPlan`)
  2. `execute` phase → create worktree → `runExecutePhase`
  3. `test` phase → run `testCommand` in worktree → if fail, re-enqueue `fix` phase (up to 3 retries)
  4. `complete` → update ticket status, emit events
- [ ] Handle worker process crash (non-zero exit) → set ticket to `failed`
- [ ] Expose `cancel(ticketId)` — kill worker process, clean up

#### Extension Activation (`src/extension/extension.ts`)
- [ ] Initialize `Database` service
- [ ] Initialize `Orchestrator`
- [ ] Register all 12 command palette commands (stubs — real handlers come in Sprint 2)
- [ ] Ensure data directory and templates are seeded on first run (copy bundled templates to `~/.autodev-studio/templates/`)

### Definition of Done
- Running a Node.js test script that: creates a project, creates a ticket, calls `orchestrator.enqueue()`, and verifies that a worktree exists at `.worktrees/ticket-{id}` with a commit on a new branch.
- All unit tests pass
- No TypeScript compilation errors

### Risks
- Claude Code CLI flags (`--print`, `--output-format stream-json`) may change. Pin the tested version in docs. Add a version check on activation.
- `git worktree` requires git 2.5+. Check and surface a clear error if the user's git is too old.
- Stream-JSON parsing: if Claude Code's output format changes, the runner will break silently. Add a format version assertion.

---

## Sprint 2 — Minimal Kanban UI
**Duration:** 1 week
**Goal:** The Kanban board is visible in the editor. Users can create a ticket, start execution, and see the ticket's status update in real time. A completed ticket shows the branch name.

### Webview Infrastructure
- [ ] Register `KanbanViewProvider` as a webview panel in `extension.ts`
  - Panel type: `vscode.WebviewPanel` opened as an editor tab (not sidebar)
  - Retain state when hidden
- [ ] Set up `postMessage` bridge: extension host ↔ webview
- [ ] Create `src/webview/shared/useVSCodeApi.ts` hook — wraps `acquireVsCodeApi()`, exposes `postMessage` and `onMessage`
- [ ] Build webview webpack/esbuild config to produce `kanban.js` bundle

### Kanban Board React App (`src/webview/kanban/`)
- [ ] `KanbanBoard.tsx` — top-level component, receives full state via message
- [ ] `Column.tsx` — renders a single status column with title and cards
- [ ] `TicketCard.tsx` — displays title, plan type badge, status badge, elapsed time
- [ ] Status badge icons/colors matching spec Section 5.2 (📝 ⏳ 👁️ 🔄 ✅ ❌ 🔀)
- [ ] Project selector dropdown (top of board)
- [ ] "+ New Ticket" button → sends `ticket:create` message (opens native VS Code input box for now)
- [ ] `kanban.css` — VS Code CSS variable–based styles (no hardcoded colors)

### State Synchronization
- [ ] On webview open: extension sends `state:update` with all tickets + projects
- [ ] On ticket status change: extension sends `ticket:statusChanged`
- [ ] On job log line: extension sends `log:line` (webview ignores for now — Sprint 3)
- [ ] Webview sends `ticket:create`, `ticket:execute`, `ticket:cancel` messages back to extension host

### Command Handlers (minimal)
- [ ] `AutoDev: New Ticket` — quick-input wizard (title, description, plan type) → creates ticket in DB → sends to orchestrator
- [ ] `AutoDev: Open Board` — focus/open the kanban panel
- [ ] `AutoDev: Show Running Jobs` — quick-pick list of `in_progress` tickets
- [ ] `AutoDev: Cancel Job` — cancel selected running job

### Status Bar (`src/extension/providers/statusBarProvider.ts`)
- [ ] Create persistent status bar item (left side)
- [ ] Display: `🤖 AutoDev: {n} running │ ✅ {n} completed │ ⏳ {n} queued`
- [ ] Update whenever orchestrator emits state change
- [ ] Clicking opens `AutoDev: Show Running Jobs` quick-pick

### Notifications (basic)
- [ ] Plan ready → `vscode.window.showInformationMessage("Plan ready for: {title}")`
- [ ] Job completed → success notification
- [ ] Job failed → error notification with "View Logs" action button

### Definition of Done
- User can open the Kanban Board tab
- User can create a ticket via "+ New Ticket" button
- Ticket appears in the Backlog column
- User can click "Execute" on a ticket → it moves through Planning → In Progress → Completed
- Status bar updates correctly
- A notification fires when the job completes
- Completed ticket shows the branch name in the card

### Risks
- Webview panel tab vs. sidebar: the spec shows a tab. Confirm this is preferred vs. activity bar sidebar view. Both are doable but the UI code differs.
- VS Code webview content security policy: ensure the webview nonce is set correctly for React to load.

---

## Sprint 3 — Full UI: Ticket Detail, Live Logs, DnD
**Duration:** 2 weeks
**Goal:** The complete in-editor workflow is operational. Every piece of the UI described in the spec exists. A user can manage the full ticket lifecycle without leaving the editor.

### Week 1 — Ticket Detail View

#### Ticket Detail Provider (`src/extension/providers/ticketDetailProvider.ts`)
- [ ] Register as a `vscode.WebviewPanel` editor tab, opened when a ticket card is clicked
- [ ] Each ticket opens its own panel (keyed by ticket ID)
- [ ] On open: load ticket + job history from DB, send initial state to webview

#### Ticket Detail React App (`src/webview/ticket-detail/`)
- [ ] `TicketDetail.tsx` — container with header + tab bar
- [ ] Header: title, project, branch, status badge, created/started times
- [ ] Tab: **Description** — renders ticket description as markdown
- [ ] Tab: **Plan** — renders `ticket.plan` as markdown; `PlanEditor.tsx` with edit mode toggle; "Edit Plan", "Execute Plan", "Regenerate" buttons
- [ ] Tab: **Live Log** — `LiveLog.tsx`, auto-scrolling terminal-style view
- [ ] Tab: **Changes** — `ChangesSummary.tsx`, lists changed files with +/- counts
- [ ] Tab: **Actions** — "Checkout Branch", "Create PR", "Merge to Main", "Re-execute", "Delete Ticket" buttons
- [ ] Send appropriate `WebviewMessage` for each action button

#### Live Log Streaming
- [ ] Extension: on `log:line` event from `LogStreamer`, forward via `postMessage` to the relevant ticket detail panel
- [ ] Webview: `LiveLog.tsx` appends lines, auto-scrolls to bottom
- [ ] Show timestamps per line
- [ ] Color-code lines: green for success patterns (`✅`, `passed`), red for error patterns (`❌`, `error`, `failed`), default for others
- [ ] "Clear" button and "Copy to Clipboard" button

#### Changes Summary
- [ ] On ticket completion, call `gitManager.getChangeSummary(worktreePath)` and store in `ticket.metadata.filesChanged`
- [ ] `ChangesSummary.tsx` renders file list with +/- counts
- [ ] "View Full Diff" → opens VS Code diff editor using `vscode.commands.executeCommand('vscode.diff', ...)`
- [ ] "Open in Editor" → opens the changed file in the editor
- [ ] "Checkout Branch" → runs `git checkout` in the project root via terminal

### Week 2 — Drag-and-Drop, New Ticket Modal, Commands

#### Drag-and-Drop (`KanbanBoard.tsx` update)
- [ ] Implement drag-and-drop using the HTML5 Drag and Drop API (no library needed)
- [ ] Dragging a card between columns sends `ticket:move` with new status
- [ ] Moving to "In Progress" column triggers `ticket:execute`
- [ ] Moving back to "Backlog" triggers `ticket:cancel`
- [ ] Visual feedback: drop zone highlight, dragged card opacity
- [ ] Respect valid transitions (e.g., can't drag a `completed` ticket to `planning`)

#### New Ticket Modal (`src/webview/kanban/NewTicketModal.tsx`)
- [ ] Full inline webview form (not just a quick-input)
- [ ] Fields: Project selector, Title, Description (textarea), Plan Type (radio buttons), Attachments (file upload)
- [ ] Three action buttons: "Save to Backlog", "Save & Generate Plan", "Save & Execute Now"
- [ ] Client-side validation: title and description required
- [ ] Attachment handling: file picker → copy file to `~/.autodev-studio/logs/{ticketId}/attachments/`, store in `attachments` table

#### Template Editor (`src/webview/templates/`)
- [ ] `TemplateEditor.tsx` — left: editable textarea for template markdown; right: `TemplatePreview.tsx` with variable interpolation using sample data
- [ ] Register as a webview panel opened by `AutoDev: Edit Templates`
- [ ] Save changes back to `~/.autodev-studio/templates/{name}.md`
- [ ] "Reset to Default" button (copies bundled template back)

#### Remaining Command Handlers
- [ ] `AutoDev: View Ticket Logs` — quick-pick of tickets → opens detail view on Log tab
- [ ] `AutoDev: Checkout Ticket Branch` — quick-pick of completed tickets → runs checkout
- [ ] `AutoDev: Execute Selected Ticket` — executes currently selected/open ticket
- [ ] `AutoDev: Merge Ticket` — merges selected ticket's branch
- [ ] `AutoDev: Create PR` — see Sprint 5 for full implementation; stub for now
- [ ] `AutoDev: Open Analytics` — stub for now
- [ ] `AutoDev: Add Project` — open folder picker → detect stack → create Project record → notify
- [ ] `AutoDev: Edit Templates` — open template editor panel

### Definition of Done
- Clicking any ticket card opens the detail view with all 5 tabs functional
- Live logs scroll in real time during an active job
- New ticket modal works end-to-end with all three action buttons
- Drag-and-drop moves cards and triggers the correct actions
- Template editor opens and saves changes
- All 12 command palette commands are registered and functional (or stubbed with a clear message)
- Full workflow test: new ticket → generate plan → review plan in detail view → execute → watch live logs → review changes → checkout branch

### Risks
- HTML5 DnD in a webview iframe has some quirks — test across platforms early. If problematic, fall back to a library like `@dnd-kit/core`.
- File attachment upload: VS Code webview can't directly access the file system. Use `vscode.window.showOpenDialog` from the extension host, triggered by a webview message.

---

## Sprint 4 — Power Features: Parallel Execution, Templates, Test Validation
**Duration:** 2 weeks
**Goal:** Run 4 tickets across 2 projects simultaneously with automatic test validation and retry cycles.

### Parallel Orchestrator (`orchestrator.ts` upgrades)
- [ ] Replace single-job queue with `PriorityQueue<ExecutionJob>`
- [ ] Track active workers in `Map<string, Worker>` keyed by job ID
- [ ] `tick()` loop respects:
  - Global `maxParallelJobs` setting (default: 4)
  - Per-project `maxParallelJobs` setting (default: 2)
- [ ] `requeue()` — if per-project limit hit, put job back in queue and try next
- [ ] Add `globalMaxWorkers` as a VS Code setting (`autodev.maxParallelJobs`)
- [ ] Emit `job:progress` events for UI progress bars

### Test/Build/Lint Validation Loop
- [ ] After execute phase exits (code 0): run `project.settings.testCommand` in the worktree
- [ ] Capture stdout/stderr of test run
- [ ] Parse for pass/fail signal (exit code 0 = pass)
- [ ] On failure: feed the test output back to Claude Code as a new prompt: `"The tests are failing with the following output. Please fix the code: {testOutput}"`
- [ ] Retry up to `autodev.defaults.maxRetries` times (default: 3)
- [ ] Track retry count in `ExecutionJob`; surface it in the Live Log
- [ ] On retry exhaustion: set ticket to `failed` with error message: `"Tests still failing after {n} retries"`
- [ ] Also run lint command if configured (non-blocking — log result but don't retry on lint failure)
- [ ] Store `testsWritten`, `testsPassed` in `ticket.metadata`

### Progress Bar in Kanban Card
- [ ] Orchestrator emits `job:progress` with `{ phase, pct }` estimates:
  - Plan phase: 0–30%
  - Execute phase: 30–80% (estimate from turn count / `maxTurns`)
  - Test phase: 80–95%
  - Complete: 100%
- [ ] `TicketCard.tsx` renders a progress bar when status is `in_progress`
- [ ] Show elapsed time on running cards

### Template System Enhancements
- [ ] Copy 7 default templates to `~/.autodev-studio/templates/` on first activation
- [ ] Write full content for all 7 templates:
  - `prd.md` — detailed PRD generation prompt
  - `simple-plan.md` — lightweight plan (5–10 bullet implementation steps)
  - `analysis.md` — codebase analysis, no code written
  - `bug-fix.md` — bug investigation + fix + regression test
  - `test-gen.md` — write comprehensive tests for existing module
  - `direct-execute.md` — skip planning, just execute
  - `refactor.md` — code improvement / cleanup
- [ ] Template Engine: support `{{CONTEXT_FILES}}` — read files listed in `project.settings.contextFiles` and inline their content
- [ ] Template Engine: auto-detect `{{AUTO_DETECTED_STACK}}` for all detected stacks

### Context Files Support
- [ ] `ProjectSettings.contextFiles` — array of glob patterns
- [ ] Template Engine resolves and reads matched files, inlines them as fenced code blocks
- [ ] UI: add "Context Files" section to project settings (Sprint 5 — UI placeholder for now)

### VS Code Settings Registration
- [ ] Register all `autodev.*` settings in `package.json` contributes (with descriptions, types, defaults):
  - `autodev.maxParallelJobs`
  - `autodev.claudeCodePath`
  - `autodev.dataDir`
  - `autodev.logRetentionDays`
  - `autodev.notifications.onPlanReady`
  - `autodev.notifications.onJobComplete`
  - `autodev.notifications.onJobFailed`
  - `autodev.notifications.sound`
  - `autodev.defaults.planType`
  - `autodev.defaults.autoExecuteAfterPlan`
  - `autodev.defaults.maxRetries`
  - `autodev.defaults.claudeMaxTurns`
  - `autodev.git.branchPrefix`
  - `autodev.git.autoCleanWorktrees`
  - `autodev.git.cleanAfterDays`

### Definition of Done
- Enqueue 4 tickets on 2 projects → verify 4 worktrees are created, at most 2 running per project at a time
- A ticket where tests fail gets retried automatically (force a failure with a bad ticket description to test)
- All 7 templates exist and produce valid output when interpolated
- Progress bar appears on running cards
- VS Code settings panel shows all `autodev.*` settings with proper descriptions

### Risks
- Parallel worktree creation with the same base branch: ensure no race condition in `git worktree add`
- Test command detection: if no `testCommand` is set and auto-detection fails, skip the test phase gracefully (log a warning, don't fail the ticket)

---

## Sprint 5 — Analytics, GitHub Integration, Error Recovery
**Duration:** 2 weeks
**Goal:** The product is beta-ready. Analytics are tracked, PRs can be created from the editor, edge cases are handled, and first-time users get an onboarding flow.

### Week 1 — Analytics

#### Event Tracking
- [ ] Create `analyticsService.ts` — wraps insert into `analytics_events` table
- [ ] Track events throughout execution:
  - `ticket_created`
  - `plan_started`, `plan_completed`, `plan_duration_ms`
  - `execute_started`, `execute_completed`, `execute_duration_ms`
  - `test_passed`, `test_failed`, `retry_count`
  - `ticket_merged`, `ticket_deleted`
  - `job_failed` (with error category)
- [ ] Store `tokens_used` if extractable from Claude Code output (parse for token summary lines)

#### Analytics Dashboard (`src/webview/analytics/`)
- [ ] `AnalyticsDashboard.tsx` — full-screen webview panel
- [ ] Summary stats cards: Total Jobs, Success Rate, Avg Duration, Tokens Used (this week)
- [ ] Execution volume over time chart (7-day bar chart) — use a lightweight chart library (e.g., `recharts`)
- [ ] Recent executions table: ticket title, status, duration, files changed, test results
- [ ] Project filter dropdown (All / per-project)
- [ ] `AutoDev: Open Analytics` command wires up to this panel

#### Analytics Queries (`database.ts` additions)
- [ ] `getWeeklySummary(projectId?)` — return daily job counts for last 7 days
- [ ] `getSuccessRate(projectId?, days?)` — completed / total jobs
- [ ] `getAverageDuration(projectId?, days?)` — mean and median execution time
- [ ] `getRecentJobs(projectId?, limit?)` — last N completed jobs with metadata

### Week 2 — GitHub Integration, Error Recovery, Onboarding

#### GitHub / PR Integration
- [ ] `AutoDev: Create PR` command:
  1. Check if `gh` CLI is available (`which gh`)
  2. If not: show notification with install instructions, abort
  3. If yes: push ticket branch to origin (`git push origin {branch}`)
  4. Run `gh pr create --title "{ticket.title}" --body "{ticket.plan}"` in the project directory
  5. Show notification with PR URL; make it clickable (opens in browser)
- [ ] `AutoDev: Merge Ticket` command:
  1. Confirm dialog: "Merge {branch} into {defaultBranch}?"
  2. Call `gitManager.mergeBranch()`
  3. Remove worktree
  4. Update ticket status to `merged`
  5. Log analytics event

#### Worktree Auto-Cleanup
- [ ] On extension activation and daily: scan `project.worktreeRoot` for worktrees
- [ ] If worktree's ticket is `merged` or `deleted` and worktree is older than `autodev.git.cleanAfterDays` (default: 7), remove it
- [ ] Log cleanup to the Output channel

#### Error Recovery & Edge Cases
- [ ] Handle extension host crash mid-job: on activation, scan for `running` jobs in DB → set them to `failed` with message "Job interrupted by editor restart. Re-execute to try again."
- [ ] Handle git worktree already exists (if previous run crashed mid-setup) → detect and reuse or remove and recreate
- [ ] Handle Claude Code binary not found → show actionable error: "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
- [ ] Handle project repo not a git repo → clear error on project registration
- [ ] Handle `testCommand` failure on clean code → detect if failure predates the ticket (run test before and after?) or document limitation
- [ ] Output channel `AutoDev (Logs)` → route all orchestrator info/error logs here for debugging

#### Onboarding Flow
- [ ] On first activation (detect via a `firstRun` key in DB or `globalState`):
  1. Show welcome notification: "Welcome to AutoDev Studio. Let's get you set up."
  2. Open a read-only `WELCOME.md` file as a tab (markdown preview) explaining the workflow
  3. Prompt: "Add your first project" → trigger `AutoDev: Add Project` command
- [ ] Replace VS Code's default welcome tab with AutoDev onboarding (fork-level change in `src/vs/workbench/browser/parts/editor/welcomeEditor`)
- [ ] After first project added, show a sample ticket suggestion: "Try creating your first ticket"

#### Project Settings UI
- [ ] Add a "Project Settings" panel (webview or quick-input wizard):
  - Max parallel jobs
  - Test / build / lint commands (with auto-detected defaults)
  - Context files (glob input)
  - Auto-execute after plan (toggle)
- [ ] Accessible from the project selector dropdown on the kanban board (gear icon)

### Definition of Done
- Analytics dashboard shows real data from executed tickets
- `AutoDev: Create PR` creates a real PR on GitHub (manual test required)
- `AutoDev: Merge Ticket` merges and cleans up the worktree
- Restarting the editor with a running job → job shows as `failed` with recovery message
- First-time user sees the welcome flow
- All error paths surface a clear, actionable message (no raw stack traces in the UI)

### Risks
- `gh` CLI PR creation: the user must be authenticated. Detect auth state and guide them if not (`gh auth login`).
- Onboarding tab replacement is a fork-level change — scope carefully to avoid breaking VS Code's own welcome logic.

---

## Sprint 6 — Distribution
**Duration:** 1 week
**Goal:** AutoDev Studio ships as a downloadable installer for macOS, Windows, and Linux with auto-update.

### Fork Patches
Maintain a minimal, documented patch set on top of VS Code:

- [ ] **Patch 1 — Activity Bar** (`src/vs/workbench/browser/parts/activitybar/`): pre-register AutoDev activity bar icons (Kanban, Analytics, Projects, Templates) as default visible items
- [ ] **Patch 2 — Welcome Tab** (`src/vs/workbench/browser/parts/editor/`): replace default welcome with AutoDev onboarding
- [ ] **Patch 3 — Default Panel Layout** (`src/vs/workbench/browser/layout.ts`): pre-configure "Live Logs" as a tab in the bottom panel
- [ ] **Patch 4 — Branding**: custom product name ("AutoDev Studio"), icon (`resources/autodev-logo.png`), splash screen
- [ ] **Patch 5 — Bundled Extension**: ensure AutoDev extension is in the default extension list (`product.json`) and cannot be uninstalled
- [ ] Document each patch in `patches/README.md`; store as `.patch` files under `patches/`

### Build Pipeline (`scripts/build-fork.sh`)
- [ ] Step 1: `git fetch upstream && git rebase upstream/main` (with conflict exit)
- [ ] Step 2: Apply patches from `patches/`
- [ ] Step 3: `yarn install`
- [ ] Step 4: `yarn compile`
- [ ] Step 5: Build AutoDev extension (`cd extensions/autodev && npm run build`)
- [ ] Step 6: `node build/electron-builder.js --mac --win --linux`

### Packaging
- [ ] macOS: `.dmg` (code-signed with Developer ID), configure `electron-builder`
- [ ] Windows: `.exe` installer (NSIS), code signing setup (CI secret)
- [ ] Linux: `.AppImage` + `.deb`
- [ ] Set up GitHub Releases workflow: tag `v{version}` → CI builds all 3 platforms → uploads artifacts
- [ ] Auto-update: configure VS Code's built-in `update.url` in `product.json` to point to GitHub Releases

### Documentation
- [ ] `README.md` — product overview, install instructions, quick start
- [ ] `docs/ARCHITECTURE.md` — brief summary of the fork structure and how to contribute
- [ ] `docs/TEMPLATES.md` — how to write and customize plan templates
- [ ] `CHANGELOG.md` — initial v1.0 entry

### Definition of Done
- Running `scripts/build-fork.sh` on a clean machine produces a `.dmg`, `.exe`, and `.AppImage`
- The `.dmg` installs and launches AutoDev Studio on macOS
- Auto-update checks for new versions on launch
- README is publicly readable and covers install + first steps
- All patches are documented and cleanly applicable after an upstream rebase

### Risks
- Code signing requires paid Apple Developer ID and a Windows EV cert. If not available at sprint time, ship unsigned builds as "Developer Preview" with instructions to bypass Gatekeeper/SmartScreen.
- `electron-builder` cross-compilation for Windows from macOS/Linux requires Docker or a Windows CI runner. Set up a Windows GitHub Actions runner early.
- Upstream VS Code rebases may conflict with our patches — the smaller the patch surface, the better.

---

## Cross-Cutting Concerns

These items span multiple sprints and should be addressed incrementally.

### Security
| Item | Sprint |
|------|--------|
| Ensure Claude Code runs with minimal permissions (scoped to worktree only) | 1 |
| Never log or store API keys from environment | 1 |
| Sanitize all template variables before injecting into prompts (prevent prompt injection from ticket content) | 2 |
| `.gitignore` awareness — never commit `.env` files from worktrees | 1 |
| Audit trail: every Claude Code session is fully logged | 1 |

### Performance
| Item | Sprint |
|------|--------|
| SQLite queries use indexes (defined in schema) | 1 |
| Webview state is not re-fetched on every render — use message-based state sync | 2 |
| Log files are streamed, not loaded into memory all at once | 1 |
| Worktrees are cleaned up automatically to avoid disk bloat | 5 |

### Testing Strategy
| Layer | Approach |
|-------|----------|
| Unit tests | `src/extension/services/*.ts` — pure logic, use in-memory SQLite and mock `child_process.spawn` |
| Integration tests | Orchestrator + GitManager + mock Claude Code runner (shell script that writes a test file and exits 0) |
| E2E tests | Full fork launch → create ticket → execute → verify branch exists (using a fixture repo) |
| Webview tests | React Testing Library for all webview components |

### Open Questions to Resolve (from spec Section 15)

| Question | Recommended Resolution | Sprint |
|----------|----------------------|--------|
| Extension vs. Fork | Ship as a standard VS Code extension first (Sprint 2 MVP), then apply fork patches in Sprint 6 for distribution | 0 |
| Claude Code API stability | Pin tested version in `package.json` peer deps; add version check on activation | 1 |
| Multi-machine sync | Out of scope for v1.0. Document as a future feature. | — |
| GitHub/GitLab integration | GitHub PR creation via `gh` CLI in Sprint 5; GitLab is v2.0 | 5 |
| Cost visibility | Parse Claude Code's output for token summary lines (best effort); document limitation | 4 |
| Context window management | Add `contextFiles` glob support in Sprint 4; document `.autodevignore` as a future feature | 4 |

---

## Milestone Summary

| Milestone | Sprint | Description |
|-----------|--------|-------------|
| **M0 — Green Build** | Sprint 0 | Fork compiles cleanly |
| **M1 — Core Loop** | Sprint 1 | Ticket executes → code on a branch (CLI only) |
| **M2 — Board Ships** | Sprint 2 | Create ticket → execute → see branch, all in the editor |
| **M3 — Full Workflow** | Sprint 3 | Complete in-editor workflow from creation to review |
| **M4 — Parallel Power** | Sprint 4 | 4 concurrent tickets with auto-test validation |
| **M5 — Beta Ready** | Sprint 5 | Analytics, PR creation, error recovery, onboarding |
| **M6 — Ships** | Sprint 6 — | macOS / Windows / Linux installers available |
