# QQ AI Independent Chat Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deployable, mobile-first QQ AI chat prototype with a polished burgundy-purple interface, mock inference, local conversation persistence, and honest local/online route states.

**Architecture:** Use a Vite + React + TypeScript single-page application. Keep presentation, conversation state, persistence, and inference behind separate modules; Phase 1 uses a deterministic mock provider and a replaceable development identity. Do not add real model downloads, online provider credentials, or QQCross integration in this phase.

**Tech Stack:** React, TypeScript, Vite, CSS, Vitest, React Testing Library, and GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-11-18-qq-ai-product-design.md`

## Global Constraints

- QQ AI remains an independent repository; do not modify QQCross.
- Mobile browser is the primary target; support narrow screens, safe areas, and virtual keyboards.
- Do not require the user to use a terminal, Node.js, Docker, VPS, Flutter, Android Studio, or local APK builds.
- Never place privileged provider credentials in client code.
- Do not silently send conversation content to an online service; Phase 1 makes no network inference requests.
- Local inference is not claimed as supported until tested on real target devices.
- Use calm dark burgundy-purple gradients; avoid harsh neon, aggressive glow, and hot-pink emphasis.
- Keep text chat usable without voice features.
- Report implementation and verification status accurately.

## Review Focus

- **Very narrow viewports / virtual keyboard:** chat composer and latest messages remain reachable with no horizontal overflow.
- **Empty, long, and multiline messages:** composer validation and layout remain stable; empty messages are not submitted.
- **Reload / malformed persisted data:** valid conversations restore; invalid or unavailable storage falls back safely without a blank screen.
- **Rapid repeated actions:** duplicate submissions and stale mock responses do not corrupt message order.
- **Reduced motion / unsupported browser APIs:** core chat remains usable with animation reduced and without optional browser capabilities.

---

## Phase 1 scope

This plan implements only the independent chat prototype (design Phase 1). Local Qwen benchmarking/integration, online inference and quotas, voice, persistent cross-device accounts, and QQCross integration are intentionally separate follow-up plans after the base app is reviewed.

## File map

- Create `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, and `tsconfig.node.json` for the build and type-check setup.
- Create `src/main.tsx` and `src/App.tsx` as the application entry and composition root.
- Create `src/styles/tokens.css` and `src/styles/global.css` for the design tokens, responsive layout, and accessible motion behavior.
- Create `src/types/chat.ts` for conversation/message contracts.
- Create `src/lib/id.ts` for stable client-side IDs.
- Create `src/features/chat/chatReducer.ts` and `src/features/chat/chatReducer.test.ts` for deterministic conversation state transitions.
- Create `src/features/chat/storage.ts` and `src/features/chat/storage.test.ts` for versioned local persistence with safe recovery.
- Create `src/features/chat/provider.ts` and `src/features/chat/mockProvider.ts` for the provider boundary and deterministic mock replies.
- Create `src/features/chat/useChat.ts` to coordinate reducer, persistence, and provider calls.
- Create `src/components/ChatShell.tsx`, `ConversationList.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ChatComposer.tsx`, and `RouteStatus.tsx` for the mobile chat interface.
- Create focused component tests under `src/components/*.test.tsx`.
- Create `src/test/setup.ts` and `src/test/test-utils.tsx` for shared test setup.
- Create `.github/workflows/deploy.yml` for GitHub Pages deployment and configure Vite's base path from the repository name.
- Update `README.md` with project status, browser preview/deployment notes, and known limitations.

