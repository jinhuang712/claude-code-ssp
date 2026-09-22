# How to work in this repository

These rules are about *how* to work here, not about what the code does — read the code, README and
design notes for that. They apply to every session, human-prompted or autonomous.

## Workspace

- **Always work in a git worktree.** Run `/wt:worktree` before the first edit and `/wt:land` when done.
  Other sessions may share the main checkout; their uncommitted changes are not yours to touch.
  - Read-only work (reading code, running tests, taking screenshots) may happen in any checkout.
- Leave the main checkout exactly as clean as you found it.
- Never rewrite published history (force-push, rebasing pushed commits, `reset --hard` on shared
  branches) without explicit permission. Push only when asked.
- Before anything destructive (`reset --hard`, `clean`, `branch -D`, deleting files), look at what
  would be lost and say why it is safe.
- Scratch files, screenshots and logs go in the session scratchpad or a gitignored directory — never
  loose in the repo tree.

## Commits

- **Commit in small steps**: one logical change per commit. If the message needs "and", split it.
- Commit as you go; don't hold a session's work for one big commit at the end.
- Every commit must typecheck, build and pass tests on its own.
- Keep refactors, formatting and behaviour changes in separate commits.
- Follow the existing message style — check `git log --oneline -15` before the first commit.
- Never commit build output, logs, screenshots, local config or secrets.

## Code

- **Be generous with comments.** Explain *why*: the constraint, the edge case, the bug that forced
  this shape, the alternative that was rejected.
  - Every exported function, type and module gets a doc comment saying what it is for.
  - Regexes, magic numbers, timeouts, workarounds and platform quirks always get a comment.
  - Don't narrate the obvious (`// loop over items`), and keep comments true: update or delete them
    when the code under them changes.
- Match the surrounding code's naming, structure and idioms before inventing new patterns.
- Prefer the smallest change that solves the problem. Note unrelated problems for later instead of
  fixing them in the same commit.
- No new dependency without a stated reason in the commit message.
- Handle failure paths on purpose. A `catch` that swallows an error needs a comment saying why that
  is safe.

## Verify before saying "done"

- Run the typecheck and test scripts after every change, not just at the end.
- A bug fix comes with a test that fails without it, whenever that is practical.
- **UI changes must be seen, not assumed.** Drive the real page with `playwright-cli` (headless,
  configured in `.playwright/cli.config.json`; see the `playwright-cli` skill):
  - check the browser console for errors and warnings;
  - screenshot at a wide desktop width and a narrow (~390px) width, in both light and dark schemes;
  - look at the screenshots yourself before reporting.
- Restart long-running processes (dev servers, background daemons) after changing their code —
  a stale process gives misleading results.
- Report honestly: what was verified, what was not, what failed (with output). Label guesses as
  guesses.

## UI quality bar

This is a user-facing product meant for the community; polish is part of correctness.

- Use the existing design tokens (color, spacing, radius, type scale); no one-off values.
- Every interactive element works by keyboard, has a visible focus state and an accessible name.
- Design the empty, loading, error and overflow states, not only the happy path.
- Text must not clip, overlap or overflow at any supported width.

## Scope and communication

- If a request is ambiguous and the choice matters, ask. Otherwise pick the sensible default and say
  which one you picked.
- When user-facing behaviour changes, update the README / docs in the same commit.
- Finish the task you were given before proposing extra work; list follow-ups instead of doing them
  unasked.
