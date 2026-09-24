# AGENTS.md — aliexpress-invoice

## Worktrees — one lane, always

Every session — feature, chore or one-line fix — works in its own worktree under `.worktrees/`
(git-ignored), never in the main checkout. The main checkout stays on `main` and moves only by
`git pull --ff-only`: a branch parked there is how parallel sessions commit onto each other's work.
Every change reaches `main` by a PR. The why: vault `knowledge/developer/stack/git-and-prs.md`.

```bash
git status -sb && git pull --ff-only             # main checkout: sync only, never commit here
git worktree prune && git fetch -q --prune origin
git worktree add --lock --reason "$(hostname -s)" .worktrees/<slug> -b <type>/<slug> origin/main
cd .worktrees/<slug>                             # work and commit here
git push -u origin HEAD && gh pr create --base main --fill
gh pr merge --rebase --delete-branch
cd - && git pull --ff-only
git worktree unlock .worktrees/<slug> && git worktree remove .worktrees/<slug> && git branch -D <type>/<slug>
```

A locked worktree you did not create belongs to another session — leave it. `.claude/worktrees/` is
Claude Code's own subagent isolation and is managed by the harness.
