<p align="right">🇷🇺 <a href="README.md">Русский</a> | 🇬🇧 <a href="README_EN.md">English</a> | 🇨🇳 <strong>中文</strong></p>

<h1>Claude 和 Codex AI 智能体实时可视化</h1>

<p align="center">
  <img src="docs/images/main_picture_agent_visualization.png" width="980" alt="智能体可视化主界面" />
</p>
YouTube: <a href="https://www.youtube.com/watch?v=seJ8nwOdRYA" target="_blank">https://www.youtube.com/watch?v=seJ8nwOdRYA</a>

<p>适用于 <code>Claude CLI</code>、<code>Claude macOS 应用</code>的像素风办公室，并基本支持 <code>Codex</code> 智能体。</p>

<p>这是一个独立的浏览器应用，用于 Claude 智能体会话的可视化。智能体在像素办公室中生成、按相关工作聚集、坐在桌前办公、空闲时在沙发休息，并在侧边栏中展示有用的运行时上下文。无需 API，使用您自己的账户，无额外 token 费用。</p>


<h2>概述</h2>

<p>本项目为 Claude 会话提供可视化操作层：层级关系、活动状态、token 用量、智能体间通信，以及可选的 GitHub issue 跟踪。</p>

<h2>界面概览</h2>

<p>UI 以实时办公室地图的形式呈现，而非终端日志：层级关系、聚类、通信、审批等待、生成点和侧边栏一目了然。</p>

<h3>主办公室</h3>

<p align="left">
  <img src="docs/images/big_office_for_thousand_agents.png" width="920" alt="大型办公室" />
</p>

<h3>老板座位</h3>

<p align="left">
  <img src="docs/images/boss_chair.png" width="520" alt="老板椅" />
</p>

<h3>层级关系</h3>

<p align="left">
  <img src="docs/images/hierarchy_of_agents.png" width="260" alt="智能体层级" />
</p>

<h3>聚类分组</h3>
<p align="left">
  <img src="docs/images/grouping_by_cluster.png" width="260" alt="智能体聚类" />
</p>

<h3>通信追踪</h3>

<p align="left">
  <img src="docs/images/communication_between_agents.png" width="260" alt="智能体间通信" />
</p>

<h3>事件</h3>

<p align="left">
  <img src="docs/images/events_tracking.png" width="260" alt="事件追踪" />
</p>

<h3>审批提醒</h3>

<p align="left">
  <img src="docs/images/show_waiting_for_approval_from_agents.png" width="340" alt="等待操作审批" />
</p>

<h3>生成位置</h3>

<p align="left">
  <img src="docs/images/spawn_position_setup.png" width="560" alt="生成位置设置" />
</p>

<h3>导入/导出分享</h3>

<p align="left">
  <img src="docs/images/impor_export_layout.png" width="560" alt="导入和导出布局" />
</p>

<h3>扩展资源</h3>
<p align="left">
  <img src="docs/images/extra_assets.png" width="560" alt="扩展资源包" />
</p>

<h3>Codex 支持</h3>

<p align="left">
  <img src="docs/images/codex_support.png" width="260" alt="Codex 支持" />
</p>

<p align="left">
  <img src="docs/images/codex_support1.png" width="560" alt="Codex 支持，更多示例" />
</p>

<h3>HUD — 智能体指标面板</h3>

<p align="left">
  <img src="docs/images/hud_metrics.png" width="920" alt="HUD — 智能体指标汇总" />
</p>

<p>全屏指标面板：每个智能体的 token 数、成本估算、缓存命中率、上下文使用量。支持按任意列排序。低缓存命中率和高上下文使用量的瓶颈预警。</p>

<h3>空闲活动：沙发、咖啡、吸烟</h3>

<p align="left">
  <img src="docs/images/smoking_agent.png" width="400" alt="正在吸烟的智能体" />
</p>

<p>空闲智能体会随机选择三种活动之一（各 33%）：在沙发休息、去饮水机喝咖啡或吸烟休息。每种活动都有独立的精灵图和动画。</p>

<h3>团队可视化</h3>

<p align="left">
  <img src="docs/images/team_clusters.png" width="560" alt="团队聚类 — 基于瓦片的团队高亮" />
</p>

<p>"Show teams" 按钮绘制基于瓦片的聚类区域，外围有实心粗边框。通过 parentAgentId 链自动检测层级关系。凸包算法将所有团队成员统一到一个连通区域中。</p>

<h3>分享办公室</h3>

<p align="left">
  <img src="docs/images/share_office.png" width="560" alt="分享办公室 — 临时查看链接" />
