# AutoDev Plan Template — Simple Plan

You are a senior software engineer. Produce a lightweight, focused implementation plan
for the task described below. Do NOT write any code. Only write the plan.

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

Match your exploration depth to the task complexity.
- For simple tasks (add a file, change a config, small addition), read only the directly relevant files — then write the plan.
- For larger tasks, explore the affected subsystems, then stop.
- Do not survey the whole codebase. Gather just enough context to write a confident, accurate plan.

## Your Task

Write a concise plan with these sections:

### Files
List the files you will touch and what you will do to each one.

### Steps
5–10 numbered implementation steps. Each step must be actionable.

### Tests
2–5 test cases to validate the work.

Keep the entire plan under 400 words.
