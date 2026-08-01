<p align="right">🇷🇺 <a href="README.md">Русский</a> | 🇬🇧 <strong>English</strong> | 🇨🇳 <a href="README_ZH.md">中文</a></p>

<h1>Real-time Visualization of Claude and Codex AI Agents in your browser</h1>

<p align="center">
  <img src="docs/images/main_picture_agent_visualization.png" width="980" alt="Main agent visualization screen" />
</p>
YouTube: <a href="https://www.youtube.com/watch?v=seJ8nwOdRYA" target="_blank">https://www.youtube.com/watch?v=seJ8nwOdRYA</a>

<p>A pixel art office for <code>Claude CLI</code>, <code>Claude macOS app</code>, with basic <code>Codex</code> agent support.</p>

<p>This is a standalone browser app for Claude-powered agent sessions. Agents spawn into a pixel office, cluster around related work, sit at desks, rest on sofas when idle, and expose useful runtime context in sidebars. Does not require an API, uses your account. No extra token costs.</p>


<h2>Summary</h2>

<p>This project gives you a visual operations layer over Claude sessions: hierarchy, activity, token usage, agent-to-agent communication, and optional GitHub issue tracking.</p>

<h2>Visual Overview</h2>

<p>The UI is built as a live office map instead of a terminal log dump: hierarchy, clustering, communication, approval waits, spawn points, and sidebars are visible at a glance.</p>

<h3>Main office</h3>

<p align="left">
  <img src="docs/images/big_office_for_thousand_agents.png" width="920" alt="Large office" />
</p>

<h3>Boss seat</h3>

<p align="left">
  <img src="docs/images/boss_chair.png" width="520" alt="Boss chair" />
</p>

<h3>Hierarchy</h3>

<p align="left">
  <img src="docs/images/hierarchy_of_agents.png" width="260" alt="Agent hierarchy" />
</p>

<h3>Grouping by clusters</h3>
<p align="left">
  <img src="docs/images/grouping_by_cluster.png" width="260" alt="Agent clustering" />
</p>

<h3>Communication tracking</h3>

<p align="left">
  <img src="docs/images/communication_between_agents.png" width="260" alt="Communication between agents" />
</p>

<h3>Events</h3>

<p align="left">
  <img src="docs/images/events_tracking.png" width="260" alt="Event tracking" />
</p>

<h3>Approval alerts</h3>

<p align="left">
  <img src="docs/images/show_waiting_for_approval_from_agents.png" width="340" alt="Waiting for action approval" />
</p>

<h3>Spawn position</h3>

<p align="left">
  <img src="docs/images/spawn_position_setup.png" width="560" alt="Spawn position setup" />
</p>

<h3>Import/export for sharing</h3>

<p align="left">
  <img src="docs/images/impor_export_layout.png" width="560" alt="Import and export layout" />
</p>

<h3>Extra assets</h3>
<p align="left">
  <img src="docs/images/extra_assets.png" width="560" alt="Extended asset pack" />
</p>

<h3>Codex support</h3>

<p align="left">
  <img src="docs/images/codex_support.png" width="260" alt="Codex support" />
</p>

<p align="left">
  <img src="docs/images/codex_support1.png" width="560" alt="Codex support, additional example" />
</p>

<h3>HUD — Agent Metrics Dashboard</h3>

<p align="left">
  <img src="docs/images/hud_metrics.png" width="920" alt="HUD — agent metrics summary" />
</p>

<p>Full-screen metrics panel: tokens, cost estimates, cache hit rates, context usage per agent. Sort by any column. Bottleneck warnings for low cache hit and high context usage.</p>

<h3>Idle activities: sofa, coffee, smoking</h3>

<p align="left">
  <img src="docs/images/smoking_agent.png" width="400" alt="Smoking agent" />
</p>

<p>Idle agents pick one of three activities (33% each): sofa rest, coffee at the cooler, or a smoke break. Each has its own sprite and animation.</p>

<h3>Team visualization</h3>

<p align="left">
  <img src="docs/images/team_clusters.png" width="560" alt="Team clusters — tile-based team highlighting" />
</p>

<p>"Show teams" button draws tile-based cluster areas with solid thick perimeter borders. Auto-detects hierarchy via parentAgentId chain. Convex hull unifies all team members into a single connected region.</p>

<h3>Share Office</h3>

