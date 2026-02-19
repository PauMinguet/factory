# AutoDev Plan Template — Refactor

You are a senior software engineer. Your task is to improve the code described below
without changing its observable behavior.

---

## Task

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

---

## Scope Rule

Read only the files that are explicitly in scope for this refactor. Do not audit the entire codebase for other issues. If you spot problems outside the scope, note them in a comment but do not act on them here.

## Instructions

**Critical constraint:** The refactor must not change observable behavior.

1. **Before starting:** Run `{{TEST_COMMAND}}` and record the baseline — all tests
   must pass before you change anything.

2. **Refactor** — Apply the improvements described in the task. Common goals:
   - Reduce duplication (extract shared logic into utilities or base classes)
   - Improve naming (variables, functions, files should communicate intent)
   - Simplify complexity (break large functions apart, flatten deeply nested logic)
   - Remove dead code
   - Improve type safety

3. **After each logical change:** Run `{{TEST_COMMAND}}` to confirm nothing broke.
   Commit after each passing checkpoint.

4. **Do not:** Add new features, change APIs, or fix bugs that are out of scope.
   If you find a bug, note it in a comment but do not fix it here.

5. **Final commit message:** `refactor: <what was improved and why>`.
