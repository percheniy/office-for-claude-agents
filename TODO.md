# Product TODO

This list contains only confirmed findings from the 2026-08-01 product and code review.

## P0 — protect users and their work

- [x] [#4](https://github.com/percheniy/office-for-claude-agents/issues/4) Bind the control server to loopback by default. Require explicit remote mode and authentication before exposing WebSocket commands. Never allow remote callers to launch Claude with `--dangerously-skip-permissions`.
- [x] [#1](https://github.com/percheniy/office-for-claude-agents/issues/1) Preserve custom layouts during bundled layout upgrades. Create a timestamped backup and provide a visible recovery path before replacing user data.
- [x] [#6](https://github.com/percheniy/office-for-claude-agents/issues/6) Never terminate an unknown process that occupies the configured port. Verify PID ownership and keep PID state per port.

## P1 — restore promised behavior and release confidence

- [ ] [#7](https://github.com/percheniy/office-for-claude-agents/issues/7) Support the documented Claude and Codex session directory environment variables and `sessionSources` config from one shared path resolver.
- [ ] [#2](https://github.com/percheniy/office-for-claude-agents/issues/2) Fix source installation so the documented command builds `dist/server.js` before `npm start`.
- [ ] [#5](https://github.com/percheniy/office-for-claude-agents/issues/5) Track tool completion duration by `toolId` so parallel tools update the correct history entry.
- [ ] [#3](https://github.com/percheniy/office-for-claude-agents/issues/3) Make TypeScript and ESLint pass, then add focused local tests for parsers, WebSocket permissions, layout migration, and model recognition.
- [x] Recognize popular model families and preserve readable names for unknown future models. Covered providers: Anthropic, OpenAI/Codex, Google Gemini, Moonshot/Kimi, DeepSeek, Alibaba/Qwen, xAI/Grok, Mistral, Meta/Llama, Cohere, Amazon/Nova, Microsoft/Phi, and Zhipu/GLM.

## Product demand backlog

### P0

1. [x] [#12](https://github.com/percheniy/office-for-claude-agents/issues/12) Ingest OpenCode, GitHub Copilot, and future agent providers through one `AgentSource` contract and generic local event input.
2. [x] [#9](https://github.com/percheniy/office-for-claude-agents/issues/9) Keep tmux and SSH sessions alive, distinguish detached from dead agents, and safely reattach to the same process.
3. [ ] [#8](https://github.com/percheniy/office-for-claude-agents/issues/8) After security issue [#4](https://github.com/percheniy/office-for-claude-agents/issues/4), securely send prompts, approve or deny permissions, interrupt work, and focus the owning session from the browser.

### P1

4. [ ] [#11](https://github.com/percheniy/office-for-claude-agents/issues/11) Add a session picker with provider, project, state, history, and safe resume.
5. [ ] [#10](https://github.com/percheniy/office-for-claude-agents/issues/10) Load persistent custom character packs with validation and bundled fallback.

## Non-goals

- No provider cloud APIs or paid SDKs: session data comes from local transcripts, adapters, or hooks.
- No exhaustive version registry: unknown future model names must remain visible through the generic fallback.
- No architecture rewrite or new framework.