<p align="left">
  <img src="docs/images/share_office.png" width="560" alt="Share Office — temporary viewing link" />
</p>

<p>Share button generates a temporary link (10 or 60 minutes) for friends and colleagues. Read-only spectator mode: no admin controls, no Tasks sidebar. Public URL support via SSH tunnel + relay server. Mobile devices see a "desktop only" notice.</p>

<h3>Desktop Notifications</h3>

<p>Browser notifications on permission request, task completion, new agent spawn. Toggle in Settings.</p>

<h3>Multi-Daemon (experimental)</h3>

<p>Connect to remote pixel-agents servers. Unified office view with agent ID namespacing. Configured via <code>~/.pixel-agents/config.json</code>.</p>

<h3>Cross-Platform</h3>

<p>Works on macOS, Linux, Windows. Replaced AppleScript with platform-agnostic utilities.</p>

<h2>Features</h2>

<ul>
  <li>Boss chair: only BOSS/MEGABOSS agents can sit there. Lead and other agents use regular seats.</li>
  <li>Strict hierarchy: the agent that spawned another agent is higher in the hierarchy.</li>
  <li>Cluster behavior: agents gather nearby and visually gravitate toward related workers.</li>
  <li>Left sidebar with agents, their roles, tokens, context, and statuses.</li>
  <li>Separate sidebar with tasks from the GitHub repository.</li>
  <li>Extended item pack.</li>
  <li>Customizable pipeline progress bar via <code>~/.pixel-agents/config.json</code>.</li>
  <li>Rich set of built-in office assets, working out of the box.</li>
  <li>Events sidebar showing agent-to-agent communication.</li>
  <li>View a specific agent's chat and deep inspection on double-click.</li>
  <li>Agent spawn and exit coordinates are reflected in layout and rendering.</li>
  <li>Coordinate highlighting, cell type highlighting, and agent labels.</li>
  <li>Smart agent naming based on specialization.</li>
  <li>When idle, agents may go to the sofa, grab coffee, or take a smoke break (33/33/33); each activity has its own sprite and animation.</li>
  <li>Soft zoom via touchpad/pinch and smooth canvas panning.</li>
  <li>Fit button — auto-scales the office between sidebars.</li>
  <li>Basic Codex session and subagent support is available, but still an early version.</li>
</ul>

<h2>Requirements</h2>

<ul>
  <li><code>Claude CLI</code> or <code>Claude macOS app</code> (macOS, Linux, Windows)</li>
  <li>Node.js <code>20.19+</code></li>
  <li><code>npm</code></li>
  <li>Optional: GitHub CLI <code>gh</code> for the TASKS sidebar</li>
</ul>

<h2>Getting Started</h2>

<p>One command — office is running:</p>

<pre><code class="language-bash">npx office-for-claude-agents
</code></pre>

<p>Automatically installs dependencies, builds the project, and opens the browser at <code>http://localhost:9876</code>.</p>

<h3>Control server security</h3>

<p>By default the server binds to <code>127.0.0.1</code> only. To explicitly enable remote mode, set a bind address and a long random token:</p>

<pre><code class="language-bash">PIXEL_AGENTS_BIND_HOST=0.0.0.0 \
PIXEL_AGENTS_AUTH_TOKEN='replace-with-a-long-random-token' \
npm start
</code></pre>

<p>Remote mode refuses to start without <code>PIXEL_AGENTS_AUTH_TOKEN</code>. Open the UI with <code>?auth=TOKEN</code>; use HTTPS or an SSH tunnel. Permission-bypassed Claude startup is available only to loopback clients.</p>

<details>
  <summary>From source</summary>

<pre><code class="language-bash">git clone https://github.com/percheniy/office-for-claude-agents.git \
  &amp;&amp; cd office-for-claude-agents \
  &amp;&amp; npm install \
  &amp;&amp; npm start
</code></pre>
</details>

<p>Open:</p>

<pre><code>http://localhost:9876
</code></pre>

<p>On first launch the app writes <code>~/.pixel-agents/layout.json</code> from the bundled default office layout that already ships in this repository.</p>

