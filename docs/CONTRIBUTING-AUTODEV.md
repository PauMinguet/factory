# Contributing to AutoDev Studio

AutoDev Studio is a fork of [VS Code](https://github.com/microsoft/vscode). The AutoDev feature
lives entirely in the bundled extension at `extensions/autodev/`. VS Code core is modified only
through a minimal, documented patch set (applied in Sprint 6).

See the original [CONTRIBUTING.md](../CONTRIBUTING.md) for VS Code's broader contribution guide.

---

## Development Setup

### Prerequisites

- Node.js 22 (use `.nvmrc`: `nvm use`)
- Git 2.5+
- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed and authenticated

### First-time setup

```bash
# 1. Install root dependencies
yarn install

# 2. Install extension dependencies
cd extensions/autodev
npm install

# 3. Build everything
cd ../..
yarn compile
gulp compile-extension:autodev
```

### Running in development

Open this repository in VS Code and press `F5` to launch an Extension Development Host
with the AutoDev extension loaded.

---

## Fork Maintenance

We track upstream VS Code on the `main` branch with a minimal patch set.

### Syncing with upstream

```bash
# Add the upstream remote (first time only)
git remote add upstream https://github.com/microsoft/vscode.git

# Pull latest upstream changes and rebase
git fetch upstream
git rebase upstream/main

# Resolve any conflicts, then continue
git rebase --continue
```

### Patch set

Our fork diverges from upstream in exactly five places (added in Sprint 6).
Each patch is stored as a `.patch` file under `patches/` with a descriptive name:

| # | File | Description |
|---|------|-------------|
| 1 | `patches/01-activity-bar.patch` | Pre-register AutoDev activity bar icons |
| 2 | `patches/02-welcome-tab.patch` | Replace default welcome with AutoDev onboarding |
| 3 | `patches/03-panel-layout.patch` | Pre-configure Live Logs tab in bottom panel |
| 4 | `patches/04-branding.patch` | Product name, icon, splash screen |
| 5 | `patches/05-bundled-extension.patch` | AutoDev in default extension list |

To re-apply patches after a rebase:

```bash
git am patches/*.patch
```

To regenerate a patch after making changes:

```bash
git format-patch upstream/main --stdout > patches/0N-description.patch
```

---

## Extension Development

All product code lives in `extensions/autodev/`. Follow `docs/sprints.md` for sequencing.

### TypeScript compilation

```bash
# Watch mode (rebuilds on save)
gulp watch-extension:autodev

# One-shot compile
gulp compile-extension:autodev
```

### Running tests

```bash
# Unit tests
cd extensions/autodev && npm test

# From repo root
scripts/test.sh --grep autodev
```

### Native module setup (better-sqlite3)

`better-sqlite3` must be compiled against VS Code's Electron runtime (added Sprint 1):

```bash
cd extensions/autodev
npm install

ELECTRON_VERSION=$(node -e "console.log(require('../../node_modules/electron/package.json').version)")
npx electron-rebuild -v $ELECTRON_VERSION -m better-sqlite3
```

---

## Code Style

See [.claude/CLAUDE.md](../.claude/CLAUDE.md) for the full style guide. Key points:

- **Tabs** for indentation (not spaces)
- **PascalCase** for types and enums; **camelCase** for functions and variables
- **Double quotes** for user-visible strings; **single quotes** otherwise
- All user-visible strings must use `vscode.l10n.t()`
- Microsoft copyright header on every TypeScript file