### Task 1: Establish the Vite + React + TypeScript app and test harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/test/setup.ts`
- Create: `src/test/test-utils.tsx`
- Test: `src/App.test.tsx)

**Interfaces:**
- App entry exports the default React component from `src/App.tsx`.
- Vite serves the app at root in development and uses a repository-relative base path for Pages builds.
- Test command is `npm test -- --run`; type check is `npm run typecheck`; production build is `npm run build`.

- [ ] **Step 1: Add package manifest and scripts** — pin compatible package versions and define `dev`, `build`, `preview`, `test`, and `typecheck` scripts.
- [ ] **Step 2: Add the minimal app shell and failing smoke test** — assert that the root renders the QQ AI application landmark and product title.
- [ ] **Step 3: Run the smoke test** — confirm it fails before the shell is implemented.
- [ ] **Step 4: Implement the entry point and Vite/TypeScript configuration** — ensure strict TypeScript mode and stable repository subpath deployment.
- [ ] **Step 5: Run test, type check, and build** — all three commands must pass.
- [ ] **Step 6: Commit** — `chore: scaffold QQ AI web prototype`.

### Task 2: Define chat contracts, reducer, and provider boundary

**Files:**
- Create: `src/types/chat.ts`
- Create: `src/lib/id.ts`
- Create: `src/features/chat/chatReducer.ts`
- Create: `src/features/chat/chatReducer.test.ts`
- Create: `src/features/chat/provider.ts`
- Create: `src/features/chat/mockProvider.ts`

**Interfaces:**
- `ChatMessage`: `{ id: string; role: "user" | "assistant"; content: string; createdAt: number; status: "complete" | "pending" | "error" }`.
- `Conversation`: `{ id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number }`.
- `ChatState`: `{ conversations: Conversation[]; activeConversationId: string | null; generationId: string | null }`.
- `ChatAction`: typed actions for create/select conversation, submit user message, append/complete/fail assistant reply, stop generation, and delete conversation.
- `ChatProvider`: `send(messages: ChatMessage[], signal: AbortSignal): Promise<string>`.
- `createMockProvider(): ChatProvider` returns deterministic, clearly identified prototype responses; it performs no network requests.

- [ ] **Step 1: Write reducer tests** — cover initial state, conversation creation/selection, user submission, assistant completion, provider failure, stop, and deletion.
- [ ] **Step 2: Run reducer tests and confirm failure**.
- [ ] **Step 3: Implement typed contracts, ID helper, and reducer** — keep reducer pure; preserve chronological message order and stable conversation timestamps.
- [ ] **Step 4: Write provider contract tests** — mock provider resolves a non-empty response, respects abort, and makes no fetch/network call.
- [ ] **Step 5: Implement provider interface and mock provider**.
- [ ] **Step 6: Run focused tests and type check** — all must pass.
- [ ] **Step 7: Commit** — `feat: add chat state and mock provider boundary`.

### Task 3: Add versioned local conversation persistence

**Files:**
- Create: `src/features/chat/storage.ts`
- Create: `src/features/chat/storage.test.ts`

**Interfaces:**
- `loadConversations(storage?: Storage): Conversation[]` reads and validates the versioned storage record.
- `saveConversations(conversations: Conversation[], storage?: Storage): void` writes the current schema.
- Storage key: `qq-ai:chat:v1`.
- Persistence uses browser `localStorage` for the initial prototype; no secrets or account credentials are stored.

- [ ] **Step 1: Write tests** — round-trip valid conversations; reject malformed JSON and unknown schema versions; ignore malformed individual records; handle storage read/write exceptions without crashing.
- [ ] **Step 2: Run tests and confirm failure**.
- [ ] **Step 3: Implement schema validation and versioned storage** — validate all required fields and role/status enums before restoring data.
- [ ] **Step 4: Run storage tests** — all cases must pass.
- [ ] **Step 5: Commit** — `feat: persist prototype conversations locally`.

### Task 4: Coordinate chat lifecycle and persistence

**Files:**
- Create: `src/features/chat/useChat.ts`
- Create: `src/features/chat/useChat.test.tsx`

**Interfaces:**
- `useChat()` returns `state`, `activeConversation`, `sendMessage(content: string)`, `selectConversation(id: string)`, `createConversation()`, `deleteConversation(id: string)`, `stopGeneration()`, and `retryLastMessage()`.
- On startup, restore validated conversations or create one empty conversation.
- Every state change is persisted; generation cancellation uses `AbortController`.

- [ ] **Step 1: Write hook tests** — restore on mount, create first conversation, send user message, append mock reply, cancel generation, retry failed generation, and persist after each transition.
- [ ] **Step 2: Run tests and confirm failure**.
- [ ] **Step 3: Implement hook orchestration** — prevent duplicate in-flight submissions; ignore stale provider results after cancellation or a newer generation.
- [ ] **Step 4: Run hook tests and type check**.
- [ ] **Step 5: Commit** — `feat: coordinate chat lifecycle and recovery`.

### Task 5: Build the responsive QQ AI chat interface

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/components/ChatShell.tsx`
- Create: `src/components/ConversationList.tsx`
- Create: `src/components/MessageList.tsx`
- Create: `src/components/MessageBubble.tsx`
- Create: `src/components/ChatComposer.tsx`
- Create: `src/components/RouteStatus.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/ChatComposer.test.tsx`
- Test: `src/components/ChatShell.test.tsx`