<p>The app auto-detects the standard session roots at <code>~/.claude/projects</code>, <code>~/.codex/sessions</code>, and <code>~/.codex/archived_sessions</code>. If your setup uses custom locations, override them with <code>PIXEL_AGENTS_CLAUDE_PROJECTS_DIR</code>, <code>PIXEL_AGENTS_CODEX_SESSIONS_DIR</code>, <code>PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR</code>, or <code>~/.pixel-agents/config.json</code>.</p>
<p>Path precedence is environment variable → <code>sessionSources</code> in config → default path. A missing directory does not break startup; the watcher will pick it up when it appears.</p>

<h2>Usage</h2>

<h3>Claude CLI / Claude macOS app</h3>

<p>The app watches:</p>

<ul>
  <li><code>~/.claude/projects</code></li>
  <li><code>~/.codex/sessions</code></li>
  <li><code>~/.codex/archived_sessions</code> — for archived Codex threads</li>
</ul>

<p>This is enough for <code>Claude CLI</code>, <code>Claude macOS app</code>, and basic <code>Codex</code> agent display.</p>

<p>If standard directories are missing, the app still starts and explicitly shows in the left sidebar which paths were checked and how to override them.</p>

<h3>OpenCode, Copilot, and other CLI sources</h3>

<p>Connect local JSONL exports or hook events without cloud APIs:</p>

<pre><code class="language-bash">PIXEL_AGENTS_OPENCODE_SESSION_DIR=/path/to/opencode-jsonl \
PIXEL_AGENTS_COPILOT_SESSION_DIR=/path/to/copilot-session-state \
PIXEL_AGENTS_EVENTS_DIR=/path/to/generic-agent-events \
npm start
</code></pre>

<p>The adapters read local JSONL files or hook/event exports: Copilot uses <code>events.jsonl</code>, while OpenCode uses JSONL in the configured directory. OpenCode's native SQLite database is intentionally not read directly, avoiding a new dependency and database-write risk. OpenCode, Gemini, Kimi, Qwen, DeepSeek, and future tools can emit normalized JSONL events; supported kinds are <code>session_start</code>, <code>tool_start</code>, <code>tool_end</code>, <code>message</code>, <code>stats</code>, <code>status</code>, <code>parent</code>, and <code>session_end</code>. Unknown provider names are preserved and shown as badges.</p>

<h3>tmux and Remote-SSH</h3>

<p>Sessions on a local or Remote-SSH host are not terminated when the browser disconnects: the app binds the transcript to its PID, process start time, host, and tmux pane. Cards show <code>live</code>, <code>detached</code>, <code>stale</code>, and <code>dead</code>; a verified tmux pane gets a <code>Reattach tmux</code> button that opens the same pane. Without tmux, the existing transcript watchers continue to work.</p>

<p>For a live/detached tmux session, the card can also send a short prompt, interrupt the current turn, or approve/deny a pending permission. Every command re-checks provider, host, project, session, PID, process start time, and pane; transcript modification is verified after sending. Anonymous and read-only share clients do not receive control commands.</p>

<pre><code class="language-json">{
  "sessionSources": {
    "claudeProjectsDir": "/absolute/path/to/claude/projects",
    "codexSessionsDir": "/absolute/path/to/codex/sessions",
    "codexArchivedSessionsDir": "/absolute/path/to/codex/archived_sessions"
  }
}
</code></pre>

<h3>TASKS sidebar</h3>

<p>By default, TASKS works in generic mode:</p>

<ul>
  <li>shows open GitHub issues for the active repository;</li>
  <li>does not inherit any custom pipeline;</li>
  <li>degrades gracefully if <code>gh</code> is not configured.</li>
</ul>

<p>To add your own pipeline progress bar, add a config to <code>~/.pixel-agents/config.json</code>:</p>

<pre><code class="language-json">{
  "githubTasks": {
    "enabled": true,
    "maxIssues": 30,
    "pipeline": {
      "enabled": true,
      "states": [
        { "id": "todo", "label": "To Do", "color": "#fc0", "labels": ["todo", "backlog"] },
        { "id": "in_progress", "label": "In Progress", "color": "#3794ff", "labels": ["in-progress", "wip"] },
        { "id": "review_ready", "label": "Review", "color": "#a78bfa", "labels": ["review-ready"] },
        { "id": "done", "label": "Done", "color": "#5ac88c", "labels": ["done"] },
        { "id": "blocked", "label": "Blocked", "color": "#e55", "labels": ["blocked"] }
      ],
      "gates": [
        { "gate": 5, "label": "DOC" },
        { "gate": 8, "label": "PLN" },
        { "gate": 11, "label": "REV" }
      ]
    }
  }
}
</code></pre>

