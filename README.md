<p align="right">🇷🇺 <strong>Русский</strong> | 🇬🇧 <a href="README_EN.md">English</a> | 🇨🇳 <a href="README_ZH.md">中文</a></p>

<h1>Визуализация ИИ агентов Claude и Codex в real time в браузере</h1>

<p align="center">
  <img src="docs/images/main_picture_agent_visualization.png" width="980" alt="Главный экран визуализации агентов" />
</p>
YouTube: <a href="https://www.youtube.com/watch?v=seJ8nwOdRYA" target="_blank">https://www.youtube.com/watch?v=seJ8nwOdRYA</a>

<p>Пиксельный офис для <code>Claude CLI</code>, <code>Claude macOS app</code> с базовой поддержкой <code>Codex</code>.</p>

<p>Real-time визуализация агентов Claude и Codex: кто появился в офисе, кто кого вызвал, кто над чем работает, кто простаивает, сколько токенов сгорает и как между собой общаются агенты прямо во время сессии.</p>

<p>Отдельное браузерное приложение, которое превращает агентные сессии Claude в живой пиксельный офис: агенты появляются в заданной точке, собираются кластерами, тянутся друг к другу, работают за столами, отдыхают на софах и оставляют понятный "бумажный след" в сайдбарах. Не требует API, использует ваш аккаунт. Никаких дополнительных расходов на токены.</p>


<h2>Обзор</h2>

<p>Когда вы хотите видеть живую карту работы ИИ агентов: кто кого вызвал, кто над чем занят, сколько токенов тратится, что обсуждают агенты между собой и какие issues сейчас активны в репозитории.</p>

<h2>Визуальный обзор</h2>

<p>Главная идея интерфейса: не просто список сессий, а живая карта офиса, где видно иерархию, кластеры, события, точки спавна, ожидание апрува и отдельные каналы общения между агентами.</p>

<h3>Главный офис</h3>

<p align="left">
  <img src="docs/images/big_office_for_thousand_agents.png" width="920" alt="Большой офис" />
</p>

<h3>Кресло босса</h3>

<p align="left">
  <img src="docs/images/boss_chair.png" width="520" alt="Кресло босса" />
</p>

<h3>Иерархия</h3>

<p align="left">
  <img src="docs/images/hierarchy_of_agents.png" width="260" alt="Иерархия агентов" />
</p>

<h3>Кластеризация</h3>
<p align="left">
  <img src="docs/images/grouping_by_cluster.png" width="260" alt="Кластеризация агентов" />
</p>

<h3>Отслеживание общения</h3>

<p align="left">
  <img src="docs/images/communication_between_agents.png" width="260" alt="Общение между агентами" />
</p>

<h3>События</h3>

<p align="left">
  <img src="docs/images/events_tracking.png" width="260" alt="Трекинг событий" />
</p>

<h3>Оповещения об ожидании апрува</h3>

<p align="left">
  <img src="docs/images/show_waiting_for_approval_from_agents.png" width="340" alt="Ожидание подтверждения действий" />
</p>

<h3>Точка появления</h3>

<p align="left">
  <img src="docs/images/spawn_position_setup.png" width="560" alt="Настройка точки появления" />
</p>

<h3>Импорт/экспорт для шаринга</h3>

<p align="left">
  <img src="docs/images/impor_export_layout.png" width="560" alt="Импорт и экспорт layout" />
</p>

<h3>Дополнительные ассеты</h3>
<p align="left">
  <img src="docs/images/extra_assets.png" width="560" alt="Расширенный набор ассетов" />
</p>

<h3>Поддержка Codex</h3>

<p align="left">
  <img src="docs/images/codex_support.png" width="260" alt="Поддержка Codex" />
</p>

<p align="left">
  <img src="docs/images/codex_support1.png" width="560" alt="Поддержка Codex, дополнительный пример" />
</p>

<h3>HUD — Метрики агентов</h3>

<p align="left">
  <img src="docs/images/hud_metrics.png" width="920" alt="HUD — сводка метрик агентов" />
</p>

<p>Полноэкранная панель метрик: токены, стоимость, cache hit rate, context usage на каждого агента. Сортировка по любому столбцу. Предупреждения о bottleneck (низкий cache hit, высокий context fill).</p>

<h3>Idle-активности: софа, кофе, перекур</h3>

<p align="left">
  <img src="docs/images/smoking_agent.png" width="400" alt="Курящий агент" />
</p>

