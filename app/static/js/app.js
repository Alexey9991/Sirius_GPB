// This file is watched by src/main.py and reloads automatically after saving.
(function () {
  const app = document.getElementById("app");
  const globalSearch = document.getElementById("globalSearch");
  const notificationOverlay = document.getElementById("notificationOverlay");
  const defaultUser = { id: "u-001", name: "Анна Иванова", email: "a.ivanova@gpb.ru", role: "Аналитик рисков", department: "Проектное финансирование" };
  const defaultSubscriptions = { locations: ["Москва", "Екатеринбург"], developers: ["ГК Север Девелопмент"], projects: ["ЖК Северный берег"] };
  const state = { overview: null, analysis: null, streamInsight: null, pendingInsightQuestion: "", selectedImpactEventId: "", alerts: [], projects: [], events: [], notifications: [], notificationsInitialized: false, analysisHistory: [], riskChanges: [], pendingAnalysis: "", pendingProjectContext: null, searchQuery: "", projectSort: "risk-desc", subscriptions: readUserSubscriptions(defaultUser.id), pushEnabled: localStorage.getItem("risk-intelligence:push-enabled") === "true" && "Notification" in window && Notification.permission === "granted", currentUser: defaultUser };
  const routeTitles = {
    dashboard: "Мониторинг", "ai-analysis": "ИИ-анализ потока", projects: "Объекты", news: "Поток",
    history: "Журнал", notifications: "Уведомления", profile: "Профиль аналитика", search: "Поиск", login: "Вход", register: "Регистрация",
  };
  const palette = {
    RED: { css: "red", label: "Критический", color: "#d92d20" },
    YELLOW: { css: "yellow", label: "Средний", color: "#f5a000" },
    GREEN: { css: "green", label: "Низкий", color: "#149447" },
  };
  localStorage.setItem("risk-intelligence:active-user-id", defaultUser.id);

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  }

  function currentRoute() {
    const route = location.hash.replace("#", "") || "dashboard";
    return routeTitles[route] ? route : "dashboard";
  }

  function navigate(route) {
    if (currentRoute() === route) renderRoute();
    else location.hash = route;
  }

  function setActiveNav(route) {
    document.querySelectorAll(".nav-card").forEach((link) => link.classList.toggle("active", link.dataset.route === route));
    document.querySelectorAll(".header-action").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
    document.title = `${routeTitles[route]} — GPB Risk Desk`;
  }

  function initials(name) {
    return String(name || "Аналитик").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function updateHeaderUser() {
    const user = state.currentUser;
    document.getElementById("profileAvatar").textContent = user ? initials(user.name) : "→";
    document.getElementById("profileName").textContent = user ? user.name : "Войти";
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function loading() { app.innerHTML = '<div class="loader">Загружаем данные…</div>'; }
  function renderError(error) { app.innerHTML = `<div class="error-box">Не удалось получить данные: ${esc(error.message)}</div>`; }
  function chip(level) { const p = palette[level] || palette.GREEN; return `<span class="chip ${p.css}">${p.label}</span>`; }
  function shortTime(value) { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  function dateTime(value) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

  function subscriptionKey(userId) {
    return `risk-intelligence:${userId || "guest"}:subscriptions`;
  }

  function readUserSubscriptions(userId) {
    try {
      const saved = JSON.parse(localStorage.getItem(subscriptionKey(userId)) || "null");
      return {
        locations: Array.isArray(saved?.locations) ? saved.locations : [...defaultSubscriptions.locations],
        developers: Array.isArray(saved?.developers) ? saved.developers : [...defaultSubscriptions.developers],
        projects: Array.isArray(saved?.projects) ? saved.projects : [...defaultSubscriptions.projects],
      };
    } catch (_) {
      return { locations: [...defaultSubscriptions.locations], developers: [...defaultSubscriptions.developers], projects: [...defaultSubscriptions.projects] };
    }
  }

  function saveUserSubscriptions() {
    localStorage.setItem(subscriptionKey(state.currentUser?.id), JSON.stringify(state.subscriptions));
  }

  function setCurrentUser(user) {
    state.currentUser = user;
    localStorage.setItem("risk-intelligence:active-user-id", user?.id || "guest");
    state.subscriptions = readUserSubscriptions(user?.id);
    updateHeaderUser();
  }

  function uniqueValues(items, key) {
    return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  }

  function levelRank(level) {
    return { RED: 3, YELLOW: 2, GREEN: 1 }[level] || 0;
  }

  function projectByName(projectName) {
    return state.projects.find((project) => project.name === projectName);
  }

  function projectAnalyzeAttrs(project) {
    if (!project) return "";
    return `data-analyze-id="${esc(project.id || "")}" data-analyze-name="${esc(project.name || project.project_name || "")}" data-analyze-city="${esc(project.city || "")}" data-analyze-developer="${esc(project.developer || "")}"`;
  }

  function isSubscribed(item) {
    const subscriptions = state.subscriptions || defaultSubscriptions;
    const project = item.city && item.developer ? item : projectByName(item.project_name || item.name);
    return subscriptions.projects.includes(item.project_name || item.name)
      || (project && subscriptions.locations.includes(project.city))
      || (project && subscriptions.developers.includes(project.developer));
  }

  function scopedNotifications() {
    return state.notifications.filter(isSubscribed);
  }

  function searchableText(item) {
    return Object.values(item).filter((value) => typeof value === "string" || typeof value === "number").join(" ").toLowerCase();
  }

  function riskIndexSummary(data) {
    const drivers = [...(data?.drivers || [])].sort((a, b) => Number(b.value) - Number(a.value));
    const main = drivers[0];
    const second = drivers[1];
    const levelText = data.level === "RED"
      ? "Индекс высокий: объект требует ручной проверки и контроля свежих публикаций."
      : data.level === "YELLOW"
        ? "Индекс средний: критических сигналов нет, но объект лучше оставить в наблюдении."
        : "Индекс низкий: существенных негативных сигналов в текущем потоке не видно.";
    const driverText = main
      ? `Главный фактор: ${main.name.toLowerCase()} (${Number(main.value)}%).${second ? ` Дополнительно влияет ${second.name.toLowerCase()} (${Number(second.value)}%).` : ""}`
      : "Факторы риска не выделены.";
    return `
      <div class="risk-summary">
        <b>Краткая сводка индекса</b>
        <p>${esc(levelText)} ${esc(driverText)}</p>
      </div>`;
  }

  function sourceCards(items) {
    return (items || []).map((event) => `
      <article class="source-card">
        <div>
          <span>${chip(event.level)}</span>
          <time>${dateTime(event.published_at)}</time>
        </div>
        <h4>${esc(event.title)}</h4>
        <p>${esc(event.summary || event.category || "Событие из новостного потока")}</p>
        <footer><span>${esc(event.project_name)} · ${esc(event.source)}</span><a href="${esc(event.source_url || "#")}" target="_blank" rel="noopener">Открыть источник</a></footer>
      </article>`).join("");
  }

  function projectRows(items) {
    return items.map((p) => `
      <button class="object-row" ${projectAnalyzeAttrs(p)}>
        <span class="object-avatar">${esc(p.name.replace("ЖК ", "").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>
        <span><span class="object-name">${esc(p.name)}</span><span class="object-meta">${esc(p.city)} · ${esc(p.developer)}</span></span>
        <span class="score">${p.score}<small>/100</small></span>${chip(p.level)}
      </button>`).join("");
  }

  function analysisPanel(data) {
    if (!data) return `
      <section class="card"><div class="empty-state"><div><div class="empty-icon">?</div>
      Выберите объект из списка или введите название ЖК, чтобы увидеть результат анализа.</div></div></section>`;
    const p = palette[data.level] || palette.GREEN;
    const subscribed = state.subscriptions.projects.includes(data.project_name);
    return `
      <section class="card">
        <div class="result-topline"><div class="result-kicker">${chip(data.level)}</div><button class="${subscribed ? "secondary-btn" : "primary-btn"} subscribe-project-btn" data-action="toggle-project-subscription" data-project-name="${esc(data.project_name)}">${subscribed ? "Вы подписаны" : "Подписаться на ЖК"}</button></div>
        <h2 class="result-title">${esc(data.project_name)}</h2>
        <div class="result-summary">${esc(data.summary)}</div>
        <div class="score-box" style="--ring-color:${p.color};--ring-value:${Number(data.score)}">
          <div class="score-ring"><span>${Number(data.score)}</span></div>
          <div class="score-copy"><b>Индекс риска</b><br>Скоринг по новостям, жалобам, юридическим и операционным сигналам.</div>
        </div>
        ${riskIndexSummary(data)}
      </section>
      <section class="card">
        <div class="card-head"><h2>События</h2><button class="text-link" data-route="news">Вся лента</button></div>
        ${(data.events || []).slice(0, 3).map((e) => `
          <article class="event-mini"><time>${shortTime(e.published_at)}</time><b>${esc(e.title)}</b><a href="${esc(e.source_url || "#")}">${esc(e.source)}</a></article>`).join("") || '<div class="object-meta">Связанных публикаций не найдено</div>'}
      </section>`;
  }

  async function renderDashboard(pendingAnalysis = "") {
    loading();
    try {
      state.overview ||= await window.api.getOverview();
      if (!state.projects.length) state.projects = await window.api.getProjects();
      const data = state.overview;
      const priorityProjects = sortProjects(state.projects).slice(0, 4);
      app.innerHTML = `
        <div class="dashboard-grid page-enter">
          <div>
            <section class="hero">
              <span class="hero-badge">Мониторинг</span>
              <h1>Проверка объекта по новостному потоку</h1>
              <p>Сводка собирает открытые публикации, жалобы и изменения по проекту в один риск-профиль для первичного решения аналитика.</p>
              <form id="analysisForm" class="analysis-form">
                <input id="projectInput" class="input" autocomplete="off" placeholder="Например: ЖК Северный берег" />
                <button id="analyzeButton" class="primary-btn" type="submit">Анализировать</button>
              </form>
              <div class="samples">
                ${priorityProjects.slice(0, 3).map((p) => `<button class="sample" ${projectAnalyzeAttrs(p)}>${esc(p.name)}</button>`).join("")}
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Приоритетные объекты</h2><div class="card-actions"><button class="text-link" data-route="history">История</button><button class="text-link" data-route="projects">Все объекты</button></div></div>
              <div class="object-list">${projectRows(priorityProjects) || '<div class="compact-empty">Объекты пока не найдены.</div>'}</div>
            </section>
          </div>
          <aside id="resultPanel" class="result-panel">${analysisPanel(state.analysis)}</aside>
        </div>`;
      document.getElementById("analysisForm").addEventListener("submit", (event) => {
        event.preventDefault(); analyze(document.getElementById("projectInput").value);
      });
      if (pendingAnalysis) {
        document.getElementById("projectInput").value = pendingAnalysis;
        analyze(pendingAnalysis, state.pendingProjectContext || {});
        state.pendingProjectContext = null;
      }
    } catch (error) { renderError(error); }
  }

  async function analyze(projectName, projectContext = {}) {
    const value = String(projectName || "").trim();
    if (!value) return showToast("Введите название жилого комплекса");

    const request = projectContext?.projectId
      ? {
          project_id: projectContext.projectId,
          project_name: value,
          city: projectContext.city || "",
          developer: projectContext.developer || "",
        }
      : value;

    console.log("НА АНАЛИЗ УШЛО:", request);

    const button = document.getElementById("analyzeButton");
    if (button) { button.disabled = true; button.textContent = "Анализируем…"; }
    try {
      try {
        state.analysis = await window.api.analyze(request);
      } catch (apiError) {
        if (typeof request === "object") {
          console.warn("Backend не принял project_id, fallback на анализ по названию", apiError);
          state.analysis = await window.api.analyze(value);
        } else {
          throw apiError;
        }
      }
      state.analysisHistory = [];
      state.riskChanges = [];
      const panel = document.getElementById("resultPanel");
      if (panel) panel.innerHTML = analysisPanel(state.analysis);
      globalSearch.value = value;
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { showToast(`Ошибка анализа: ${error.message}`); }
    finally { if (button) { button.disabled = false; button.textContent = "Анализировать"; } }
  }

  function alertRows(items) {
    return items.map((item) => `
      <article class="alert-row">
        <span class="severity ${item.level === "YELLOW" ? "yellow" : ""}"></span>
        <div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p>
          <div class="row-meta"><span>${esc(item.project_name)}</span><span>${esc(item.category)}</span><span>${esc(item.source)}</span></div>
          <button class="inline-ai-btn" data-ai-event="${esc(item.id)}">Разобрать в потоке</button>
        </div><time class="row-time">Сегодня, ${shortTime(item.published_at)}</time>
      </article>`).join("");
  }

  function buildStreamInsight(question) {
    const query = String(question || "").trim();
    const scopedEvents = state.events;
    const scopedProjects = state.projects;
    const critical = scopedEvents.filter((event) => event.level === "RED");
    const medium = scopedEvents.filter((event) => event.level === "YELLOW");
    const rankedProjects = [...scopedProjects].sort((a, b) => b.score - a.score);
    const topProject = rankedProjects[0];
    const projectByName = new Map(scopedProjects.map((project) => [project.name, project]));
    const criticalProjects = rankedProjects.filter((project) => project.level === "RED" || project.score >= 70);
    const developerStats = scopedEvents.reduce((acc, event) => {
      const developer = projectByName.get(event.project_name)?.developer || "Не указан";
      acc[developer] = acc[developer] || { total: 0, critical: 0 };
      acc[developer].total += 1;
      if (event.level === "RED") acc[developer].critical += 1;
      return acc;
    }, {});
    const developerHotspot = Object.entries(developerStats)
      .sort((a, b) => b[1].critical - a[1].critical || b[1].total - a[1].total)[0];
    const evidenceEvents = [...scopedEvents]
      .sort((a, b) => levelRank(b.level) - levelRank(a.level) || new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 4);
    const verdict = critical.length
      ? `В потоке есть ${critical.length} критических сигнала`
      : medium.length
        ? "Поток требует наблюдения, критических сигналов не найдено"
        : "По текущему потоку существенных рисков не видно";
    return {
      query,
      verdict,
      confidence: critical.length ? 91 : medium.length ? 82 : 76,
      lead: topProject
        ? `${topProject.name} сейчас выглядит главным объектом внимания: индекс ${topProject.score}/100, ${topProject.city}, застройщик ${topProject.developer}.`
        : "В текущем потоке пока нет объектов, по которым можно построить приоритет риска.",
      detailed_analysis: topProject
        ? `ИИ анализирует весь доступный новостной поток: ${scopedEvents.length} публикаций по ${scopedProjects.length} объектам. Вопрос аналитика: «${query || "общая оценка потока"}». Наибольшее внимание сейчас требует ${topProject.name}: индекс ${topProject.score}/100, город ${topProject.city}, застройщик ${topProject.developer}.`
        : "В потоке пока нет связанных объектов. Подключите источники или обновите ленту новостей.",
      metrics: [
        { label: "Критические сигналы", value: critical.length, hint: `из ${scopedEvents.length} новостей`, tone: critical.length ? "red" : "green" },
        { label: "Объекты в риске", value: criticalProjects.length, hint: "красный уровень или индекс от 70", tone: criticalProjects.length ? "red" : "green" },
        { label: "Средние сигналы", value: medium.length, hint: "требуют наблюдения", tone: medium.length ? "yellow" : "green" },
      ],
      factors: [
        `${critical.length} красных публикаций из ${scopedEvents.length} новостей в общей ленте.`,
        topProject ? `Максимальный индекс риска у ${topProject.name}: ${topProject.score}/100.` : "",
        developerHotspot ? `${developerHotspot[0]} чаще всего встречается в риск-сигналах: ${developerHotspot[1].total} упоминаний.` : "",
      ].filter(Boolean),
      recommendations: critical.length
        ? [
            topProject ? `Проверить график, юридические события и транши по ${topProject.name}.` : "Открыть карточки критических объектов.",
            "Сверить красные новости с проектной декларацией и жалобами покупателей.",
            developerHotspot ? `Поставить ${developerHotspot[0]} в усиленный мониторинг до снятия красных сигналов.` : "Поставить критические объекты в усиленный мониторинг.",
          ]
        : ["Сохранить наблюдение по подпискам", "Проверять повторяемость сигналов", "Использовать глобальный поиск для детализации"],
      priorities: rankedProjects.slice(0, 3).map((project) => {
        const related = scopedEvents.filter((event) => event.project_name === project.name);
        const mainSignal = related.find((event) => event.level === "RED") || related[0];
        return {
          name: project.name,
          city: project.city,
          developer: project.developer,
          score: project.score,
          level: project.level,
          eventsCount: related.length,
          signal: mainSignal?.title || "Свежих негативных публикаций не найдено",
        };
      }),
      projects: rankedProjects.slice(0, 5),
      events: scopedEvents.slice(0, 5),
      sources: evidenceEvents,
      generated_at: new Date().toISOString(),
    };
  }

  function streamInsightResult(data) {
    if (!data) return `<div class="ai-empty"><span>AI</span><b>Запустите ИИ-анализ всех новостей</b><p>ИИ берёт в контекст весь доступный новостной поток, все ЖК, застройщиков, города и категории риска.</p></div>`;
    const hasCritical = data.events.some((event) => event.level === "RED");
    const focus = data.query ? `Фокус: ${data.query}` : "Фокус: общая оценка потока";
    const metrics = data.metrics || [];
    const priorities = data.priorities || [];
    const sources = data.sources || data.events || [];
    return `
      <div class="ai-report page-enter">
        <div class="ai-report-header">
          <div class="ai-report-title">
            <span class="ai-spark">ИИ</span>
            <div>
              <small>Сводка по всему новостному потоку</small>
              <h2>${esc(data.verdict)}</h2>
              <p>${esc(focus)}</p>
            </div>
          </div>
          <div class="ai-confidence ${hasCritical ? "danger" : "stable"}"><b>${data.confidence}%</b><span>риск</span></div>
        </div>
        <div class="ai-metrics">
          ${metrics.map((item) => `<div class="ai-metric ${esc(item.tone)}"><span>${esc(item.label)}</span><b>${esc(item.value)}</b><small>${esc(item.hint)}</small></div>`).join("")}
        </div>
        <section class="ai-summary-block">
          <span>Главный вывод</span>
          <p>${esc(data.lead || data.detailed_analysis)}</p>
        </section>
        <div class="ai-answer-columns ai-report-columns">
          <div><h3>Что повлияло</h3><ul>${data.factors.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>
          <div><h3>Что сделать дальше</h3><ol>${data.recommendations.map((item) => `<li>${esc(item)}</li>`).join("")}</ol></div>
        </div>
        <div class="ai-priority-list">
          <h3>Приоритетные объекты</h3>
          ${priorities.map((project, index) => `<button class="ai-priority-card" ${projectAnalyzeAttrs(project)}><span>${index + 1}</span><div><b>${esc(project.name)}</b><small>${esc(project.city)} · ${esc(project.developer)}</small><em>${esc(project.signal)}</em></div><div class="ai-priority-meta"><strong>${project.score}/100</strong>${chip(project.level)}</div></button>`).join("") || '<div class="compact-empty">Приоритетные объекты не найдены</div>'}
        </div>
        <section class="ai-sources">
          <div class="ai-sources-head"><h3>Источники и ссылки</h3><span>${sources.length} проверяемых публикаций</span></div>
          <div class="source-list">${sourceCards(sources) || '<div class="compact-empty">Источники не найдены</div>'}</div>
        </section>
        <div class="insight-lists">
          <div><h3>Объекты в выборке</h3>${data.projects.map((project) => `<button class="mini-result" ${projectAnalyzeAttrs(project)}><b>${esc(project.name)}</b><span>${esc(project.city)} · ${esc(project.developer)} · ${project.score}/100</span></button>`).join("") || '<div class="compact-empty">Объекты не найдены</div>'}</div>
          <div><h3>Связанные новости</h3>${data.events.map((event) => `<button class="mini-result" data-ai-event="${esc(event.id)}"><b>${esc(event.title)}</b><span>${esc(event.project_name)} · ${esc(event.source)} · ${palette[event.level]?.label || "Риск"}</span></button>`).join("") || '<div class="compact-empty">Новости не найдены</div>'}</div>
        </div>
        <div class="ai-disclaimer">ИИ-анализ построен по всем новостям в ленте и не ограничивается выбранной карточкой события.</div>
      </div>`;
  }

  async function askStreamInsight(question) {
    const button = document.getElementById("askAiButton");
    if (button) { button.disabled = true; button.textContent = "ИИ анализирует новости…"; }
    try {
      await new Promise((resolve) => setTimeout(resolve, 220));
      state.streamInsight = buildStreamInsight(question);
      document.getElementById("aiImpactResult").innerHTML = streamInsightResult(state.streamInsight);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Запустить ИИ-анализ"; }
    }
  }

  async function renderAIAnalysis() {
    loading();
    try {
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.projects.length) state.projects = await window.api.getProjects();
      const suggestions = ["Какие ЖК сейчас требуют внимания?", "Какие риски видны по всем новостям?", "Какие застройщики чаще попадают в негативные новости?"];
      const pending = state.pendingInsightQuestion || "Какие ЖК сейчас требуют внимания?";
      state.pendingInsightQuestion = "";
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading ai-page-heading"><div><span class="eyebrow">ИИ-анализ</span><h1>ИИ-анализ всех новостей</h1><p>Модель берёт в контекст всю ленту новостей, все ЖК и связанные риск-сигналы.</p></div></header>
          <div class="ai-general-layout">
            <section class="card ai-question-card">
              <div class="selected-news"><span class="selected-news-label">Контекст ИИ</span><h2>${state.projects.length} объектов · ${state.events.length} новостей</h2><p>ИИ смотрит всю ленту целиком: критические, средние и низкие сигналы, источники, города, застройщиков и связанные ЖК.</p></div>
              <form id="aiQuestionForm"><label for="aiQuestion">Фокус для ИИ-вывода</label><textarea id="aiQuestion" placeholder="Например: какие ЖК сейчас самые рискованные по всем новостям?" required minlength="5">${esc(pending)}</textarea><div class="question-suggestions">${suggestions.map((question) => `<button type="button" data-question="${esc(question)}">${esc(question)}</button>`).join("")}</div><button id="askAiButton" class="primary-btn" type="submit">Запустить ИИ-анализ</button></form>
            </section>
            <section id="aiImpactResult" class="card ai-result-card">${streamInsightResult(state.streamInsight)}</section>
          </div>
        </div>`;
      document.getElementById("aiQuestionForm").addEventListener("submit", (event) => {
        event.preventDefault();
        askStreamInsight(document.getElementById("aiQuestion").value.trim());
      });
      document.getElementById("aiQuestion").addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          document.getElementById("aiQuestionForm").requestSubmit();
        }
      });
      document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
        document.getElementById("aiQuestion").value = button.dataset.question;
      }));
    } catch (error) { renderError(error); }
  }

  function sortProjects(items) {
    const sorted = [...items];
    const direction = state.projectSort.endsWith("-asc") ? 1 : -1;
    if (state.projectSort.startsWith("city")) {
      return sorted.sort((a, b) => direction * a.city.localeCompare(b.city, "ru") || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("name")) {
      return sorted.sort((a, b) => direction * a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("developer")) {
      return sorted.sort((a, b) => direction * a.developer.localeCompare(b.developer, "ru") || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("risk")) {
      return sorted.sort((a, b) => direction * (levelRank(a.level) - levelRank(b.level)) || b.score - a.score);
    }
    if (state.projectSort.startsWith("score")) {
      return sorted.sort((a, b) => direction * (a.score - b.score) || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("completion")) {
      return sorted.sort((a, b) => direction * (a.completion - b.completion) || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("updated")) {
      return sorted.sort((a, b) => direction * (new Date(a.updated_at) - new Date(b.updated_at)) || a.name.localeCompare(b.name, "ru"));
    }
    return sorted.sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.score - a.score || a.name.localeCompare(b.name, "ru"));
  }

  function nextProjectSort(field) {
    const currentField = state.projectSort.split("-")[0];
    const currentDirection = state.projectSort.endsWith("-asc") ? "asc" : "desc";
    const defaultDirection = ["name", "city", "developer"].includes(field) ? "asc" : "desc";
    const nextDirection = currentField === field ? (currentDirection === "desc" ? "asc" : "desc") : defaultDirection;
    state.projectSort = `${field}-${nextDirection}`;
  }

  function projectTable(items) {
    return sortProjects(items).map((p) => `<tr ${projectAnalyzeAttrs(p)}><td>${esc(p.name)}</td><td>${esc(p.city)}</td><td>${esc(p.developer)}</td><td>${chip(p.level)}</td><td><b>${p.score}</b>/100</td><td class="progress">${p.completion}%<div class="progress-line"><span style="width:${p.completion}%"></span></div></td><td>${shortTime(p.updated_at)}</td></tr>`).join("");
  }

  async function renderProjects() {
    loading();
    try {
      state.projects = await window.api.getProjects();
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Проектное финансирование</span><h1>Портфель проектов</h1><p>Единый список объектов и их текущий риск-профиль.</p></div><button class="primary-btn" data-route="dashboard">Проверить новый ЖК</button></header>
          <section class="card">
            <div class="toolbar project-toolbar"><input id="projectSearch" class="input" placeholder="Название, город или застройщик"><select id="projectLevel" class="select"><option value="ALL">Все риски</option><option value="RED">Критические</option><option value="YELLOW">Средние</option><option value="GREEN">Низкие</option></select><select id="projectSort" class="select"><option value="name-asc">Объект: А-Я</option><option value="name-desc">Объект: Я-А</option><option value="city-asc">Город: А-Я</option><option value="city-desc">Город: Я-А</option><option value="developer-asc">Застройщик: А-Я</option><option value="developer-desc">Застройщик: Я-А</option><option value="risk-desc">Риск: критические сверху</option><option value="risk-asc">Риск: низкие сверху</option><option value="score-desc">Индекс: высокий сверху</option><option value="score-asc">Индекс: низкий сверху</option><option value="completion-desc">Готовность: высокая сверху</option><option value="completion-asc">Готовность: низкая сверху</option><option value="updated-desc">Обновлено: новые сверху</option><option value="updated-asc">Обновлено: старые сверху</option></select></div>
            <div class="table-wrap"><table><thead><tr><th><button class="sort-button" data-sort-field="name">Объект</button></th><th><button class="sort-button" data-sort-field="city">Город</button></th><th><button class="sort-button" data-sort-field="developer">Застройщик</button></th><th><button class="sort-button" data-sort-field="risk">Риск</button></th><th><button class="sort-button" data-sort-field="score">Индекс</button></th><th><button class="sort-button" data-sort-field="completion">Готовность</button></th><th><button class="sort-button" data-sort-field="updated">Обновлено</button></th></tr></thead><tbody id="projectBody">${projectTable(state.projects)}</tbody></table></div>
          </section>
        </div>`;
      const update = () => {
        const q = document.getElementById("projectSearch").value.toLowerCase();
        const level = document.getElementById("projectLevel").value;
        state.projectSort = document.getElementById("projectSort").value;
        const items = state.projects.filter((project) => (level === "ALL" || project.level === level) && (!q || `${project.name} ${project.city} ${project.developer}`.toLowerCase().includes(q)));
        document.getElementById("projectBody").innerHTML = projectTable(items);
      };
      document.getElementById("projectSort").value = state.projectSort;
      document.getElementById("projectSearch").addEventListener("input", update);
      document.getElementById("projectLevel").addEventListener("change", update);
      document.getElementById("projectSort").addEventListener("change", update);
      document.querySelectorAll("[data-sort-field]").forEach((button) => button.addEventListener("click", () => {
        nextProjectSort(button.dataset.sortField);
        document.getElementById("projectSort").value = state.projectSort;
        update();
      }));
    } catch (error) { renderError(error); }
  }

  function analysisHistoryRows(items) {
    return items.map((item) => `
      <button class="history-row" data-analyze="${esc(item.project_name)}">
        <span><b>${esc(item.project_name)}</b><small>${dateTime(item.analyzed_at)} · ${esc(item.model_version)}</small></span>
        <span class="history-summary">${esc(item.summary)}</span>
        <span class="history-score"><b>${item.score}</b>/100 ${chip(item.level)}</span>
      </button>`).join("");
  }

  function riskChangeRows(items) {
    return items.map((item) => {
      const initial = item.previous_level === null;
      return `<article class="risk-change-row">
        <span class="change-marker ${palette[item.new_level]?.css || "green"}"></span>
        <span><b>${esc(item.project_name)}</b><small>${initial ? "Первичная оценка риска" : "Риск изменился"} · ${dateTime(item.changed_at)}</small></span>
        <span class="risk-transition">${initial ? "Новый" : `${chip(item.previous_level)} <i>→</i>`} ${chip(item.new_level)}</span>
        <span class="score-change">${item.previous_score === null ? "" : `${item.previous_score} → `}<b>${item.new_score}</b></span>
      </article>`;
    }).join("");
  }

  async function renderHistory() {
    loading();
    try {
      [state.analysisHistory, state.riskChanges] = await Promise.all([
        window.api.getAnalysisHistory(),
        window.api.getRiskChanges(),
      ]);
      const projectsCount = new Set(state.analysisHistory.map((item) => item.project_name)).size;
      const criticalCount = state.analysisHistory.filter((item) => item.level === "RED").length;
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Аудит решений</span><h1>История анализов</h1><p>Сохранённые проверки объектов и хронология изменения их риска.</p></div><button class="primary-btn" data-route="dashboard">Запустить анализ</button></header>
          <div class="stat-grid">
            <div class="stat"><small>Всего анализов</small><strong>${state.analysisHistory.length}</strong><span class="delta">сохранено</span></div>
            <div class="stat"><small>Проверено объектов</small><strong>${projectsCount}</strong><span class="delta">уникальных ЖК</span></div>
            <div class="stat"><small>Изменений риска</small><strong>${state.riskChanges.length}</strong><span class="delta">зафиксировано</span></div>
            <div class="stat"><small>Критических оценок</small><strong>${criticalCount}</strong><span class="delta negative">требуют внимания</span></div>
          </div>
          <div class="history-grid">
            <section class="card"><div class="card-head"><h2>Запуски анализа</h2><span class="object-meta">Новые сверху</span></div><div class="history-list">${analysisHistoryRows(state.analysisHistory) || '<div class="compact-empty">История пуста. Запустите первый анализ на главной странице.</div>'}</div></section>
            <section class="card"><div class="card-head"><h2>Изменения риска</h2><span class="object-meta">Только значимые изменения</span></div><div class="risk-change-list">${riskChangeRows(state.riskChanges) || '<div class="compact-empty">Изменений риска пока не зафиксировано.</div>'}</div></section>
          </div>
        </div>`;
    } catch (error) { renderError(error); }
  }

  function feedRows(items) {
    return items.map((item) => `<article class="feed-row"><span class="severity ${item.level === "YELLOW" ? "yellow" : ""}" style="${item.level === "GREEN" ? "background:#149447" : ""}"></span><div><div class="feed-title-row"><h3>${esc(item.title)}</h3>${chip(item.level)}</div><p>${esc(item.summary)}</p><div class="row-meta"><span>${esc(item.project_name)}</span><span>${esc(item.category)}</span><span>${esc(item.source)}</span></div><button class="inline-ai-btn" data-ai-event="${esc(item.id)}">Разобрать в потоке</button></div><time class="row-time">${shortTime(item.published_at)}</time></article>`).join("");
  }

  function filterNewsFeed() {
    const query = document.getElementById("newsSearch")?.value.toLowerCase() || "";
    const level = document.getElementById("newsLevel")?.value || "ALL";
    const filtered = state.events.filter((item) => (level === "ALL" || item.level === level) && (!query || `${item.title} ${item.project_name} ${item.summary}`.toLowerCase().includes(query)));
    document.getElementById("feed").innerHTML = feedRows(filtered) || '<div class="compact-empty">Новости по заданным условиям не найдены.</div>';
  }

  async function renderNewsFeed() {
    loading();
    try {
      [state.events, state.alerts] = await Promise.all([window.api.getEvents(), window.api.getAlerts("ALL")]);
      const critical = state.alerts.filter((item) => item.level === "RED").length;
      const medium = state.alerts.filter((item) => item.level === "YELLOW").length;
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Единый информационный поток</span><h1>Лента новостей</h1><p>Новости, жалобы и риск-сигналы по объектам в одном рабочем пространстве.</p></div><button class="secondary-btn" id="refreshFeed">Обновить ленту</button></header>
          <div class="stat-grid three-columns">
            <div class="stat"><small>Публикаций в ленте</small><strong>${state.events.length}</strong><span class="delta">из подключённых источников</span></div>
            <div class="stat risk-stat"><small>Критические риски</small><strong>${critical}</strong><span class="delta negative">требуют проверки</span></div>
            <div class="stat"><small>Средние риски</small><strong>${medium}</strong><span class="delta">на наблюдении</span></div>
          </div>
          <div class="news-layout">
            <section class="card"><div class="card-head"><div><h2>Все события</h2><span class="object-meta">Новости отсортированы по времени публикации</span></div><span class="online">● LIVE</span></div><div class="toolbar"><input id="newsSearch" class="input" placeholder="Поиск по новости или проекту"><select id="newsLevel" class="select"><option value="ALL">Все уровни</option><option value="RED">Критические</option><option value="YELLOW">Средние</option><option value="GREEN">Низкие</option></select></div><div id="feed" class="data-list">${feedRows(state.events)}</div></section>
            <aside class="news-sidebar">
              <section class="card risk-digest"><div class="card-head"><div><span class="eyebrow">Требуют внимания</span><h2>Риски</h2></div><span class="chip red">${state.alerts.length}</span></div><div id="riskDigest" class="data-list">${alertRows(state.alerts)}</div></section>
              <section class="card"><div class="card-head"><h2>Источники</h2></div><div class="source-list">${[["Официальные реестры", "24 канала"], ["Деловые СМИ", "48 изданий"], ["Региональные новости", "31 источник"], ["Отзывы и жалобы", "23 площадки"]].map(([name, count]) => `<div class="source-row"><span><b>${name}</b><small>${count}</small></span><span class="online">● онлайн</span></div>`).join("")}</div></section>
            </aside>
          </div>
        </div>`;
      document.getElementById("newsSearch").addEventListener("input", filterNewsFeed);
      document.getElementById("newsLevel").addEventListener("change", filterNewsFeed);
      document.getElementById("refreshFeed").addEventListener("click", async () => {
        [state.events, state.alerts] = await Promise.all([window.api.getEvents(), window.api.getAlerts("ALL")]);
        document.getElementById("feed").innerHTML = feedRows(state.events);
        document.getElementById("riskDigest").innerHTML = alertRows(state.alerts);
        showToast("Лента обновлена");
      });
    } catch (error) { renderError(error); }
  }

  function searchCards(title, items, empty, renderItem) {
    return `<section class="card search-section"><div class="card-head"><h2>${esc(title)}</h2><span class="object-meta">${items.length}</span></div><div class="search-list">${items.map(renderItem).join("") || `<div class="compact-empty">${esc(empty)}</div>`}</div></section>`;
  }

  async function renderSearchResults() {
    loading();
    try {
      if (!state.projects.length) state.projects = await window.api.getProjects();
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.analysisHistory.length) state.analysisHistory = await window.api.getAnalysisHistory();
      const query = state.searchQuery.trim();
      const normalizedQuery = query.toLowerCase();
      const matches = (item) => !normalizedQuery || searchableText(item).includes(normalizedQuery);
      const projectMatches = state.projects.filter(matches);
      const eventMatches = state.events.filter(matches);
      const historyMatches = state.analysisHistory.filter(matches);
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Глобальный поиск</span><h1>Поиск по всему сайту</h1><p>Ищем одновременно по ЖК, городам, застройщикам, новостям, источникам, рискам и истории анализов аккаунта.</p></div></header>
          <section class="card site-search-card">
            <form id="siteSearchForm" class="site-search-form">
              <input id="siteSearchQuery" class="input" value="${esc(query)}" placeholder="Например: Москва, Северный берег, прокуратура, критический риск">
              <button class="primary-btn" type="submit">Найти</button>
            </form>
            <div class="search-summary">
              <span>Объекты: <b>${projectMatches.length}</b></span>
              <span>Новости: <b>${eventMatches.length}</b></span>
              <span>История аккаунта: <b>${historyMatches.length}</b></span>
            </div>
          </section>
          <div class="search-grid">
            ${searchCards("Объекты", projectMatches, "Объекты по запросу не найдены", (project) => `<button class="search-result-row" ${projectAnalyzeAttrs(project)}><b>${esc(project.name)}</b><span>${esc(project.city)} · ${esc(project.developer)} · индекс ${project.score}/100</span>${chip(project.level)}</button>`)}
            ${searchCards("Новости и сигналы", eventMatches, "Новости по запросу не найдены", (event) => `<button class="search-result-row" data-ai-event="${esc(event.id)}"><b>${esc(event.title)}</b><span>${esc(event.project_name)} · ${esc(event.category)} · ${esc(event.source)}</span>${chip(event.level)}</button>`)}
            ${searchCards("История анализов аккаунта", historyMatches, "В истории этого аккаунта пока нет совпадений", (item) => `<button class="search-result-row" data-analyze="${esc(item.project_name)}"><b>${esc(item.project_name)}</b><span>${dateTime(item.analyzed_at)} · ${esc(item.summary)}</span>${chip(item.level)}</button>`)}
          </div>
        </div>`;
      document.getElementById("siteSearchForm").addEventListener("submit", (event) => {
        event.preventDefault();
        state.searchQuery = document.getElementById("siteSearchQuery").value.trim();
        globalSearch.value = state.searchQuery;
        renderSearchResults();
      });
    } catch (error) { renderError(error); }
  }

  function updateNotificationBadge() {
    const unread = scopedNotifications().filter((item) => !item.read).length;
    const counter = document.getElementById("notificationCount");
    const dot = document.querySelector(".notification-button .notification-dot");
    if (counter) counter.textContent = unread ? `${unread} новых` : "Нет новых";
    if (dot) dot.style.display = unread ? "block" : "none";
  }

  async function ensureNotificationsLoaded() {
    if (!state.events.length) state.events = await window.api.getEvents();
    if (!state.projects.length) state.projects = await window.api.getProjects();
    if (!state.notificationsInitialized) {
      state.notifications = state.events.map((event, index) => ({ ...event, read: index > 2 }));
      state.notificationsInitialized = true;
    }
  }

  function closeNotificationOverlay() {
    if (!notificationOverlay) return;
    notificationOverlay.hidden = true;
    notificationOverlay.innerHTML = "";
    document.querySelector(".notification-button")?.classList.remove("active");
    document.querySelector(".notification-button")?.setAttribute("aria-expanded", "false");
  }

  function overlayNotificationRows(items) {
    return items.slice(0, 8).map((item) => `
      <button class="overlay-notification-item ${item.read ? "" : "unread"}" data-ai-event="${esc(item.id)}">
        <span>
          <b>${esc(item.title)}</b>
          <small>${esc(item.project_name)} · ${esc(item.category)} · ${shortTime(item.published_at)}</small>
        </span>
        ${chip(item.level)}
      </button>`).join("");
  }

  async function openNotificationOverlay() {
    if (!notificationOverlay) return;
    await ensureNotificationsLoaded();
    const visibleNotifications = scopedNotifications();
    const unread = visibleNotifications.filter((item) => !item.read).length;
    notificationOverlay.innerHTML = `
      <section class="notification-popover" role="dialog" aria-label="Уведомления">
        <header>
          <div><span>Уведомления</span><b>${unread ? `${unread} новых` : "Всё прочитано"}</b></div>
        </header>
        <div class="overlay-notification-list">
          ${overlayNotificationRows(visibleNotifications) || '<div class="compact-empty">По текущим подпискам уведомлений нет.</div>'}
        </div>
        <footer>
          <button class="secondary-btn danger-btn" data-action="clear-overlay-notifications" ${visibleNotifications.length ? "" : "disabled"}>Удалить все</button>
        </footer>
      </section>`;
    notificationOverlay.hidden = false;
    document.querySelector(".notification-button")?.classList.add("active");
    document.querySelector(".notification-button")?.setAttribute("aria-expanded", "true");
  }

  async function toggleNotificationOverlay() {
    if (!notificationOverlay) return;
    if (!notificationOverlay.hidden) return closeNotificationOverlay();
    try {
      await openNotificationOverlay();
    } catch (error) {
      showToast(`Не удалось открыть уведомления: ${error.message}`);
    }
  }

  async function markOverlayNotificationsRead() {
    const visibleIds = new Set(scopedNotifications().map((item) => item.id));
    state.notifications = state.notifications.map((item) => visibleIds.has(item.id) ? { ...item, read: true } : item);
    updateNotificationBadge();
    await openNotificationOverlay();
    showToast("Уведомления по подпискам прочитаны");
  }

  async function clearOverlayNotifications() {
    state.notifications = [];
    state.notificationsInitialized = true;
    updateNotificationBadge();
    await openNotificationOverlay();
    showToast("Уведомления удалены");
  }

  function showBrowserNotification(item) {
    if (!state.pushEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(item.title, {
        body: `${item.project_name}: ${item.summary}`,
        tag: `risk-${item.id}`,
      });
    } catch (_) {
      showToast("Браузер заблокировал системное уведомление в текущем режиме");
    }
  }

  async function togglePushNotifications() {
    if (state.pushEnabled) {
      state.pushEnabled = false;
      localStorage.setItem("risk-intelligence:push-enabled", "false");
      showToast("Push-уведомления выключены");
      return renderNotifications();
    }
    if (!("Notification" in window)) {
      return showToast("Этот браузер не поддерживает push-уведомления");
    }
    let permission;
    try {
      permission = await Notification.requestPermission();
    } catch (_) {
      return showToast("Браузер не разрешил запрос push-уведомлений в текущем режиме");
    }
    if (permission !== "granted") {
      return showToast("Разрешение на push-уведомления не предоставлено");
    }
    state.pushEnabled = true;
    localStorage.setItem("risk-intelligence:push-enabled", "true");
    showToast("Push-уведомления включены");
    showBrowserNotification({ id: "welcome", title: "Уведомления включены", project_name: "Risk Intelligence", summary: "Критические новости будут появляться в браузере." });
    renderNotifications();
  }

  function notificationRows(items) {
    return items.map((item) => `
      <article class="notification-item ${item.read ? "" : "unread"}">
        <span class="notification-symbol" aria-hidden="true">${item.level === "RED" ? "!" : item.level === "YELLOW" ? "▲" : "✓"}</span>
        <div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.summary)}</p>
          <div class="notification-meta">${esc(item.project_name)} · ${esc(item.category)}</div>
        </div>
        <time class="notification-time">Сегодня, ${shortTime(item.published_at)}</time>
      </article>`).join("");
  }

  async function renderNotifications() {
    loading();
    try {
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.projects.length) state.projects = await window.api.getProjects();
      await ensureNotificationsLoaded();
      const visibleNotifications = scopedNotifications();
      const unread = visibleNotifications.filter((item) => !item.read).length;
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Центр событий</span><h1>Уведомления по подпискам</h1><p>Показываем только новости по выбранным локациям, застройщикам и проектам аналитика.</p></div><button id="markAllRead" class="secondary-btn" ${unread ? "" : "disabled"}>Отметить все прочитанными</button></header>
          <div class="notification-layout">
            <section class="card"><div class="card-head"><h2>Моя лента уведомлений</h2><span class="chip ${unread ? "red" : "green"}">${unread ? `${unread} новых` : "Всё прочитано"}</span></div><div class="notification-list">${notificationRows(visibleNotifications) || '<div class="compact-empty">По текущим подпискам уведомлений нет. Измените подписки в профиле.</div>'}</div></section>
            <aside class="notification-settings">
              <section class="card"><div class="card-head"><h2>Быстрые действия</h2></div>
                <div class="source-list">
                  <button class="secondary-btn" data-route="news">Открыть ленту и риски</button>
                  <button class="secondary-btn" data-route="ai-analysis">Перейти к аналитике потока</button>
                  <button class="secondary-btn" data-route="profile">Настроить подписки</button>
                </div>
              </section>
              <section class="card push-card"><div class="push-icon">!</div><h2>Push-уведомления</h2><p>Получайте системное уведомление, когда появляется критическая новость по проекту.</p><div class="push-status ${state.pushEnabled ? "enabled" : ""}"><i></i>${state.pushEnabled ? "Включены" : "Выключены"}</div><button id="pushToggle" class="${state.pushEnabled ? "secondary-btn" : "primary-btn"}">${state.pushEnabled ? "Выключить push" : "Включить push"}</button>${state.pushEnabled ? '<button id="testPush" class="text-link push-test">Проверить уведомление</button>' : ""}</section>
              <section class="card"><div class="card-head"><h2>Активные подписки</h2></div><div class="subscription-summary"><span>Локации: <b>${state.subscriptions.locations.length}</b></span><span>Застройщики: <b>${state.subscriptions.developers.length}</b></span><span>Проекты: <b>${state.subscriptions.projects.length}</b></span></div></section>
              <section class="card"><div class="card-head"><h2>Каналы</h2></div><div class="detail-list"><div class="detail-row"><span>В приложении</span><b>Включены</b></div><div class="detail-row"><span>Push в браузере</span><b>${state.pushEnabled ? "Включены" : "Выключены"}</b></div><div class="detail-row"><span>Email-сводка</span><b>Ежедневно</b></div></div></section>
            </aside>
          </div>
        </div>`;
      updateNotificationBadge();
      document.getElementById("markAllRead").addEventListener("click", () => {
        const visibleIds = new Set(visibleNotifications.map((item) => item.id));
        state.notifications = state.notifications.map((item) => visibleIds.has(item.id) ? { ...item, read: true } : item);
        updateNotificationBadge();
        showToast("Уведомления по подпискам отмечены прочитанными");
        renderNotifications();
      });
      document.getElementById("pushToggle").addEventListener("click", togglePushNotifications);
      document.getElementById("testPush")?.addEventListener("click", () => {
        const item = visibleNotifications.find((notification) => notification.level === "RED") || visibleNotifications[0];
        if (item) showBrowserNotification(item);
      });
    } catch (error) { renderError(error); }
  }

  function subscriptionCheckboxes(type, items) {
    const selected = new Set(state.subscriptions[type] || []);
    return items.map((item) => `
      <label class="subscription-option">
        <input type="checkbox" data-subscription="${type}" value="${esc(item)}" ${selected.has(item) ? "checked" : ""}>
        <span>${esc(item)}</span>
      </label>`).join("");
  }

  function updateSubscription(input) {
    const type = input.dataset.subscription;
    const value = input.value;
    const current = new Set(state.subscriptions[type] || []);
    if (input.checked) current.add(value);
    else current.delete(value);
    state.subscriptions[type] = [...current].sort((a, b) => a.localeCompare(b, "ru"));
    saveUserSubscriptions();
    updateNotificationBadge();
    showToast("Подписки обновлены");
  }

  function toggleProjectSubscription(projectName, button) {
    const current = new Set(state.subscriptions.projects || []);
    const active = current.has(projectName);
    if (active) current.delete(projectName);
    else current.add(projectName);
    state.subscriptions.projects = [...current].sort((a, b) => a.localeCompare(b, "ru"));
    saveUserSubscriptions();
    updateNotificationBadge();
    if (button) {
      button.textContent = active ? "Подписаться на ЖК" : "Вы подписаны";
      button.classList.toggle("primary-btn", active);
      button.classList.toggle("secondary-btn", !active);
    }
    showToast(active ? `${projectName} удалён из подписок` : `Подписка на ${projectName} включена`);
  }

  async function renderProfile() {
    if (!state.currentUser) return renderLogin();
    loading();
    const user = state.currentUser;
    try {
      if (!state.projects.length) state.projects = await window.api.getProjects();
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.notifications.length) state.notifications = state.events.map((event, index) => ({ ...event, read: index > 2 }));
      [state.analysisHistory, state.riskChanges] = await Promise.all([
        window.api.getAnalysisHistory(),
        window.api.getRiskChanges(),
      ]);
    } catch (error) {
      return renderError(error);
    }
    const locations = uniqueValues(state.projects, "city");
    const developers = uniqueValues(state.projects, "developer");
    const projectNames = uniqueValues(state.projects, "name");
    const visibleNotifications = scopedNotifications();
    const subscriptionCount = state.subscriptions.locations.length + state.subscriptions.developers.length + state.subscriptions.projects.length;
    const criticalNotifications = visibleNotifications.filter((item) => item.level === "RED").length;
    app.innerHTML = `
      <div class="page-enter">
        <header class="page-heading"><div><span class="eyebrow">Учётная запись</span><h1>Личный кабинет аналитика</h1><p>Персональные подписки управляют уведомлениями, а история анализов хранится в рамках текущего аккаунта.</p></div><button class="secondary-btn" data-action="logout">Выйти</button></header>
        <div class="profile-grid">
          <section class="card profile-summary">
            <div class="profile-avatar-large">${initials(user.name)}</div>
            <h2>${esc(user.name)}</h2><div class="profile-role">${esc(user.role)}</div><div class="profile-status">В системе</div>
            <button class="primary-btn" data-action="toggle-notifications">Открыть уведомления</button>
            <div class="subscription-summary profile-subscription-summary"><span>Подписок: <b>${subscriptionCount}</b></span><span>Уведомлений: <b>${visibleNotifications.length}</b></span><span>Критических: <b>${criticalNotifications}</b></span></div>
          </section>
          <div>
            <section class="card"><div class="card-head"><h2>Данные профиля</h2><button class="text-link" data-action="edit-profile">Изменить</button></div><div class="detail-list">
              <div class="detail-row"><span>ФИО</span><b>${esc(user.name)}</b></div><div class="detail-row"><span>Email</span><b>${esc(user.email)}</b></div><div class="detail-row"><span>Роль</span><b>${esc(user.role)}</b></div><div class="detail-row"><span>Подразделение</span><b>${esc(user.department)}</b></div>
            </div></section>
            <section class="card"><div class="card-head"><div><h2>Подписки на уведомления</h2><span class="object-meta">Уведомления приходят только по выбранным локациям, застройщикам и проектам</span></div></div>
              <div class="subscription-grid">
                <div><h3>Локации</h3><div class="subscription-list">${subscriptionCheckboxes("locations", locations)}</div></div>
                <div><h3>Застройщики</h3><div class="subscription-list">${subscriptionCheckboxes("developers", developers)}</div></div>
                <div><h3>Проекты</h3><div class="subscription-list">${subscriptionCheckboxes("projects", projectNames)}</div></div>
              </div>
            </section>
            <div class="stat-grid"><div class="stat"><small>Анализов аккаунта</small><strong>${state.analysisHistory.length}</strong><span class="delta">персональная история</span></div><div class="stat"><small>Объектов в истории</small><strong>${new Set(state.analysisHistory.map((item) => item.project_name)).size}</strong><span class="delta">уникальные ЖК</span></div><div class="stat"><small>Моих уведомлений</small><strong>${visibleNotifications.length}</strong><span class="delta">по подпискам</span></div><div class="stat"><small>Критических</small><strong>${criticalNotifications}</strong><span class="delta negative">на контроле</span></div></div>
            <section class="card"><div class="card-head"><h2>История анализов аккаунта</h2><button class="text-link" data-route="history">Вся история</button></div><div class="history-list">${analysisHistoryRows(state.analysisHistory.slice(0, 5)) || '<div class="compact-empty">У этого аккаунта пока нет сохранённых анализов.</div>'}</div></section>
          </div>
        </div>
      </div>`;
    document.querySelectorAll("[data-subscription]").forEach((input) => input.addEventListener("change", () => updateSubscription(input)));
  }

  function renderLogin() {
    app.innerHTML = `
      <div class="auth-shell page-enter"><section class="auth-card"><div class="auth-mark">G</div><h1>Вход для аналитика</h1><p class="auth-intro">Войдите, чтобы работать с рисками, проектами и уведомлениями.</p>
        <form id="loginForm" class="form-stack"><div class="field"><label for="loginEmail">Email</label><input id="loginEmail" class="input" type="email" value="a.ivanova@gpb.ru" required></div><div class="field"><label for="loginPassword">Пароль</label><input id="loginPassword" class="input" type="password" value="demo1234" minlength="6" required></div><div id="loginError" class="form-error"></div><button id="loginSubmit" class="primary-btn auth-submit" type="submit">Войти</button></form>
        <p class="auth-switch">Нет учётной записи? <button data-route="register">Зарегистрироваться</button></p><div class="auth-note">Демо-режим: форма готова для подключения к <code>POST /api/v1/auth/login</code>.</div></section></div>`;
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("loginSubmit"); button.disabled = true; button.textContent = "Входим…";
      try {
        const result = await window.api.login({ email: document.getElementById("loginEmail").value.trim(), password: document.getElementById("loginPassword").value });
        setCurrentUser(result.user); state.analysisHistory = []; state.riskChanges = []; showToast("Вход выполнен"); navigate("profile");
      } catch (error) { document.getElementById("loginError").textContent = error.message; button.disabled = false; button.textContent = "Войти"; }
    });
  }

  function renderRegister() {
    app.innerHTML = `
      <div class="auth-shell page-enter"><section class="auth-card"><div class="auth-mark">G</div><h1>Регистрация</h1><p class="auth-intro">Создайте учётную запись аналитика Risk Intelligence.</p>
        <form id="registerForm" class="form-stack"><div class="field"><label for="registerName">ФИО</label><input id="registerName" class="input" autocomplete="name" required placeholder="Анна Иванова"></div><div class="field"><label for="registerEmail">Рабочий email</label><input id="registerEmail" class="input" type="email" autocomplete="email" required placeholder="analyst@gpb.ru"></div><div class="field"><label for="registerDepartment">Подразделение</label><input id="registerDepartment" class="input" value="Проектное финансирование"></div><div class="form-row"><div class="field"><label for="registerPassword">Пароль</label><input id="registerPassword" class="input" type="password" minlength="6" required></div><div class="field"><label for="registerConfirm">Повторите пароль</label><input id="registerConfirm" class="input" type="password" minlength="6" required></div></div><div id="registerError" class="form-error"></div><button id="registerSubmit" class="primary-btn auth-submit" type="submit">Создать учётную запись</button></form>
        <p class="auth-switch">Уже есть учётная запись? <button data-route="login">Войти</button></p><div class="auth-note">Демо-режим: форма готова для подключения к <code>POST /api/v1/auth/register</code>.</div></section></div>`;
    document.getElementById("registerForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const password = document.getElementById("registerPassword").value; const errorBox = document.getElementById("registerError");
      if (password !== document.getElementById("registerConfirm").value) { errorBox.textContent = "Пароли не совпадают"; return; }
      const button = document.getElementById("registerSubmit"); button.disabled = true; button.textContent = "Создаём…";
      try {
        const result = await window.api.register({ name: document.getElementById("registerName").value.trim(), email: document.getElementById("registerEmail").value.trim(), department: document.getElementById("registerDepartment").value.trim(), password });
        setCurrentUser(result.user); state.analysisHistory = []; state.riskChanges = []; showToast("Учётная запись создана"); navigate("profile");
      } catch (error) { errorBox.textContent = error.message; button.disabled = false; button.textContent = "Создать учётную запись"; }
    });
  }

  async function renderRoute() {
    const route = currentRoute();
    window.scrollTo(0, 0);
    setActiveNav(route);
    if (route === "dashboard") {
      const pending = state.pendingAnalysis;
      state.pendingAnalysis = "";
      return renderDashboard(pending);
    }
    if (route === "ai-analysis") return renderAIAnalysis();
    if (route === "projects") return renderProjects();
    if (route === "news") return renderNewsFeed();
    if (route === "history") return renderHistory();
    if (route === "notifications") return renderNotifications();
    if (route === "profile") return renderProfile();
    if (route === "search") return renderSearchResults();
    if (route === "login") return renderLogin();
    return renderRegister();
  }

  document.addEventListener("click", async (event) => {
    const notificationButton = event.target.closest(".notification-button");
    const notificationPopover = event.target.closest(".notification-popover");
    if (notificationOverlay && !notificationOverlay.hidden && !notificationButton && !notificationPopover) {
      closeNotificationOverlay();
    }
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) { event.preventDefault(); closeNotificationOverlay(); navigate(routeTarget.dataset.route); return; }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action === "toggle-notifications") {
      event.preventDefault();
      await toggleNotificationOverlay();
      return;
    }
    if (actionTarget?.dataset.action === "close-notifications") {
      event.preventDefault();
      closeNotificationOverlay();
      return;
    }
    if (actionTarget?.dataset.action === "mark-overlay-notifications-read") {
      event.preventDefault();
      await markOverlayNotificationsRead();
      return;
    }
    if (actionTarget?.dataset.action === "clear-overlay-notifications") {
      event.preventDefault();
      await clearOverlayNotifications();
      return;
    }
    if (actionTarget?.dataset.action === "toggle-project-subscription") {
      event.preventDefault();
      toggleProjectSubscription(actionTarget.dataset.projectName, actionTarget);
      return;
    }
    const aiTarget = event.target.closest("[data-ai-event]");
    if (aiTarget) {
      event.preventDefault();
      const eventItem = state.events.find((item) => item.id === aiTarget.dataset.aiEvent);
      state.pendingInsightQuestion = eventItem ? `Разбери сигнал по потоку: ${eventItem.title}. Проект: ${eventItem.project_name}.` : "Какие риски связаны с выбранной новостью?";
      state.streamInsight = null;
      closeNotificationOverlay();
      if (currentRoute() === "ai-analysis") renderAIAnalysis();
      else navigate("ai-analysis");
      return;
    }
    const analyzeTarget = event.target.closest("[data-analyze], [data-analyze-name]");
    if (analyzeTarget) {
      event.preventDefault();
      const name = analyzeTarget.dataset.analyzeName || analyzeTarget.dataset.analyze;
      const context = {
        projectId: analyzeTarget.dataset.analyzeId || "",
        city: analyzeTarget.dataset.analyzeCity || "",
        developer: analyzeTarget.dataset.analyzeDeveloper || "",
      };
      closeNotificationOverlay();
      if (currentRoute() === "dashboard") analyze(name, context);
      else { state.pendingAnalysis = name; state.pendingProjectContext = context; location.hash = "dashboard"; }
      return;
    }
    if (actionTarget?.dataset.action === "logout") {
      setCurrentUser(null); state.analysisHistory = []; state.riskChanges = []; showToast("Вы вышли из системы"); navigate("login");
    } else if (actionTarget?.dataset.action === "edit-profile") {
      showToast("Редактирование профиля будет подключено к backend");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNotificationOverlay();
  });
  globalSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = globalSearch.value.trim();
    if (!query) return showToast("Введите запрос для поиска по сайту");
    state.searchQuery = query;
    if (currentRoute() === "search") renderSearchResults();
    else navigate("search");
  });
  window.addEventListener("hashchange", renderRoute);
  updateHeaderUser();
  renderRoute();
})();
