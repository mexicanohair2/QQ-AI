# QQ AI — Product and Technical Design

**Date:** 2026-11-18  
**Status:** Draft for user approval  
**Repository:** `mexicanohair2/QQ-AI`  
**Product name:** QQ AI

## 1. Purpose

QQ AI is a mobile-first personal AI assistant developed as an independent product and repository. The first goal is to create a reliable prototype that can be tested separately from QQCross. Once the prototype is stable and its behavior is verified, selected components may later be integrated with QQCross.

The product should feel like a capable, responsive assistant rather than a thin chat wrapper. Its interface should be calm and polished, with smooth transitions, a distinctive spherical energy avatar, and a restrained dark burgundy-purple visual identity. Kimi is a usability reference for conversational flow, not a template to copy; QQ AI should have its own interaction design and visual identity.

## 2. Goals

- Provide a useful conversational assistant with a consistent chat experience.
- Support a hybrid inference architecture: local model when available, online model when needed or selected.
- Use Qwen as the primary candidate for local inference, subject to device/browser benchmarks.
- Work well on mobile browsers and be installable as a PWA where supported.
- Keep the application usable when offline for supported local-model tasks.
- Add voice input and spoken responses as capabilities, with graceful fallbacks.
- Establish an extensible tool/action layer so future assistant capabilities can be added without coupling them to a specific model provider.
- Keep user conversations, preferences, and assistant memory logically separated by account.
- Prepare for eventual shared QQ account authentication with QQCross without coupling the prototype to QQCross prematurely.
- Protect per-user online usage quotas and prevent one user's activity from consuming another user's personal allowance.
- Keep local inference separate from online inference accounting.

## 3. Non-goals for the first prototype

- Training a foundation model from scratch.
- Building or operating a private GPU data center.
- Replacing QQCross or changing its existing features.
- Integrating QQ AI into QQCross before QQ AI is independently tested and approved.
- Promising identical model quality across all devices.
- Treating a single browser runtime or a single hardware acceleration API as universally available.

## 4. Approaches considered

### A. Fully cloud-based assistant

All inference runs on remote servers.

**Advantages:** consistent model availability, easier to update models, lighter client.  
**Trade-offs:** internet required for every answer, server costs, online quota use for all requests.

### B. Fully local assistant

All inference runs on the user's device.

**Advantages:** offline use, privacy advantages for local processing, no online inference cost per request.  
**Trade-offs:** limited model size and quality, device heat/memory/performance constraints, browser compatibility differences.

### C. Hybrid assistant — selected

The client can run a compact local model and also connect to an online inference service. The application chooses or exposes the appropriate route based on availability, user settings, task needs, and device capability.

**Why selected:** this balances offline capability and low marginal inference cost with access to stronger online models when required. It also fits the goal of supporting different mobile devices.

## 5. Target users and devices

The primary experience is for a single person using a phone browser. Initial device targets include HONOR 400, iPhone 13 Pro Max, Samsung Galaxy S23 Ultra, and iPhone 15 Pro Max. A Redmi device was also mentioned, but its exact model is unconfirmed.

The interface must adapt to narrow screens, virtual keyboards, browser safe areas, and varying memory/performance budgets. Desktop support may be useful for testing, but mobile is the design priority.

## 6. Product experience

### 6.1 Chat

- Clear conversation list and current conversation view.
- Streaming-style response presentation when supported by the selected inference provider.
- Stop generation, retry, copy, and regenerate controls.
- Clear indication of whether a reply is being generated locally or online.
- Friendly handling of network loss, model loading, unsupported hardware, and provider errors.
- No fake loading states that imply work is happening when it is not.

### 6.2 Visual direction

- Calm dark burgundy-purple gradients.
- No harsh neon, aggressive glow, or hot-pink emphasis.
- A spherical energy avatar that can subtly react to idle, listening, thinking, and speaking states.
- Smooth, restrained transitions; animation must not delay interaction or reduce accessibility.
- Responsive layout with touch targets suitable for phones.

### 6.3 Local and online modes

- Local Qwen inference is preferred for supported offline/basic tasks when the model is available and device performance is acceptable.
- Online inference is used for tasks that need stronger capabilities, when local inference is unavailable, or when the user selects online mode.
- The UI must clearly communicate the active route.
- The user should be able to choose the route where practical; automatic routing must not silently upload private conversation content without clear disclosure and user control.
- Local model availability and performance are runtime facts, not assumptions based only on the device name.

### 6.4 Voice

- Voice input is a planned capability.
- Offline speech recognition may use a Whisper WASM-based candidate, subject to size and performance tests.
- Spoken output should use the device's available speech synthesis first, with an optional higher-quality online provider later.
- Voice is optional; text chat must remain fully usable.

### 6.5 Tools and extended capabilities

- Keep tool invocation behind a permission-aware orchestration layer rather than embedding app actions directly in model prompts.
- Each tool must declare its inputs, permissions, confirmation requirements, and failure behavior.
- Start with a small, safe set of capabilities; add external integrations only when their value and permission boundaries are clear.

### 6.6 Memory and personalization

- Conversation history and user preferences should be stored separately per account.
- Memory should be inspectable and controllable by the user.
- The assistant must distinguish persistent user preferences from temporary conversation context.
- The prototype should use a storage abstraction so its initial development identity/storage can later be replaced by shared QQ authentication and account-scoped storage.

## 7. Proposed technical architecture

### 7.1 Client

- Mobile-first web application, designed as a PWA.
- TypeScript-based frontend is the proposed default.
- Keep UI, conversation orchestration, model routing, and persistence as separate modules.
- Do not bind the app to one browser-only hardware API.