</p>

<p>分享按钮生成临时链接（10 或 60 分钟），供朋友和同事查看。只读观看模式：无管理控件，无任务侧边栏。通过 SSH 隧道 + 中继服务器支持公网 URL。移动设备显示"仅支持桌面端"提示。</p>

<h3>桌面通知</h3>

<p>浏览器通知：权限请求、任务完成、新智能体生成时触发。在设置中开启。</p>

<h3>Multi-Daemon（实验性）</h3>

<p>连接到远程 pixel-agents 服务器。统一办公室视图，智能体 ID 带命名空间。通过 <code>~/.pixel-agents/config.json</code> 配置。</p>

<h3>跨平台</h3>

<p>支持 macOS、Linux、Windows。已用跨平台工具替代 AppleScript。</p>

<h2>功能特性</h2>

<ul>
  <li>老板椅：仅 BOSS/MEGABOSS 智能体可以坐。Lead 和其他智能体使用普通座位。</li>
  <li>严格的层级关系：生成其他智能体的智能体在层级中更高。</li>
  <li>聚类行为：智能体聚集在附近，视觉上向相关工作者靠拢。</li>
  <li>左侧边栏显示智能体及其角色、token、上下文和状态。</li>
  <li>独立的 GitHub 仓库任务侧边栏。</li>
  <li>扩展物品包。</li>
  <li>可通过 <code>~/.pixel-agents/config.json</code> 自定义流水线进度条。</li>
  <li>丰富的内置办公室资源，开箱即用。</li>
  <li>事件侧边栏展示智能体间的通信记录。</li>
  <li>双击查看特定智能体的聊天和详细检查。</li>
  <li>智能体的生成和退出坐标在布局和渲染中体现。</li>
  <li>坐标高亮、单元格类型高亮和智能体标签。</li>
  <li>根据专业领域智能命名智能体。</li>
  <li>空闲时智能体可以去沙发、喝咖啡或吸烟（各 33%）；每种活动都有独立的精灵图和动画。</li>
  <li>触控板/捏合手势柔和缩放和画布平滑平移。</li>
  <li>Fit 按钮 — 在侧边栏之间自动缩放办公室。</li>
  <li>基本的 Codex 会话和子智能体支持已可用，但仍为早期版本。</li>
</ul>

<h2>系统要求</h2>

<ul>
  <li><code>Claude CLI</code> 或 <code>Claude macOS 应用</code>（macOS、Linux、Windows）</li>
  <li>Node.js <code>20.19+</code></li>
  <li><code>npm</code></li>
  <li>可选：GitHub CLI <code>gh</code> 用于任务侧边栏（TASKS）</li>
</ul>

<h2>快速开始</h2>

<p>一条命令即可启动办公室：</p>

<pre><code class="language-bash">npx office-for-claude-agents
</code></pre>

<p>自动安装依赖、构建项目并在 <code>http://localhost:9876</code> 打开浏览器。</p>

<details>
  <summary>从源码构建</summary>

<pre><code class="language-bash">git clone https://github.com/percheniy/office-for-claude-agents.git \
  &amp;&amp; cd office-for-claude-agents \
  &amp;&amp; npm install \
  &amp;&amp; npm start
</code></pre>
</details>

<p>打开：</p>

<pre><code>http://localhost:9876
</code></pre>

<h3>命令</h3>

<pre><code class="language-bash">npx office-for-claude-agents                  # 在当前终端中运行
npx office-for-claude-agents --daemon         # 后台运行，关闭终端后仍继续
npx office-for-claude-agents status           # 检查服务器是否在运行
npx office-for-claude-agents stop             # 停止服务器
npx office-for-claude-agents --port 9900      # 使用其他端口（可与任意命令组合）
npx office-for-claude-agents --no-open        # 不打开浏览器
</code></pre>

<p>首次启动时，应用会自动从仓库中内置的默认布局创建 <code>~/.pixel-agents/layout.json</code>。</p>

<p>应用自动检测标准会话目录 <code>~/.claude/projects</code>、<code>~/.codex/sessions</code> 和 <code>~/.codex/archived_sessions</code>。如果您使用自定义路径，可通过 <code>PIXEL_AGENTS_CLAUDE_PROJECTS_DIR</code>、<code>PIXEL_AGENTS_CODEX_SESSIONS_DIR</code>、<code>PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR</code> 环境变量或 <code>~/.pixel-agents/config.json</code> 覆盖。</p>

<h2>使用方法</h2>

