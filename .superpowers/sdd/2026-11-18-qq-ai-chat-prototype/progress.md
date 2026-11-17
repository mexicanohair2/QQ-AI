# SDD ledger — plan: docs/superpowers/plans/2026-11-18-qq-ai-chat-prototype.md

Base: b00dcf417a56c55f9525c37c8ab721bc6ec353e5
Workspace: isolated GitHub branch `feature/qq-ai-chat-prototype` (local clone unavailable in this environment).

Pre-flight: Task 1 establishes app/test harness; Task 2 provides ChatMessage/ChatProvider consumed by Task 4; Task 3 provides async persistence consumed by Task 4; Task 4 hook consumed by Task 5 UI. Interfaces align in the approved plan. Task 6 deployment depends on build output from Task 1 and all app files from Tasks 2–5.

Ruling: Use a dedicated remote feature branch as the isolated workspace — local git worktree creation is unavailable because the execution container cannot resolve github.com; the remote branch preserves main and enables GitHub Actions verification — cost if wrong: no local filesystem workflow or browser automation during implementation.