**Interfaces:**
- `ChatShell` receives chat state and typed callbacks from `useChat`; components do not access storage or providers directly.
- `ChatComposer` receives `onSend(content: string)`, `disabled: boolean`, and `onStop()`.
- `RouteStatus` displays `Prototype · simulated reply`; it must not claim local Qwen or online inference is active.
- Conversation list supports selecting, creating, and deleting conversations.

- [ ] **Step 1: Write interaction tests** — empty message is not sent; Enter submits while Shift+Enter inserts a newline; stop control appears during generation; route label explicitly identifies mock mode; conversation selection works.
- [ ] **Step 2: Run tests and confirm failure**.
- [ ] **Step 3: Implement visual tokens and responsive shell** — dark burgundy-purple gradient, restrained spherical assistant mark, readable contrast, touch-sized controls, safe-area padding, and narrow-screen layout.
- [ ] **Step 4: Implement message list, composer, conversation list, and route status** — include loading, empty, error, retry, copy, and stop states where supported by the provider lifecycle.
- [ ] **Step 5: Add reduced-motion behavior** — respect `prefers-reduced-motion`; animation must never block input.
- [ ] **Step 6: Run component tests, type check, and production build**.
- [ ] **Step 7: Commit** — `feat: build mobile QQ AI chat interface`.

### Task 6: Deploy the prototype through GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Modify: `vite.config.ts` if required by deployment verification.

**Interfaces:**
- Workflow runs on pushes to `main` and manual dispatch.
- Build output is `dist/`; Pages artifact is uploaded and deployed using the official GitHub Pages Actions.
- Repository base path is `/QQ-AI/`; verify the actual repository casing and Pages URL before finalizing.

- [ ] **Step 1: Add the Pages workflow** — use least-privilege permissions, configure Pages, upload `dist/`, and deploy.
- [ ] **Step 2: Update README** — document project purpose, prototype-only inference status, development commands, deployment URL, and known limitations.
- [ ] **Step 3: Run all tests, type check, and production build**.
- [ ] **Step 4: Inspect the generated `dist/index.html` and asset paths** — confirm JS/CSS references include the repository base path.
- [ ] **Step 5: Commit** — `ci: deploy QQ AI prototype to GitHub Pages`.
- [ ] **Step 6: Verify GitHub Actions deployment result and open the deployed URL** — record the actual workflow status and any browser-visible issues; do not mark deployment complete until verified.

### Task 7: Final acceptance and regression review

**Files:**
- Modify: relevant tests and `README.md` only where a verified defect or missing limitation is found.

- [ ] **Step 1: Run the full test suite, type check, and production build**.
- [ ] **Step 2: Verify the five Review Focus cases** — narrow viewport/keyboard, empty and long messages, reload and malformed storage, rapid submissions/cancellation, and reduced-motion/no optional APIs.
- [ ] **Step 3: Review network behavior** — confirm Phase 1 makes no inference-provider requests and contains no provider secrets.
- [ ] **Step 4: Review repository diff** — confirm no QQCross repository, schema, or deployment was changed.
- [ ] **Step 5: Record verified behavior and known limitations in README**.
- [ ] **Step 6: Commit** — `test: verify QQ AI prototype acceptance criteria`.

## Follow-up plans (not part of this implementation)

1. **Local Qwen feasibility spike:** compare candidate Qwen artifacts and browser runtimes on actual target phones; record download size, first-token latency, tokens/sec, memory, thermal stability, and recovery behavior before selecting a supported configuration.
2. **Online inference and quota service:** select provider after quality/cost evaluation; implement server-side secrets, authenticated account-scoped quotas, rate limits, and tests proving local inference never debits online usage.
3. **Voice and user-controlled memory:** add capability-gated voice input/output and inspectable/editable persistent memory.
4. **Shared QQ identity and QQCross integration:** design account/data boundaries separately and only integrate after explicit approval and regression testing.
