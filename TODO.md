# Product TODO

This list contains only confirmed findings from the 2026-08-01 product and code review.

## P0 — protect users and their work

- [ ] [#4](https://github.com/percheniy/office-for-claude-agents/issues/4) Bind the control server to loopback by default. Require explicit remote mode and authentication before exposing WebSocket commands. Never allow remote callers to launch Claude with `--dangerously-skip-permissions`.
- [ ] [#1](https://github.com/percheniy/office-for-claude-agents/issues/1) Preserve custom layouts during bundled layout upgrades. Create a timestamped backup and provide a visible recovery path before replacing user data.
- [ ] [#6](https://github.com/percheniy/office-for-claude-agents/issues/6) Never terminate an unknown process that occupies the configured port. Verify PID ownership and keep PID state per port.

## P1 — restore promised behavior and release confidence

- [ ] [#7](https://github.com/percheniy/office-for-claude-agents/issues/7) Support the documented Claude and Codex session directory environment variables and `sessionSources` config from one shared path resolver.
- [ ] [#2](https://github.com/percheniy/office-for-claude-agents/issues/2) Fix source installation so the documented command builds `dist/server.js` before `npm start`.
- [ ] [#5](https://github.com/percheniy/office-for-claude-agents/issues/5) Track tool completion duration by `toolId` so parallel tools update the correct history entry.
- [ ] [#3](https://github.com/percheniy/office-for-claude-agents/issues/3) Make TypeScript and ESLint pass, then add focused local tests for parsers, WebSocket permissions, layout migration, and model recognition.
- [x] Recognize popular model families and preserve readable names for unknown future models. Covered providers: Anthropic, OpenAI/Codex, Google Gemini, Moonshot/Kimi, DeepSeek, Alibaba/Qwen, xAI/Grok, Mistral, Meta/Llama, Cohere, Amazon/Nova, Microsoft/Phi, and Zhipu/GLM.

## Non-goals

- No provider SDKs or model APIs: model data continues to come from existing Claude and Codex session logs.
- No exhaustive version registry: unknown future model names must remain visible through the generic fallback.
- No architecture rewrite or new framework.
