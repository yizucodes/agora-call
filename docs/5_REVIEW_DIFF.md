Review the current working tree against PLAN.md for this checkpoint only:

[PASTE CHECKPOINT NAME OR NUMBER]

Do not make changes.

Inspect, in order:
1. PLAN.md
2. git status --short
3. git diff --name-only
4. git diff

Scope the review to files relevant to this checkpoint:
- expected files listed in PLAN.md
- tracked files changed for this checkpoint
- untracked files required by this checkpoint
- untracked files imported or referenced by checkpoint files

Ignore unrelated files and prior checkpoint work unless they create a must-fix issue for this checkpoint.

Treat imported/referenced untracked files as part of the submission. If such files are needed but would be missing from a commit/patch, report that as must-fix.

Check:
1. Did this preserve checkpoint scope?
2. Does it satisfy the checkpoint behavior?
3. Did it violate repo/assessment constraints?
4. Did it unexpectedly change state shape, API shape, shared types, or data format?
5. Did it add unnecessary rewrites or out-of-scope work?
6. Are required new files included in git status/diff awareness?
7. Are there bugs or edge cases that block submission?

Report must-fix issues only, with file/line references. If there are none, say so and mention any verification run.