### 7.2 Local inference

Primary candidate: Qwen3.5-0.8B in a quantized ONNX-compatible format, previously estimated at roughly 485 MB for one candidate artifact. This is **not yet a final model selection**.

Candidate runtime direction:
- Transformers.js with ONNX Runtime Web.
- WebGPU acceleration when available.
- WASM/CPU fallback where supported.
- Model download progress, storage checks, cancellation, and recovery after interrupted downloads.
- Benchmark actual latency, memory use, output quality, and thermal behavior on target devices before committing to the model/runtime combination.

Do not assume that a model can run in every mobile browser merely because WebGPU exists on some devices. The runtime must feature-detect capabilities and provide a clear fallback.

### 7.3 Online inference

- Use a provider abstraction rather than hard-coding one model vendor into the UI.
- Keep API credentials on a trusted backend; never ship privileged provider keys in client code.
- Enforce per-account quotas and server-side rate limits.
- Record usage only for online inference. Local inference must not consume the online quota.
- Provide explicit handling for quota exhaustion, provider outages, and network failures.

Exact online provider, model, pricing, and quota values remain open decisions and must be chosen after cost and quality evaluation.

### 7.4 Backend and identity

- Supabase is the leading backend candidate because QQCross already uses it, but no QQ-AI shared authentication is implemented yet.
- During the independent prototype, use a replaceable development identity adapter.
- Later, integrate shared QQ authentication only after the prototype is stable and the account model is agreed.
- All server-side data access must be account-scoped and protected by authorization rules.
- Do not copy QQCross production data or modify its schema as part of the initial prototype.

### 7.5 Storage

- Use IndexedDB for structured client-side data and evaluate OPFS only where it materially helps model storage.
- Treat browser storage as evictable and quota-limited; provide model re-download and recovery paths.
- Avoid storing secrets in browser storage.
- Design server persistence so conversation history and user settings can be synchronized securely when online.

## 8. Privacy, safety, and reliability

- Clearly distinguish local processing from online processing.
- Do not send conversation content to an online provider without an explicit online route or a clearly disclosed routing choice.
- Keep credentials and privileged operations on the backend.
- Validate all backend inputs and enforce per-account authorization.
- Do not expose one user's history, settings, or quota to another user.
- Add graceful handling for offline state, interrupted model downloads, unsupported runtimes, and inference failures.
- Avoid claiming that local inference is private in an absolute sense; browser/device storage and operating-system behavior still matter.

## 9. Quotas and shared account direction

The intended future experience is one QQ account shared between QQCross and QQ AI, with separate personal profiles, conversation history, settings, and online AI allowances.

- Each account has its own online usage allowance.
- Shared infrastructure limits protect the service, but one user's consumption must not debit another user's personal allowance.
- Local Qwen inference does not consume online inference allowance.
- Exact allowance sizes, reset periods, and any paid tiers are intentionally undecided.

## 10. Delivery phases

### Phase 0 — design and validation
- Approve this design.
- Write an implementation plan.
- Verify current repository state and choose a minimal deployable frontend stack.
- Benchmark the local model/runtime on target devices before treating it as supported.

### Phase 1 — independent chat prototype
- Establish application structure and mobile-first visual foundation.
- Implement chat UI and a mock/provider adapter.
- Implement development identity and local conversation persistence.
- Add robust loading, error, and offline states.

### Phase 2 — local model spike and integration
- Test candidate Qwen model artifacts and browser runtimes.
- Measure model download size, first-token latency, generation speed, memory use, and stability.
- Integrate only if results meet agreed device requirements; otherwise compare smaller or alternative Qwen variants.

### Phase 3 — online inference and quota service
- Add a secure server-side provider adapter.
- Add per-account online usage accounting and rate limits.
- Verify local requests never debit online quota.

### Phase 4 — voice, memory, and polish
- Add voice input/output behind capability checks.
- Add user-controlled memory and preferences.
- Complete accessibility, mobile layout, and performance checks.

### Phase 5 — future QQ integration
- Review the stable QQ-AI prototype.
- Design shared QQ authentication and data boundaries.
- Integrate into QQCross only after explicit approval and regression checks.

## 11. Acceptance criteria

The prototype is not considered complete merely because a page loads. At minimum:

- It opens reliably on supported mobile browsers without an infinite loading state.
- Core chat interactions work with touch and the virtual keyboard.
- The UI fits narrow phone screens without horizontal overflow.
- The app reports model loading, route selection, and errors honestly.
- Local inference is tested on real target hardware before being called supported.
- Online provider credentials are not exposed in client assets.
- User data and quotas are isolated by account in backend tests.
- Local inference does not change online usage accounting.
- Interrupted downloads and network loss recover without corrupting the conversation.
- A test checklist and known limitations are documented.

## 12. Decisions still open

These are intentionally left for implementation planning or measured experiments:

- Final frontend framework and deployment target.
- Exact Qwen artifact, quantization, tokenizer, and runtime versions.
- Which target devices can reliably run the local model in a browser.
- Online model provider and exact model selection.
- Online quota amounts and reset policy.
- Whether voice input ships in the first public prototype or a later phase.
- Exact synchronization and retention policy for conversation history.

## 13. Explicit boundaries

- QQ-AI development stays in this repository.
- QQCross remains unchanged during prototype development.
- No local terminal, Node.js, Docker, VPS, Flutter, Android Studio, or local APK build is required from the user.
- The implementation workflow should prioritize GitHub/cloud tooling and simple phone-friendly review steps.
- The assistant must report what is implemented, what has been tested, and what remains unverified without overstating progress.
