// This file is watched by src/main.py and reloads automatically after saving.
(function () {
  const app = document.getElementById("app");
  const globalSearch = document.getElementById("globalSearch");
  const notificationOverlay = document.getElementById("notificationOverlay");
  const initialRoute = document.body.dataset.initialRoute || "dashboard";
  const defaultUser = { id: "u-001", name: "Анна Иванова", email: "a.ivanova@gpb.ru", role: "Аналитик рисков", department: "Проектное финансирование" };
  const defaultSubscriptions = { locations: ["Москва", "Екатеринбург"], developers: ["ГК Север Девелопмент"], projects: ["ЖК Северный берег"] };
  const state = { overview: null, analysis: null, streamInsight: null, pendingInsightQuestion: "", selectedImpactEventId: "", alerts: [], projects: [], events: [], notifications: [], notificationsInitialized: false, analysisHistory: [], riskChanges: [], pendingAnalysis: "", pendingProjectContext: null, searchQuery: "", projectSort: "risk-desc", subscriptions: readUserSubscriptions(defaultUser.id), pushEnabled: localStorage.getItem("risk-intelligence:push-enabled") === "true" && "Notification" in window && Notification.permission === "granted", currentUser: defaultUser };
  const routeTitles = {
    dashboard: "Мониторинг", "ai-analysis": "ИИ-анализ потока", projects: "Объекты", news: "Поток",
    history: "Журнал", notifications: "Уведомления", profile: "Профиль аналитика", search: "Поиск", login: "Вход", register: "Регистрация",
  };
  const routePaths = {
    dashboard: "/index.html",
    "ai-analysis": "/ai-analysis.html",
    projects: "/projects.html",
    news: "/news.html",
    history: "/history.html",
    notifications: "/notifications.html",
    profile: "/profile.html",
    search: "/search.html",
    login: "/login.html",
    register: "/register.html",
  };
  const pendingKeys = {
    analysis: "risk-intelligence:pending-analysis",
    analysisContext: "risk-intelligence:pending-analysis-context",
    aiQuestion: "risk-intelligence:pending-ai-question",
    searchQuery: "risk-intelligence:pending-search-query",
  };
  const searchHistoryKey = "risk-intelligence:dashboard-search-history";
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
    const route = location.hash.replace("#", "") || initialRoute;
    return routeTitles[route] ? route : "dashboard";
  }

  function readPendingValue(key) {
    const value = sessionStorage.getItem(key) || "";
    sessionStorage.removeItem(key);
    return value;
  }

  function readPendingJson(key) {
    const value = readPendingValue(key);
    if (!value) return null;
    try { return JSON.parse(value); }
    catch { return null; }
  }

  function pageHtml(route, slots = {}) {
    return window.renderTemplate(`template-${route}`, slots);
  }

  function navigate(route) {
    if (currentRoute() === route) {
      renderRoute();
      return;
    }
    window.location.href = routePaths[route] || routePaths.dashboard;
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

  function readSearchHistory() {
    try {
      const items = JSON.parse(localStorage.getItem(searchHistoryKey) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function saveSearchHistory(items) {
    localStorage.setItem(searchHistoryKey, JSON.stringify(items.slice(0, 6)));
  }

  function rememberSearchHistory(analysis, query) {
    const name = analysis?.project_name || query;
    if (!name) return;
    const item = {
      project_name: name,
      summary: analysis?.summary || "Запрос по новостному потоку",
      score: Number(analysis?.score || 0),
      level: analysis?.level || "GREEN",
      analyzed_at: new Date().toISOString(),
    };
    const next = [item, ...readSearchHistory().filter((entry) => entry.project_name !== name)];
    saveSearchHistory(next);
  }

  function searchHistoryRows(items) {
    return items.map((item) => `
      <button class="search-history-row" data-analyze="${esc(item.project_name)}">
        <span>
          <b>${esc(item.project_name)}</b>
          <small>${dateTime(item.analyzed_at)} · ${esc(item.summary || "Запрос по новостному потоку")}</small>
        </span>
        <span class="history-score"><b>${Number(item.score || 0)}</b>/100 ${chip(item.level || "GREEN")}</span>
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
    if (!pendingAnalysis) {
      const storedAnalysis = readPendingValue(pendingKeys.analysis);
      if (storedAnalysis) {
        pendingAnalysis = storedAnalysis;
        state.pendingProjectContext = readPendingJson(pendingKeys.analysisContext) || {};
      }
    }
    loading();
    try {
      state.overview ||= await window.api.getOverview();
      if (!state.projects.length) state.projects = await window.api.getProjects();
      if (!state.analysisHistory.length) state.analysisHistory = await window.api.getAnalysisHistory();
      const data = state.overview;
      const searchHistory = readSearchHistory();
      const historyItems = (searchHistory.length ? searchHistory : state.analysisHistory).slice(0, 4);
      app.innerHTML = pageHtml("dashboard", {
        SEARCH_HISTORY_ROWS: searchHistoryRows(historyItems) || '<div class="compact-empty">История поиска пока пуста. Запустите первый анализ объекта.</div>',
        ANALYSIS_PANEL: analysisPanel(state.analysis),
      });
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
      rememberSearchHistory(state.analysis, value);
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
      const pending = state.pendingInsightQuestion || readPendingValue(pendingKeys.aiQuestion) || "Какие ЖК сейчас требуют внимания?";
      state.pendingInsightQuestion = "";
      app.innerHTML = pageHtml("ai-analysis", {
        PROJECTS_COUNT: state.projects.length,
        EVENTS_COUNT: state.events.length,
        PENDING_QUESTION: esc(pending),
        SUGGESTIONS: suggestions.map((question) => `<button type="button" data-question="${esc(question)}">${esc(question)}</button>`).join(""),
        STREAM_RESULT: streamInsightResult(state.streamInsight),
      });
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
    return sortProjects(items).map((p) => `
      <button class="project-table-row" role="row" ${projectAnalyzeAttrs(p)}>
        <span role="cell" class="project-name-cell">${esc(p.name)}</span>
        <span role="cell">${esc(p.city)}</span>
        <span role="cell">${esc(p.developer)}</span>
        <span role="cell">${chip(p.level)}</span>
        <span role="cell"><b>${p.score}</b>/100</span>
        <span role="cell" class="progress">${p.completion}%<div class="progress-line"><span style="width:${p.completion}%"></span></div></span>
        <span role="cell">${shortTime(p.updated_at)}</span>
      </button>`).join("");
  }

  async function renderProjects() {
    loading();
    try {
      state.projects = await window.api.getProjects();
      app.innerHTML = pageHtml("projects", { PROJECT_ROWS: projectTable(state.projects) });
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
      app.innerHTML = pageHtml("history", {
        HISTORY_COUNT: state.analysisHistory.length,
        PROJECTS_COUNT: projectsCount,
        CHANGES_COUNT: state.riskChanges.length,
        CRITICAL_COUNT: criticalCount,
        HISTORY_ROWS: analysisHistoryRows(state.analysisHistory) || '<div class="compact-empty">История пуста. Запустите первый анализ на главной странице.</div>',
        RISK_CHANGE_ROWS: riskChangeRows(state.riskChanges) || '<div class="compact-empty">Изменений риска пока не зафиксировано.</div>',
      });
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
      app.innerHTML = pageHtml("news", {
        EVENTS_COUNT: state.events.length,
        CRITICAL_COUNT: critical,
        MEDIUM_COUNT: medium,
        FEED_ROWS: feedRows(state.events),
        ALERTS_COUNT: state.alerts.length,
        ALERT_ROWS: alertRows(state.alerts),
        SOURCE_ROWS: [["Официальные реестры", "24 канала"], ["Деловые СМИ", "48 изданий"], ["Региональные новости", "31 источник"], ["Отзывы и жалобы", "23 площадки"]].map(([name, count]) => `<div class="source-row"><span><b>${name}</b><small>${count}</small></span><span class="online">● онлайн</span></div>`).join(""),
      });
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
      if (!state.searchQuery) {
        state.searchQuery = readPendingValue(pendingKeys.searchQuery);
        if (state.searchQuery) globalSearch.value = state.searchQuery;
      }
      const query = state.searchQuery.trim();
      const normalizedQuery = query.toLowerCase();
      const matches = (item) => !normalizedQuery || searchableText(item).includes(normalizedQuery);
      const projectMatches = state.projects.filter(matches);
      const eventMatches = state.events.filter(matches);
      const historyMatches = state.analysisHistory.filter(matches);
      app.innerHTML = pageHtml("search", {
        QUERY: esc(query),
        PROJECT_COUNT: projectMatches.length,
        EVENT_COUNT: eventMatches.length,
        HISTORY_COUNT: historyMatches.length,
        SEARCH_SECTIONS: `
          ${searchCards("Объекты", projectMatches, "Объекты по запросу не найдены", (project) => `<button class="search-result-row" ${projectAnalyzeAttrs(project)}><b>${esc(project.name)}</b><span>${esc(project.city)} · ${esc(project.developer)} · индекс ${project.score}/100</span>${chip(project.level)}</button>`)}
          ${searchCards("Новости и сигналы", eventMatches, "Новости по запросу не найдены", (event) => `<button class="search-result-row" data-ai-event="${esc(event.id)}"><b>${esc(event.title)}</b><span>${esc(event.project_name)} · ${esc(event.category)} · ${esc(event.source)}</span>${chip(event.level)}</button>`)}
          ${searchCards("История анализов аккаунта", historyMatches, "В истории этого аккаунта пока нет совпадений", (item) => `<button class="search-result-row" data-analyze="${esc(item.project_name)}"><b>${esc(item.project_name)}</b><span>${dateTime(item.analyzed_at)} · ${esc(item.summary)}</span>${chip(item.level)}</button>`)}
        `,
      });
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
      app.innerHTML = pageHtml("notifications", {
        MARK_ALL_DISABLED: unread ? "" : "disabled",
        UNREAD_CHIP_CLASS: unread ? "red" : "green",
        UNREAD_LABEL: unread ? `${unread} новых` : "Всё прочитано",
        NOTIFICATION_ROWS: notificationRows(visibleNotifications) || '<div class="compact-empty">По текущим подпискам уведомлений нет. Измените подписки в профиле.</div>',
        PUSH_ENABLED_CLASS: state.pushEnabled ? "enabled" : "",
        PUSH_STATUS: state.pushEnabled ? "Включены" : "Выключены",
        PUSH_BUTTON_CLASS: state.pushEnabled ? "secondary-btn" : "primary-btn",
        PUSH_BUTTON_TEXT: state.pushEnabled ? "Выключить push" : "Включить push",
        TEST_PUSH_BUTTON: state.pushEnabled ? '<button id="testPush" class="text-link push-test">Проверить уведомление</button>' : "",
        LOCATIONS_COUNT: state.subscriptions.locations.length,
        DEVELOPERS_COUNT: state.subscriptions.developers.length,
        PROJECTS_COUNT: state.subscriptions.projects.length,
        PUSH_CHANNEL_STATUS: state.pushEnabled ? "Включены" : "Выключены",
      });
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
    const selectedItems = items.filter((item) => selected.has(item));
    if (!selectedItems.length) return '<div class="compact-empty subscription-empty">Нет выбранных подписок</div>';
    return selectedItems.map((item) => `
      <label class="subscription-option">
        <input type="checkbox" data-subscription="${type}" value="${esc(item)}" checked>
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
    if (currentRoute() === "profile") renderProfile();
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
    app.innerHTML = pageHtml("profile", {
      USER_INITIALS: initials(user.name),
      USER_NAME: esc(user.name),
      USER_ROLE: esc(user.role),
      USER_EMAIL: esc(user.email),
      USER_DEPARTMENT: esc(user.department),
      LOCATION_CHECKBOXES: subscriptionCheckboxes("locations", locations),
      DEVELOPER_CHECKBOXES: subscriptionCheckboxes("developers", developers),
      PROJECT_CHECKBOXES: subscriptionCheckboxes("projects", projectNames),
      ACCOUNT_HISTORY_ROWS: analysisHistoryRows(state.analysisHistory.slice(0, 5)) || '<div class="compact-empty">У этого аккаунта пока нет сохранённых анализов.</div>',
    });
    document.querySelectorAll("[data-subscription]").forEach((input) => input.addEventListener("change", () => updateSubscription(input)));
  }

  function renderLogin() {
    app.innerHTML = pageHtml("login");
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
    app.innerHTML = pageHtml("register");
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
      else {
        sessionStorage.setItem(pendingKeys.aiQuestion, state.pendingInsightQuestion);
        navigate("ai-analysis");
      }
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
      else {
        state.pendingAnalysis = name;
        state.pendingProjectContext = context;
        sessionStorage.setItem(pendingKeys.analysis, name);
        sessionStorage.setItem(pendingKeys.analysisContext, JSON.stringify(context));
        navigate("dashboard");
      }
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
    sessionStorage.setItem(pendingKeys.searchQuery, query);
    if (currentRoute() === "search") renderSearchResults();
    else navigate("search");
  });
  window.addEventListener("hashchange", renderRoute);
  updateHeaderUser();
  renderRoute();
})();
