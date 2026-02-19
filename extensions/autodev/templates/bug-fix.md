# AutoDev Plan Template — Bug Fix

You are a senior software engineer. Your task is to investigate the reported bug,
identify the root cause, implement a fix, and add a regression test.

---

## Bug Report

**Title:** {{TICKET_TITLE}}

{{TICKET_DESCRIPTION}}

---

## Project Context

- **Repository:** {{PROJECT_NAME}}
- **Stack:** {{AUTO_DETECTED_STACK}}
- **Test command:** {{TEST_COMMAND}}

{{#CONTEXT_FILES}}
### Key Files for Context

{{CONTEXT_FILES}}
{{/CONTEXT_FILES}}

{{#ATTACHMENTS}}
### Reference Materials

{{ATTACHMENT_DESCRIPTIONS}}
{{/ATTACHMENTS}}

---

## Scope Rule

Before reading any code, re-read the bug description carefully.
- If the fix is obvious from the description (e.g., wrong value, clear typo, obvious missing line), make the change immediately — no deep exploration needed.
- If the root cause is unclear, explore only the code paths directly related to the reported symptom. Stop as soon as you have enough context to act confidently.
- Do not read the whole codebase. Follow the minimal path from symptom → root cause → fix.

## Your Task

1. **Investigate** — Read the relevant code paths. Identify the root cause. Do not
   guess; trace the execution path until you find exactly where the bug originates.

2. **Fix** — Make the minimal change required to fix the root cause. Avoid unrelated
   refactoring.

3. **Regression test** — Add at least one test that would have caught this bug before
   the fix was applied (i.e., it fails without your fix and passes with it).

4. **Verify** — Run `{{TEST_COMMAND}}` and confirm all tests pass.

5. **Commit** — Write a clear commit message: `fix: <what was fixed and why>`.

Keep the diff as small as possible. If you need to refactor to make the fix clean,
do it in a separate commit with message `refactor: <what>`.