<h2>Layout Editor</h2>

<ul>
  <li>Export / import layout JSON</li>
  <li>Boss chair and role-restricted seats</li>
  <li>Spawn-point editing</li>
  <li>Coordinate highlighting</li>
  <li>Cell type highlighting</li>
  <li>Furniture placement, rotation, delete, undo/redo</li>
  <li>Touchpad zoom + pan for large offices</li>
</ul>

<h2>Office Assets</h2>

<p>Built-in assets ship with the repo and are enough for out-of-the-box use.</p>

<p>The main built-in pack lives in <code>webview-ui/public/assets</code>: characters, floors, walls, furniture manifests, sprites, and the bundled default layout.</p>

<p>Additional assets can be connected via external asset directories. If you have commercial tilesets, mount them separately and locally — do not commit them to a public repository without a license.</p>

<h2>Tech Stack</h2>

<ul>
  <li>Node.js</li>
  <li>Express</li>
  <li>WebSocket (<code>ws</code>)</li>
  <li>React 19</li>
  <li>TypeScript</li>
  <li>Vite</li>
  <li>Canvas 2D rendering</li>
  <li><code>gh</code> CLI integration for optional issue tracking</li>
</ul>

<h2>Known Limitations</h2>

<ul>
  <li>Codex support is basic and still needs refinement.</li>
  <li>TASKS sidebar depends on <code>gh</code> authentication if you want live GitHub issues.</li>
  <li>Pipeline progress is opt-in via config and is not inferred magically.</li>
  <li>Claude and Codex session formats may evolve; parser updates will be needed over time.</li>
  <li>Share links require an SSH tunnel to a public server for external access; tokens are stored in memory and reset on server restart.</li>
</ul>

<h2>GitHub Stars</h2>

<a href="https://www.star-history.com/?repos=percheniy%2Foffice-for-claude-agents&type=date&legend=top-left">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/percheniy/office-for-claude-agents?style=for-the-badge&logo=github" />
</a>

<h2>Credits</h2>

<ul>
  <li><a href="https://github.com/pablodelucca/pixel-agents">pablodelucca/pixel-agents</a> by Pablo De Lucca</li>
  <li>Pablo De Lucca for standalone groundwork</li>
  <li>Sergey Gridchin for public standalone additions, Codex support, task sidebar generalization, richer inspection, and release packaging</li>
</ul>

<p>Copyright and project attribution: <a href="https://github.com/percheniy">Sergey Gridchin (@percheniy)</a>. Keep the notices in <code>LICENSE</code> and <code>NOTICE</code> when copying or modifying covered additions.</p>

<details>
  <summary>License</summary>

  <p>This repository contains code derived from or based on <code>pablodelucca/pixel-agents</code>.</p>

  <ul>
    <li>Original upstream code remains under the MIT License.</li>
    <li>Original copyright notices and license notices must be preserved.</li>
    <li>Clearly marked files created by Sergey Gridchin are governed by the Sergey Source-Available Noncommercial License 1.0 as stated in the root <code>LICENSE</code> file.</li>
    <li>That separate license applies only to clearly marked Sergey-authored additions, not to upstream-origin or derivative MIT-governed portions.</li>
    <li>If this repository is a fork or substantial modification of <code>pixel-agents</code>, it is not legally safe to claim a stricter license for the whole repository in a way that removes rights already granted by MIT.</li>
    <li>In case of conflict, the original upstream MIT License continues to govern all upstream portions and derivative portions that remain subject to that license.</li>
  </ul>

  <p>Short form:</p>

  <pre><code>Licensing notice

This repository includes code derived from or based on pablodelucca/pixel-agents.
Original upstream code remains subject to its original MIT License, and all
applicable copyright and license notices must be preserved.

Unless otherwise stated in a file header, files originating from the upstream
project or derived from it are provided under the MIT License.

Files and materials clearly marked as:
Copyright (c) 2026 Sergey Gridchin
are licensed under the Sergey Source-Available Noncommercial License 1.0.

In case of conflict, the original upstream MIT License continues to govern all
upstream portions and derivative portions that remain subject to that license.
</code></pre>

  <p>See the root <code>LICENSE</code> file for the canonical text used in this repository.</p>
</details>
