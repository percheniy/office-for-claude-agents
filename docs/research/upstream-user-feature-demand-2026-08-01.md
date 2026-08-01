# Upstream user feature demand — 2026-08-01

Source: all 86 open and closed issues in
[`pixel-agents-hq/pixel-agents`](https://github.com/pixel-agents-hq/pixel-agents/issues),
including 127 comments and 188 reactions. Counts are descriptive: GitHub does
not expose unique users across duplicate issues, so reactions must not be added
as unique-user totals.

Pure bugs and maintenance requests are excluded below.

## 1. Provider and editor independence — strongest demand

The highest-engagement requests all ask to use Pixel Agents outside one Claude
terminal path:

- GitHub Copilot: [#11](https://github.com/pixel-agents-hq/pixel-agents/issues/11)
  (44 reactions) and duplicate [#62](https://github.com/pixel-agents-hq/pixel-agents/issues/62)
  (20 reactions).
- OpenCode: [#67](https://github.com/pixel-agents-hq/pixel-agents/issues/67)
  (24 reactions).
- Cursor and other VS Code forks: [#3](https://github.com/pixel-agents-hq/pixel-agents/issues/3)
  (17 reactions) and [#24](https://github.com/pixel-agents-hq/pixel-agents/issues/24)
  (4 reactions).
- Zed: [#68](https://github.com/pixel-agents-hq/pixel-agents/issues/68)
  (8 reactions).
- General Claude/Codex/provider choice: [#4](https://github.com/pixel-agents-hq/pixel-agents/issues/4)
  (8 reactions).
- Claude native VS Code sessions: [#74](https://github.com/pixel-agents-hq/pixel-agents/issues/74)
  (7 reactions).

Our gap: model names are recognized, but runtime ingestion supports only
`claude | codex` in `server/sourceTypes.ts`. The next product feature should be
a provider adapter contract, first implemented for Copilot and OpenCode, with a
generic hook/event input for Gemini CLI, Kimi, Qwen, DeepSeek, and future tools.

## 2. Persistent external and remote sessions

Repeated requests ask to discover existing agents, keep them alive, and attach
to the same process:

- tmux/remote/headless discovery and attach: [#6](https://github.com/pixel-agents-hq/pixel-agents/issues/6)
  (4 reactions, 4 comments).
- Associate existing terminals: [#8](https://github.com/pixel-agents-hq/pixel-agents/issues/8)
  (4 reactions).
- Adopt already-running sessions: [#1](https://github.com/pixel-agents-hq/pixel-agents/issues/1)
  (3 reactions).
- tmux persistence and reattach: [#34](https://github.com/pixel-agents-hq/pixel-agents/issues/34)
  and [#211](https://github.com/pixel-agents-hq/pixel-agents/issues/211).
- Session picker/resume: [#40](https://github.com/pixel-agents-hq/pixel-agents/issues/40)
  (3 reactions).

Our project already discovers Claude/Codex transcripts outside its own process,
but it cannot prove that a transcript belongs to a live tmux pane, attach to
that pane, resume a historical session, or represent detached versus dead state.

## 3. Standalone browser or desktop application

Demand is confirmed by [#46](https://github.com/pixel-agents-hq/pixel-agents/issues/46)
(8 reactions), [#120](https://github.com/pixel-agents-hq/pixel-agents/issues/120)
(8 reactions, 7 comments), [#154](https://github.com/pixel-agents-hq/pixel-agents/issues/154),
and the Tauri fork in [#278](https://github.com/pixel-agents-hq/pixel-agents/issues/278).

Our browser standalone mode already covers the core demand. Missing extensions
are secure interaction with agents from the browser, tray/menubar presence,
always-on-top compact mode, and native packaging. These should follow security
and provider support, not replace them.

## 4. Multi-agent observability

- Agent Teams: [#59](https://github.com/pixel-agents-hq/pixel-agents/issues/59)
  (7 reactions) and [#65](https://github.com/pixel-agents-hq/pixel-agents/issues/65)
  (3 reactions).
- Token data: [#111](https://github.com/pixel-agents-hq/pixel-agents/issues/111)
  (5 reactions) and [#247](https://github.com/pixel-agents-hq/pixel-agents/issues/247).

Our project already has team grouping, hierarchy, communication events, token
usage, context fill, and HUD metrics. These are current advantages, not gaps.

## 5. Personalization and glanceable alerts

- Custom character packs: [#263](https://github.com/pixel-agents-hq/pixel-agents/issues/263)
  (1 reaction, 1 comment).
- Pets: [#261](https://github.com/pixel-agents-hq/pixel-agents/issues/261).
- More visible approval alerts: [#286](https://github.com/pixel-agents-hq/pixel-agents/issues/286).
- Model-specific floors: [#38](https://github.com/pixel-agents-hq/pixel-agents/issues/38)
  (1 reaction).

These requests are real but materially weaker than provider and persistent
session demand. Custom character overrides are the best first item in this
group because they preserve user identity across releases without expanding
the core runtime.

## Recommended order

1. Provider adapter contract plus Copilot and OpenCode ingestion.
2. tmux/SSH live-session identity, detach, attach, and resume.
3. Secure browser control: prompt, approve/deny, interrupt, and focus session.
4. Session picker, history, and optional replay.
5. Custom character overrides and compact desktop/tray mode.

Do not prioritize pets, model floors, or decorative animations before items 1–3.