<p>Простаивающие агенты выбирают одну из трёх активностей (33% каждая): отдых на софе, кофе у кулера или перекур. Каждая активность со своим спрайтом и анимацией.</p>

<h3>Визуализация команд</h3>

<p align="left">
  <img src="docs/images/team_clusters.png" width="560" alt="Подсветка команд тайлами" />
</p>

<p>Кнопка "Show teams" рисует тайловые области с заливкой и сплошной толстой границей по внешнему периметру кластера. Автоматически определяет иерархию через цепочку parentAgentId. Convex hull объединяет всех участников команды в одну область.</p>

<h3>Трансляция офиса</h3>

<p align="left">
  <img src="docs/images/share_office.png" width="560" alt="Трансляция офиса — временная ссылка" />
</p>

<p>Кнопка Share генерирует временную ссылку (10 или 60 минут) для друзей и коллег. Режим "только просмотр": без кнопок управления, без Tasks. Поддержка публичного URL через SSH tunnel + relay сервер. На мобильных устройствах показывает уведомление "отображение доступно только с desktop".</p>

<h3>Уведомления</h3>

<p>Браузерные уведомления при запросе разрешения, завершении задачи, появлении нового агента. Включается в Settings.</p>

<h3>Multi-Daemon (экспериментально)</h3>

<p>Подключение к удалённым серверам pixel-agents. Единый офис с namespace агентов. Настраивается через <code>~/.pixel-agents/config.json</code>.</p>

<h3>Кроссплатформенность</h3>

<p>Работает на macOS, Linux, Windows. AppleScript заменён на кроссплатформенные утилиты.</p>

<h2>Возможности</h2>

<ul>
  <li>Кресло босса: его может занять только BOSS/MEGABOSS агент. Lead и остальные садятся на обычные места.</li>
  <li>Строгая иерархия: агент, который вызвал другого агента, выше в иерархии.</li>
  <li>Кластерное поведение: агенты собираются рядом и визуально тянутся к связанным участникам работы.</li>
  <li>Левый сайдбар с агентами, их ролями, токенами, контекстом и статусами.</li>
  <li>Отдельный сайдбар с задачами из GitHub-репозитория.</li>
  <li>Расширенный пак предметов.</li>
  <li>Настраиваемый прогресс-бар под ваш pipeline через <code>~/.pixel-agents/config.json</code>.</li>
  <li>Расширенный набор встроенных office assets, работающий из коробки.</li>
  <li>Сайдбар событий с фактом общения агентов между собой.</li>
  <li>Просмотр чата конкретного агента и deep inspection по double-click.</li>
  <li>Координата появления агентов и точка ухода учитываются в layout и рендере.</li>
  <li>Подсветка координат, подсветка типов ячеек и подписи агентов.</li>
  <li>Умное добавление имени агента по специальности.</li>
  <li>Если агент простаивает, он может уйти на софу, пить кофе или курить (33/33/33); каждая активность со своим спрайтом и анимацией.</li>
  <li>Soft zoom через touchpad/pinch и плавный pan по canvas.</li>
  <li>Кнопка Fit — авто-масштаб офиса между сайдбарами.</li>
  <li>Базовая поддержка Codex-сессий и subagents уже есть, но это ещё early version.</li>
</ul>

<h2>Требования</h2>

<ul>
  <li><code>Claude CLI</code> или <code>Claude macOS app</code> (macOS, Linux, Windows)</li>
  <li>Node.js <code>20.19+</code></li>
  <li><code>npm</code></li>
  <li>Опционально: GitHub CLI <code>gh</code> для сайдбара задач (TASKS)</li>
</ul>

<h2>Быстрый старт</h2>

<p>Одна команда — и офис запущен:</p>

<pre><code class="language-bash">npx office-for-claude-agents
</code></pre>

<p>Автоматически установит зависимости, соберёт проект и откроет браузер на <code>http://localhost:9876</code>.</p>

<h3>Безопасность control server</h3>

<p>По умолчанию сервер слушает только <code>127.0.0.1</code>. Для явного remote-режима задайте bind-адрес и длинный случайный токен:</p>

<pre><code class="language-bash">PIXEL_AGENTS_BIND_HOST=0.0.0.0 \
PIXEL_AGENTS_AUTH_TOKEN='replace-with-a-long-random-token' \
npm start
</code></pre>

<p>Без <code>PIXEL_AGENTS_AUTH_TOKEN</code> remote-режим не запускается. Откройте UI с параметром <code>?auth=TOKEN</code>; используйте HTTPS или SSH-туннель. Запуск Claude с bypass-разрешений разрешён только локальному loopback-клиенту.</p>

