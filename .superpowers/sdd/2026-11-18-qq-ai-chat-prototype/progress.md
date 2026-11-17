# SDD ledger — plan: docs/superpowers/plans/2026-11-18-qq-ai-chat-prototype.md

Base: b00dcf417a56c55f9525c37c8ab721bc6ec353e5
Workspace: isolated GitHub branch `feature/qq-ai-chat-prototype` (local clone unavailable in this environment).

Pre-flight: Task 1 establishes app/test harness; Task 2 provides ChatMessage/ChatProvider consumed by Task 4; Task 3 provides async persistence consumed by Task 4; Task 4 hook consumed by Task 5 UI. Interfaces align in the approved plan. Task 6 deployment depends on build output from Task 1 and all app files from Tasks 2–5.

Ruling: Use a dedicated remote feature branch as the isolated workspace — local git worktree creation is unavailable because the execution container cannot resolve github.com; the remote branch preserves main and enables GitHub Actions verification — cost if wrong: no local filesystem workflow or browser automation during implementation.

Task 1: complete (commits b00dcf4..1a91a3d, tests: GitHub Actions run 44189496771 → PASS; 1 test, typecheck PASS, production build PASS).

Task 1: Ruling: Pin compatible dependencies to exact versions rather than mutable `latest` tags — repeatable dependency resolution is safer for a user-facing mobile app — cost if wrong: versions may need deliberate upgrades later.

Task 2: complete (commits 1a91a3d..1641cc0, tests: GitHub Actions run 44190052628 → PASS; 3 test files, 11 tests, typecheck PASS, production build PASS).

Task 2: Ruling: Keep mock-provider replies explicitly labelled as demonstration-only and avoid even a simulated network delay — users must not mistake prototype text for a live model response — cost if wrong: the first prototype will feel less like a finished AI until Qwen/online inference is integrated.

Task 3: complete (commits 1641cc0..11457a5, tests: GitHub Actions run 44190436834 → PASS; 4 test files, 14 tests, typecheck PASS, production build PASS).


Task 4: complete (useChat reducer orchestration, restore, persistence, cancellation, stale-response protection, retry without duplicate prompt). GitHub Actions run 44196788552 → PASS; 7 test files, 29 tests, TypeScript PASS, Vite production build PASS, production npm audit PASS.

Task 5: complete (responsive mobile-first UI, conversation navigation, create/delete, composer, stop, retry, copy, visible demo status). Regression fixes: lock composer during generation to prevent losing a typed message; restore the most recently updated conversation first. Covered by tests in App, ChatComposer, and ConversationList. Latest code verification: run 44196788552 → PASS.

Task 6: complete. GitHub Pages could not be enabled because the repository's GITHUB_TOKEN lacked permission to create a Pages site; the failed Pages workflow was removed. After user-authorized Vercel team access, deployed exact feature-branch commit 2cde9923ad87eb706a9a9db8346714a49d06fdfe as project qq-ai-preview. Deployment dpl_2WGfnRDCgtEYL2P1jw1LvNqL2ZMJ reached READY; public URL https://qq-ai-preview.vercel.app. Project SSO protection is disabled for this public static demo. Firecrawl browser verification: page opened without sign-in; title QQ AI and composer visible; test prompt "Проверка первого запроса QQ AI" was sent with Enter and the explicit demo response appeared. No physical-device verification is claimed.

Task 7: partial complete. Verified full CI, production dependency audit, no provider inference requests in the mock provider, no client provider secrets, and no QQCross/main modifications. README records the public preview URL, browser-local IndexedDB behavior, and the mock-only inference limitation. Remaining: real-device viewport/keyboard/reduced-motion acceptance and independent subagent review (no review subagent available in this environment; manual code review was performed).

Ruling: Vite 8.3.8, @vitejs/plugin-react 6.3.0, Vitest 5.1.0, Node 24 CI. Commit package-lock.json and use npm ci for repeatable installs. Production audit gate passes. Full npm audit still reports six high-severity dev-toolchain graph entries tied to upstream picomatch advisory GHSA-fc5q-39xc-vjpf; do not suppress or force-downgrade until an upstream patched release is available.

Isolation: all project changes remain in feature/qq-ai-chat-prototype. Main remains at its existing revision; QQCross was not accessed or modified.
