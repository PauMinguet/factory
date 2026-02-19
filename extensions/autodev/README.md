# AutoDev

Autonomous AI development built into VS Code. Create tickets, generate implementation plans, and execute them with Claude Code — all without leaving the editor.

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed and authenticated (`claude --version` must work)
- Git 2.5+ (for `git worktree` support)
- Node.js 22+

## Development Setup

```bash
# From the repository root
yarn install

# Compile the AutoDev extension
cd extensions/autodev
npm install

# Build (from repo root)
gulp compile-extension:autodev
```

### Native Module Note

The `better-sqlite3` dependency (added in Sprint 1) requires native compilation against VS Code's Electron runtime. After `npm install`, run:

```bash
npx electron-rebuild -v $(node -e "require('../../node_modules/electron/package.json').version") -m better-sqlite3
```

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **AutoDev: Add Project** to register a repository
3. Run **AutoDev: Open Board** to open the Kanban board
4. Click **+ New Ticket** to create your first ticket

## Architecture

See [docs/plan.md](../../docs/plan.md) for the full product specification and [docs/sprints.md](../../docs/sprints.md) for the implementation sprint plan.
