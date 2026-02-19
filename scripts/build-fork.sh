#!/usr/bin/env bash
# build-fork.sh — Build AutoDev Studio from the VS Code fork.
#
# Usage:
#   ./scripts/build-fork.sh [--mac] [--win] [--linux] [--skip-sync]
#
# This script is fully implemented in Sprint 6. It is a skeleton here (Sprint 0)
# to establish the build pipeline contract.
#
# Steps:
#   1. (Optional) Sync with upstream VS Code
#   2. Apply AutoDev fork patches
#   3. Install dependencies
#   4. Compile TypeScript
#   5. Build the AutoDev extension
#   6. Package for the requested platforms

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Options ───────────────────────────────────────────────────────────────────
PLATFORM_MAC=false
PLATFORM_WIN=false
PLATFORM_LINUX=false
SKIP_SYNC=false

for arg in "$@"; do
	case "$arg" in
		--mac)       PLATFORM_MAC=true ;;
		--win)       PLATFORM_WIN=true ;;
		--linux)     PLATFORM_LINUX=true ;;
		--skip-sync) SKIP_SYNC=true ;;
		*) echo "Unknown argument: $arg" && exit 1 ;;
	esac
done

# Default to current platform if none specified
if ! $PLATFORM_MAC && ! $PLATFORM_WIN && ! $PLATFORM_LINUX; then
	case "$(uname -s)" in
		Darwin) PLATFORM_MAC=true ;;
		Linux)  PLATFORM_LINUX=true ;;
		MINGW*|CYGWIN*) PLATFORM_WIN=true ;;
	esac
fi

echo "╔══════════════════════════════════════════╗"
echo "║      AutoDev Studio Build Pipeline       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Sync with upstream ────────────────────────────────────────────────
if ! $SKIP_SYNC; then
	echo "▶ Step 1: Syncing with upstream VS Code..."
	# TODO (Sprint 6): Implement upstream sync
	# git fetch upstream
	# git rebase upstream/main
	echo "  [stub] Upstream sync — implement in Sprint 6"
else
	echo "▶ Step 1: Skipping upstream sync (--skip-sync)"
fi

# ── Step 2: Apply fork patches ────────────────────────────────────────────────
echo ""
echo "▶ Step 2: Applying AutoDev fork patches..."
# TODO (Sprint 6): Apply patches from patches/
# git am patches/*.patch
echo "  [stub] Fork patches — implement in Sprint 6"

# ── Step 3: Install dependencies ─────────────────────────────────────────────
echo ""
echo "▶ Step 3: Installing dependencies..."
cd "$REPO_ROOT"
yarn install --frozen-lockfile

cd "$REPO_ROOT/extensions/autodev"
npm ci

# ── Step 4: Compile TypeScript ────────────────────────────────────────────────
echo ""
echo "▶ Step 4: Compiling TypeScript..."
cd "$REPO_ROOT"
yarn compile

# ── Step 5: Build AutoDev extension ──────────────────────────────────────────
echo ""
echo "▶ Step 5: Building AutoDev extension..."
gulp compile-extension:autodev
# TODO (Sprint 6): Add webview bundle build
# node extensions/autodev/esbuild.webview.mts

# ── Step 6: Package ───────────────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Packaging..."
# TODO (Sprint 6): Implement electron-builder packaging
# TARGETS=""
# $PLATFORM_MAC   && TARGETS="$TARGETS --mac"
# $PLATFORM_WIN   && TARGETS="$TARGETS --win"
# $PLATFORM_LINUX && TARGETS="$TARGETS --linux"
# node build/electron-builder.js $TARGETS
echo "  [stub] Packaging — implement in Sprint 6"

echo ""
echo "✅ Build complete."