<h3>Claude CLI / Claude macOS 应用</h3>

<p>应用监控以下目录：</p>

<ul>
  <li><code>~/.claude/projects</code></li>
  <li><code>~/.codex/sessions</code></li>
  <li><code>~/.codex/archived_sessions</code> — 归档的 Codex 会话</li>
</ul>

<p>这对于 <code>Claude CLI</code>、<code>Claude macOS 应用</code>和基本的 <code>Codex</code> 智能体显示已经足够。</p>

<p>如果标准目录不存在，应用仍会启动，并在左侧边栏中明确显示检查了哪些路径以及如何覆盖它们。</p>

<pre><code class="language-json">{
  "sessionSources": {
    "claudeProjectsDir": "/absolute/path/to/claude/projects",
    "codexSessionsDir": "/absolute/path/to/codex/sessions",
    "codexArchivedSessionsDir": "/absolute/path/to/codex/archived_sessions"
  }
}
</code></pre>

<h3>任务侧边栏（TASKS）</h3>

<p>默认情况下，TASKS 以通用模式运行：</p>

<ul>
  <li>显示活动仓库的 open GitHub issues；</li>
  <li>不继承任何自定义流水线；</li>
  <li>如果 <code>gh</code> 未配置，会优雅降级。</li>
</ul>

<p>要添加自定义流水线进度条，在 <code>~/.pixel-agents/config.json</code> 中添加配置：</p>

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

<h2>布局编辑器</h2>

<ul>
  <li>导出 / 导入 JSON 布局</li>
  <li>老板椅和角色限制座位</li>
  <li>生成点编辑</li>
  <li>坐标高亮</li>
  <li>单元格类型高亮</li>
  <li>家具放置、旋转、删除、撤销/重做</li>
  <li>触控板缩放 + 大型办公室平移</li>
</ul>

<h2>办公室资源</h2>

<p>内置资源随仓库发布，开箱即用。</p>

<p>主要内置资源包位于 <code>webview-ui/public/assets</code>：角色、地板、墙壁、家具清单、精灵图和内置默认布局。</p>

<p>家具素材取自已购买的瓦片集，随仓库和 npm 包一同分发，因此全新安装即可看到布置好的办公室。可用 <code>scripts/extract-modern-office.ts</code> 与 <code>scripts/extract-interior-packs.ts</code> 从原始素材包重新切图。</p>

<p>可通过外部资源目录连接额外资源。您自己的商业瓦片集请保存在本地，未经允许再分发的许可请勿提交到公共仓库。</p>

<h2>技术栈</h2>

<ul>
  <li>Node.js</li>
  <li>Express</li>
  <li>WebSocket (<code>ws</code>)</li>
  <li>React 19</li>
  <li>TypeScript</li>
  <li>Vite</li>
  <li>Canvas 2D 渲染</li>
  <li><code>gh</code> CLI 集成（可选 issue 跟踪）</li>
</ul>

<h2>已知限制</h2>

<ul>
  <li>Codex 支持为基础版本，仍需完善。</li>
  <li>TASKS 侧边栏依赖 <code>gh</code> 认证来显示 GitHub issues。</li>
  <li>流水线进度需通过配置启用，不会自动推断。</li>
  <li>Claude 和 Codex 的会话格式可能会变化；解析器需要随时间更新。</li>
  <li>分享链接需要 SSH 隧道连接到公共服务器才能外部访问；token 存储在内存中，服务器重启后会重置。</li>
</ul>

<h2>GitHub Stars</h2>

<a href="https://www.star-history.com/?repos=percheniy%2Foffice-for-claude-agents&type=date&legend=top-left">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/percheniy/office-for-claude-agents?style=for-the-badge&logo=github" />
</a>

<h2>Credits</h2>

<ul>
  <li><a href="https://github.com/pixel-agents-hq/pixel-agents">pixel-agents-hq/pixel-agents</a> by Pablo De Lucca</li>
  <li><a href="https://limezu.itch.io/">LimeZu</a> — 家具精灵图所取自的 Modern Office Revamped 与 Modern Interiors 瓦片集</li>
  <li>Pablo De Lucca for standalone groundwork</li>
  <li>Sergey Gridchin for public standalone additions, Codex support, task sidebar generalization, richer inspection, and release packaging</li>
</ul>

<p>版权与项目署名：<a href="https://github.com/percheniy">Sergey Gridchin (@percheniy)</a>。复制或修改相关新增内容时，请保留 <code>LICENSE</code> 和 <code>NOTICE</code> 中的声明。</p>

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
