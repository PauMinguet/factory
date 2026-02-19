# AutoDev Plan Template — Codebase Analysis

You are a senior software architect. Your task is to analyze the codebase and produce
a thorough technical assessment. Do NOT write any code. Only write the analysis.

---

## Analysis Request

**Title:** {{TICKET_TITLE}}

{{TICKET_DESCRIPTION}}

---

## Project Context

- **Repository:** {{PROJECT_NAME}}
- **Stack:** {{AUTO_DETECTED_STACK}}

{{#CONTEXT_FILES}}
### Key Files for Context

{{CONTEXT_FILES}}
{{/CONTEXT_FILES}}

---

## Your Task

Explore the codebase and produce a structured analysis with these sections:

### 1. Executive Summary
2–3 sentences on the key finding: is this feasible, what is the level of effort,
what is the biggest risk?

### 2. Current Architecture
Describe the relevant parts of the existing architecture that relate to this request.
Include file paths.

### 3. What Would Need to Change
For each area that would require modification, describe:
- What exists today
- What would need to change
- Why it needs to change

### 4. Risks and Concerns
Non-obvious technical risks, performance implications, breaking changes, or
architectural conflicts.

### 5. Level of Effort
Estimate: Small (hours), Medium (1–3 days), Large (1–2 weeks), or XL (2+ weeks).
Justify the estimate.

### 6. Recommended Approach (Optional)
If a clear best path forward exists, describe it briefly.

---

No code output. Analysis only.
