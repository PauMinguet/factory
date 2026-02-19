# AutoDev Studio

## Your code editor that writes code while you're away.

---

### What is it?

AutoDev Studio is a code editor — based on the same foundation as VS Code, the tool millions of developers already use — with one major addition: a built-in AI teammate that picks up your to-do list and works through it autonomously.

You describe what you want built. You walk away. You come back to finished, tested, ready-to-ship code sitting on its own branch, waiting for your review.

No babysitting. No constant "approve this step" interruptions. No copy-pasting between a chat window and your editor. Everything happens inside one tool, on your machine, using your existing Claude subscription.

---

### How does it work?

AutoDev Studio adds a **kanban board** directly inside your editor — the same kind of task board teams use in tools like Trello or Jira, but wired into an AI agent that actually does the work.

You create tickets on the board. Each ticket is a feature, a bug fix, a set of tests, or any piece of work you'd normally sit down and code yourself. When you're ready, you tell the system to go. It plans the work, writes the code, runs your tests, and if something breaks, it fixes it — all without asking you for permission at each step.

Every ticket gets its own isolated workspace. Nothing touches your main codebase until you explicitly say "merge this in." You can run multiple tickets at the same time across different projects. The whole thing runs locally on your machine — your laptop, a Mac Mini in the corner, whatever you have.

---

### User Flows

#### 1. "I need this feature by Monday and I'm leaving for the weekend"

**Friday, 4:45 PM.** You open AutoDev Studio and create a ticket: _"Add dark mode with a toggle in the settings page. Respect the user's system preference. Persist their choice."_

You select "Full Plan" so the AI first writes up an implementation plan for you to glance at. You hit **Save & Generate Plan** and close your laptop.

**Friday, 4:52 PM.** Your phone buzzes — the plan is ready. You skim it on your phone: the AI identified the right files, outlined a theme provider approach, and listed the test cases it'll write. Looks good. You tap **Execute**.

**Friday, 5:14 PM.** Another notification: _"Dark mode completed. 5 files changed, 3 tests written, all passing."_

**Monday morning.** You open the editor, click the ticket, review the diff, checkout the branch to poke around — everything works. You hit **Merge** and move on with your week.

---

#### 2. "I have a backlog of small things I keep putting off"

You've got a list of small improvements you never get around to: make the landing page mobile-responsive, add loading spinners to the dashboard, clean up that messy utility file, write tests for the auth module.

You spend 10 minutes creating four tickets, one for each task. You pick "Direct Execute" for the simple ones and "Simple Plan" for the one that needs more thought. You hit **Execute All** and go make lunch.

An hour later, three are done and one is in review. You spend 20 minutes reviewing the work instead of 4 hours doing it yourself.

---

#### 3. "I found a bug and I want it fixed now"

A user reports that the checkout flow breaks when they have an empty cart. You create a ticket: _"Bug: checkout page crashes with an empty cart. Should show an empty state message instead of throwing an error."_

You select **Bug Fix** as the plan type. The AI analyzes your codebase, traces the issue, writes the fix, adds a regression test, and runs your full test suite. 6 minutes later, it's done. You review the one-line fix and the new test, merge it, deploy.

---

#### 4. "I want to explore whether a feature is even feasible"

You're wondering whether your app's architecture can support real-time collaboration. Before committing to building it, you create a ticket: _"Analyze the codebase to determine what changes would be needed to support real-time collaborative editing. Identify risks and level of effort."_

You select **Analysis** as the plan type. The AI digs through your codebase and produces a detailed report: which parts of your architecture support it, what would need to change, estimated complexity, and potential pitfalls. No code is written — just a clear-eyed assessment you can use to make a decision.

---

#### 5. "I inherited this project and the test coverage is terrible"

You join a project with almost no tests. You create a series of tickets targeting the most critical files: _"Write comprehensive tests for the payment processing module," "Write tests for the user authentication flow," "Write tests for the API rate limiting middleware."_

You select **Test Generation** for each. The AI reads the existing code, understands what it does, and writes meaningful tests — not boilerplate, but tests that actually catch real bugs. You run them against the codebase, see a few legitimate failures the AI caught, and now you have a safety net.

---

#### 6. "I'm managing multiple client projects"

You're a freelancer or consultant juggling three client projects. You add all three to AutoDev Studio. Each one appears in the project dropdown on your kanban board.

You queue up two tickets for Client A, one for Client B, and three for Client C. The system runs them in parallel — each on its own branch, in its own workspace, completely isolated. You check in throughout the day, review completed work, and push updates to each client's repo. What used to be a week of context-switching becomes a day of reviewing.

---

### What it's not

AutoDev Studio isn't a replacement for thinking. You still decide what to build, review everything before it ships, and own the architecture. It's more like having a junior developer who never sleeps, never gets distracted, and works through your to-do list exactly as fast as the AI can think — while you focus on the decisions that actually need a human.