<details>
  <summary>Из исходников</summary>

<pre><code class="language-bash">git clone https://github.com/percheniy/office-for-claude-agents.git \
  &amp;&amp; cd office-for-claude-agents \
  &amp;&amp; npm install \
  &amp;&amp; npm start
</code></pre>
</details>

<p>Откройте:</p>

<pre><code>http://localhost:9876
</code></pre>

<p>На первом запуске приложение само создаёт <code>~/.pixel-agents/layout.json</code> из bundled default layout, который уже включён в репозиторий.</p>

<p>Источники сессий ищутся автоматически в стандартных директориях <code>~/.claude/projects</code>, <code>~/.codex/sessions</code> и <code>~/.codex/archived_sessions</code>. Если у вас кастомные пути, можно переопределить их через <code>PIXEL_AGENTS_CLAUDE_PROJECTS_DIR</code>, <code>PIXEL_AGENTS_CODEX_SESSIONS_DIR</code>, <code>PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR</code> или через <code>~/.pixel-agents/config.json</code>.</p>

<h2>Использование</h2>

<h3>Claude CLI / Claude macOS app</h3>

<p>Приложение отслеживает:</p>

<ul>
  <li><code>~/.claude/projects</code></li>
  <li><code>~/.codex/sessions</code></li>
  <li><code>~/.codex/archived_sessions</code> — для архивных Codex-сессий</li>
</ul>

<p>Этого достаточно для <code>Claude CLI</code>, <code>Claude macOS app</code> и базового отображения <code>Codex</code> агентов.</p>

<p>Если стандартные папки отсутствуют, приложение всё равно стартует и явно покажет в левом сайдбаре, какие пути проверялись и чем их переопределить.</p>

<pre><code class="language-json">{
  "sessionSources": {
    "claudeProjectsDir": "/absolute/path/to/claude/projects",
    "codexSessionsDir": "/absolute/path/to/codex/sessions",
    "codexArchivedSessionsDir": "/absolute/path/to/codex/archived_sessions"
  }
}
</code></pre>

<h3>Сайдбар задач (TASKS)</h3>

<p>По умолчанию TASKS работает в generic режиме:</p>

<ul>
  <li>показывает open GitHub issues активного репозитория;</li>
  <li>не наследует мой личный pipeline;</li>
  <li>тихо деградирует, если <code>gh</code> не настроен.</li>
</ul>

<p>Если хотите свой pipeline progress bar, добавьте конфиг в <code>~/.pixel-agents/config.json</code>:</p>

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

<h2>Редактор layout</h2>

<ul>
  <li>Экспорт / импорт layout в JSON</li>
  <li>Кресло босса и ролевые ограничения мест</li>
  <li>Редактирование точки спавна</li>
  <li>Подсветка координат</li>
  <li>Подсветка типов ячеек</li>
  <li>Размещение мебели, поворот, удаление, undo/redo</li>
  <li>Zoom через touchpad + pan для больших офисов</li>
</ul>

<h2>Ассеты офиса</h2>

<p>Встроенные assets входят в репозиторий и достаточны для первого запуска.</p>

<p>Основной встроенный набор лежит в <code>webview-ui/public/assets</code>: characters, floors, walls, furniture manifests, sprites и bundled default layout.</p>

<p>Дополнительные ассеты можно подключать через external asset directories. Если у вас есть коммерческие tilesets, подключайте их отдельно и локально, не коммитьте их в публичный репозиторий без лицензии.</p>

<h2>Технологии</h2>

<ul>
  <li>Node.js</li>
  <li>Express</li>
  <li>WebSocket (<code>ws</code>)</li>
  <li>React 19</li>
  <li>TypeScript</li>
  <li>Vite</li>
  <li>Canvas 2D рендеринг</li>
  <li>Интеграция с <code>gh</code> CLI для трекинга issues</li>
</ul>

<h2>Известные ограничения</h2>

<ul>
  <li>Поддержка Codex базовая и требует доработки.</li>
  <li>Сайдбар TASKS зависит от аутентификации <code>gh</code> для отображения GitHub issues.</li>
  <li>Pipeline progress включается через конфиг, автоматически не определяется.</li>
  <li>Форматы сессий Claude и Codex могут меняться; парсеры потребуют обновления со временем.</li>
  <li>Share-ссылки требуют SSH-туннель к публичному серверу для внешнего доступа; токены хранятся в памяти и сбрасываются при перезапуске сервера.</li>
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
