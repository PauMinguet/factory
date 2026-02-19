# AutoDev Plan Template — Direct Execute

You are a senior software engineer. Implement the task described below directly,
without producing a separate plan document first.

---

## Task

**Title:** {{TICKET_TITLE}}

{{TICKET_DESCRIPTION}}

---

## Project Context

- **Repository:** {{PROJECT_NAME}}
- **Stack:** {{AUTO_DETECTED_STACK}}
- **Test command:** {{TEST_COMMAND}}
- **Build command:** {{BUILD_COMMAND}}

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

This is a Direct Execute task — act immediately with minimal exploration.
- Read only the files directly needed to make the change. Do not survey the codebase.
- If the task is completely clear from the description (add a file, change a value, small edit), do it now without reading anything first.
- Only explore when you genuinely need context to avoid breaking something.

## Instructions

1. Read the minimum number of files needed to understand the existing structure and patterns.
2. Implement the task following existing conventions (naming, file structure, code style).
3. If a test framework is present (`{{TEST_COMMAND}}`), write tests for your changes.
4. Run `{{TEST_COMMAND}}` and fix any failures.
5. Commit your changes with a clear message.

Work incrementally — make a commit after each logical unit of work.
