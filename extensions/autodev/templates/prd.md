# AutoDev Plan Template — Full PRD

You are a senior software engineer. Your task is to produce a detailed, actionable
implementation plan (Product Requirements Document) for the feature described below.
Do NOT write any code. Only write the plan.

---

## Feature Request

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

Explore the parts of the codebase directly affected by this feature. You do not need to read every file — focus on the integration points, affected modules, and any existing patterns you must follow.

## Your Task

Produce a structured implementation plan covering all of the following sections:

### 1. Summary
One paragraph describing what will be built and why.

### 2. Files to Modify or Create
List every file that will need to change or be created, with a one-line explanation of each change.

### 3. Implementation Steps
Numbered, sequential steps an engineer would follow. Each step should be concrete enough
to execute without ambiguity (e.g., "Add a `ThemeContext` in `src/contexts/ThemeContext.tsx`
that exposes `theme` and `setTheme`").

### 4. New Dependencies
List any new packages required, with the exact install command.

### 5. Test Cases
List the test cases that should be written to validate this feature. For each test,
describe: what it tests, the input, and the expected output.

### 6. Edge Cases and Risks
Note any non-obvious failure modes, backward-compatibility concerns, or architectural
risks that the implementer should be aware of.

---

Output your plan as well-structured markdown. Be thorough but concise.
