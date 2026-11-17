# QQ AI

QQ AI — independent mobile-first AI assistant prototype. This repository is separate from QQCross.

## Current milestone: first real AI conversation

- Real local inference through **Qwen2.5-0.5B-Instruct** using WebLLM and WebGPU.
- No mock replies and no online inference requests.
- Model is downloaded only after the user taps **Загрузить ИИ-модель**.
- Conversation is stored locally in the browser.
- Model weights are cached by WebLLM/browser where supported.
- First model download is large (around 1 GB); a compatible WebGPU browser and enough available device memory are required.
- If WebGPU is unavailable or the device cannot allocate model memory, local inference will not start. This has not yet been verified on the target HONOR phone.

## Preview

GitHub Pages: https://mexicanohair2.github.io/QQ-AI/

## Development

- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm run build`

## Current limitations

This is the first real-inference milestone, not the final QQ AI product. Qwen 0.5B is intentionally small for an initial on-device test and is less capable than larger models. Online routing, accounts, synchronized memory, voice, tools, and QQCross integration are not implemented yet.

No conversation content is sent to an online model provider in this version. Model files are downloaded from the WebLLM model host only after the user explicitly starts setup.
