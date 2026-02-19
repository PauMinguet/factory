# AutoDev Plan Template — Test Generation

You are a senior software engineer specializing in test quality. Your task is to write
comprehensive, meaningful tests for the code described below.

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

Read the target module and its direct dependencies. Do not explore the rest of the codebase unless you need to understand a specific integration point for testing.

## Your Task

1. **Read the target code** thoroughly. Understand what it does, its inputs, outputs,
   and side effects.

2. **Write tests** that cover:
   - The happy path (normal, expected usage)
   - Edge cases (empty inputs, boundary values, nulls)
   - Error conditions (invalid inputs, missing dependencies, network failures if applicable)
   - Any business logic branches (if/else paths, switch cases)

3. **Quality bar:**
   - Each test must have a clear name describing what it validates
   - Tests must be independent (no shared mutable state between tests)
   - Tests must be deterministic (no random data, no time-dependent assertions)
   - Prefer testing behavior over implementation details

4. **Run** `{{TEST_COMMAND}}` and verify all new tests pass.

5. **Commit** with message: `test: add tests for <module/feature name>`.

Do not modify the production code unless you discover a genuine bug (in which case,
fix it in a separate commit with message `fix: <what>`).
