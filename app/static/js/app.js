// This file is watched by src/main.py and reloads automatically after saving.
(function () {
  const app = document.getElementById("app");
  const globalSearch = document.getElementById("globalSearch");
  const defaultUser = { id: "u-001", name: "Анна Иванова", email: "a.ivanova@gpb.ru", role: "Аналитик рисков", department: "Проектное финансирование" };
  const state = { overview: null, analysis: null, aiImpact: null, selectedImpactEventId: "", alerts: [], projects: [], events: [], notifications: [], analysisHistory: [], riskChanges: [], favoriteIds: new Set(), pendingAnalysis: "", pushEnabled: localStorage.getItem("risk-intelligence:push-enabled") === "true" && "Notification" in window && Notification.permission === "granted", currentUser: defaultUser };
  const routeTitles = {
    dashboard: "Проверить ЖК", "ai-analysis": "ИИ-анализ", projects: "Проекты", news: "Лента новостей",
    history: "История", notifications: "Уведомления", profile: "Профиль аналитика", login: "Вход", register: "Регистрация",
  };
  const palette = {
    RED: { css: "red", label: "Критический", color: "#d92d20" },
    YELLOW: { css: "yellow", label: "Средний", color: "#f5a000" },
    GREEN: { css: "green", label: "Низкий", color: "#149447" },
  };

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
    document.title = `${routeTitles[route]} — Risk Intelligence`;
  }

  function initials(name) {
    return String(name || "Аналитик").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function updateHeaderUser() {
    const user = state.currentUser;
    document.getElementById("profileAvatar").textContent = user ? "👤" : "→";
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

  function projectRows(items) {
    return items.map((p) => `
      <button class="object-row" data-analyze="${esc(p.name)}">
        <span class="object-avatar">${esc(p.name.replace("ЖК ", "").split(" ").map((x) => x[0]).join("").slice(0, 2))}</span>
        <span><span class="object-name">${esc(p.name)}</span><span class="object-meta">${esc(p.city)} · ${esc(p.developer)}</span></span>
        <span class="score">${p.score}<small>/100</small></span>${chip(p.level)}
      </button>`).join("");
  }

  function analysisPanel(data) {
    if (!data) return `
      <section class="card"><div class="empty-state"><div><div class="empty-icon">⌕</div>
      Выберите объект из списка или введите название ЖК, чтобы увидеть результат анализа.</div></div></section>`;
    const p = palette[data.level] || palette.GREEN;
    return `
      <section class="card">
        <div class="result-kicker">${chip(data.level)}</div>
        <h2 class="result-title">${esc(data.project_name)}</h2>
        <div class="result-summary">${esc(data.summary)}</div>
        <div class="score-box" style="--ring-color:${p.color};--ring-value:${Number(data.score)}">
          <div class="score-ring"><span>${Number(data.score)}</span></div>
          <div class="score-copy"><b>Индекс риска</b><br>Скоринг по новостям, жалобам, юридическим и операционным сигналам.</div>
        </div>
        <div>${data.drivers.map((d) => `
          <div class="driver" style="--ring-color:${p.color}">
            <div class="driver-top"><span>${esc(d.name)}</span><span>${Number(d.value)}%</span></div>
            <small>${esc(d.text)}</small><div class="bar"><span style="width:${Number(d.value)}%"></span></div>
          </div>`).join("")}</div>
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
      const data = state.overview;
      state.favoriteIds = new Set(data.favorites.map((project) => project.id));
      app.innerHTML = `
        <div class="dashboard-grid page-enter">
          <div>
            <section class="hero">
              <span class="hero-badge">Система обнаружения рисков жилых комплексов</span>
              <h1>Мониторинг рисков финансирования ЖК</h1>
              <p>Система анализирует новости, жалобы и открытые источники, чтобы заранее выявлять проблемные объекты и помогать принимать решения.</p>
              <form id="analysisForm" class="analysis-form">
                <input id="projectInput" class="input" autocomplete="off" placeholder="Например: ЖК Северный берег" />
                <button id="analyzeButton" class="primary-btn" type="submit">Анализировать</button>
              </form>
              <div class="samples">
                ${data.favorites.slice(0, 3).map((p) => `<button class="sample" data-analyze="${esc(p.name)}">${esc(p.name)}</button>`).join("") || '<span class="object-meta">Добавьте проекты в избранное</span>'}
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Избранные объекты</h2><div class="card-actions"><button class="text-link" data-route="history">История</button><button class="text-link" data-route="projects">Все объекты</button></div></div>
              <div class="object-list">${projectRows(data.favorites) || '<div class="compact-empty">Пока ничего не сохранено. Откройте проекты и нажмите звезду рядом с нужным объектом.</div>'}</div>
            </section>
          </div>
          <aside id="resultPanel" class="result-panel">${analysisPanel(state.analysis)}</aside>
        </div>`;
      document.getElementById("analysisForm").addEventListener("submit", (event) => {
        event.preventDefault(); analyze(document.getElementById("projectInput").value);
      });
      if (pendingAnalysis) {
        document.getElementById("projectInput").value = pendingAnalysis;
        analyze(pendingAnalysis);
      }
    } catch (error) { renderError(error); }
  }

  async function analyze(projectName) {
    const value = String(projectName || "").trim();
    if (!value) return showToast("Введите название жилого комплекса");
    const button = document.getElementById("analyzeButton");
    if (button) { button.disabled = true; button.textContent = "Анализируем…"; }
    try {
      state.analysis = await window.api.analyze(value);
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
          <button class="inline-ai-btn" data-ai-event="${esc(item.id)}">Спросить ИИ о влиянии</button>
        </div><time class="row-time">Сегодня, ${shortTime(item.published_at)}</time>
      </article>`).join("");
  }

  function impactResult(data) {
    if (!data) return `<div class="ai-empty"><span>AI</span><b>Ответ появится здесь</b><p>Выберите новость и задайте вопрос о её влиянии на проект, риск или решение по финансированию.</p></div>`;
    const positive = data.risk_delta > 0;
    return `
      <div class="ai-answer page-enter">
        <div class="ai-answer-top"><span class="ai-spark">AI</span><div><small>Вывод модели</small><h2>${esc(data.verdict)}</h2></div><span class="risk-delta ${positive ? "up" : "down"}">${positive ? "+" : ""}${data.risk_delta} к риску</span></div>
        <div class="confidence"><span>Уверенность ответа</span><b>${data.confidence}%</b><div><i style="width:${data.confidence}%"></i></div></div>
        <p class="ai-detail">${esc(data.detailed_analysis)}</p>
        <div class="ai-answer-columns">
          <div><h3>Что повлияло на вывод</h3><ul>${data.factors.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>
          <div><h3>Что рекомендуется сделать</h3><ol>${data.recommendations.map((item) => `<li>${esc(item)}</li>`).join("")}</ol></div>
        </div>
        <div class="ai-disclaimer">Ответ сформирован по доступному контексту новости. Финальное решение принимает аналитик.</div>
      </div>`;
  }

  async function askImpact(eventId, question) {
    const button = document.getElementById("askAiButton");
    if (button) { button.disabled = true; button.textContent = "Анализируем контекст…"; }
    try {
      state.aiImpact = await window.api.explainImpact(eventId, question);
      document.getElementById("aiImpactResult").innerHTML = impactResult(state.aiImpact);
    } catch (error) {
      showToast(`Не удалось получить ответ ИИ: ${error.message}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Спросить ИИ"; }
    }
  }

  async function renderAIAnalysis() {
    loading();
    try {
      if (!state.events.length) state.events = await window.api.getEvents();
      const selected = state.events.find((item) => item.id === state.selectedImpactEventId) || state.events[0];
      state.selectedImpactEventId = selected?.id || "";
      const suggestions = ["Как эта новость повлияла на риск проекта?", "Нужно ли пересматривать график финансирования?", "Какие факторы требуют ручной проверки?"];
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading ai-page-heading"><div><h1>Подробный анализ новости</h1><p>Задайте вопрос по конкретному событию и получите объяснение влияния на проект.</p></div><span class="ai-status"><i></i> Модель доступна</span></header>
          <div class="ai-workspace">
            <aside class="card ai-context-panel"><div class="card-head"><h2>Контекст</h2><span class="object-meta">${state.events.length} событий</span></div><div class="ai-event-list">
              ${state.events.map((event) => `<button class="ai-event-card ${event.id === selected?.id ? "active" : ""}" data-ai-event="${esc(event.id)}"><span class="severity ${event.level === "YELLOW" ? "yellow" : ""}" style="${event.level === "GREEN" ? "background:#149447" : ""}"></span><span><b>${esc(event.title)}</b><small>${esc(event.project_name)} · ${esc(event.source)}</small></span>${chip(event.level)}</button>`).join("")}
            </div></aside>
            <section class="ai-main">
              <div class="card ai-question-card">
                <div class="selected-news"><span class="selected-news-label">Выбранная новость</span><h2>${esc(selected?.title || "Нет доступных новостей")}</h2><p>${esc(selected?.summary || "")}</p><div class="row-meta"><span>${esc(selected?.project_name || "")}</span><span>${esc(selected?.category || "")}</span><span>${esc(selected?.source || "")}</span></div></div>
                <form id="aiQuestionForm"><label for="aiQuestion">Что вы хотите узнать?</label><textarea id="aiQuestion" placeholder="Например: как эта новость повлияла на риск проекта?" required minlength="5">Как эта новость повлияла на риск проекта?</textarea><div class="question-suggestions">${suggestions.map((question) => `<button type="button" data-question="${esc(question)}">${esc(question)}</button>`).join("")}</div><button id="askAiButton" class="primary-btn" type="submit" ${selected ? "" : "disabled"}>Спросить ИИ</button></form>
              </div>
              <section id="aiImpactResult" class="card ai-result-card">${impactResult(state.aiImpact)}</section>
            </section>
          </div>
        </div>`;
      document.getElementById("aiQuestionForm").addEventListener("submit", (event) => {
        event.preventDefault();
        askImpact(state.selectedImpactEventId, document.getElementById("aiQuestion").value.trim());
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
    return [...items].sort((a, b) => Number(state.favoriteIds.has(b.id)) - Number(state.favoriteIds.has(a.id)) || a.name.localeCompare(b.name, "ru"));
  }

  function projectTable(items) {
    return sortProjects(items).map((p) => {
      const favorite = state.favoriteIds.has(p.id);
      return `<tr data-analyze="${esc(p.name)}"><td><button class="favorite-button ${favorite ? "active" : ""}" data-action="toggle-favorite" data-project-id="${esc(p.id)}" data-project-name="${esc(p.name)}" aria-label="${favorite ? "Удалить из избранного" : "Добавить в избранное"}" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button></td><td>${esc(p.name)}</td><td>${esc(p.city)}</td><td>${esc(p.developer)}</td><td>${chip(p.level)}</td><td><b>${p.score}</b>/100</td><td class="progress">${p.completion}%<div class="progress-line"><span style="width:${p.completion}%"></span></div></td><td>${shortTime(p.updated_at)}</td></tr>`;
    }).join("");
  }

  async function renderProjects() {
    loading();
    try {
      const [projects, favorites] = await Promise.all([window.api.getProjects(), window.api.getFavorites()]);
      state.projects = projects;
      state.favoriteIds = new Set(favorites.map((project) => project.id));
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Проектное финансирование</span><h1>Портфель проектов</h1><p>Единый список объектов и их текущий риск-профиль.</p></div><button class="primary-btn" data-route="dashboard">Проверить новый ЖК</button></header>
          <section class="card">
            <div class="toolbar"><input id="projectSearch" class="input" placeholder="Название, город или застройщик"><select id="projectLevel" class="select"><option value="ALL">Все риски</option><option value="RED">Критические</option><option value="YELLOW">Средние</option><option value="GREEN">Низкие</option></select></div>
            <div class="table-wrap"><table><thead><tr><th>Избранное</th><th>Объект</th><th>Город</th><th>Застройщик</th><th>Риск</th><th>Индекс</th><th>Готовность</th><th>Обновлено</th></tr></thead><tbody id="projectBody">${projectTable(state.projects)}</tbody></table></div>
          </section>
        </div>`;
      const update = () => {
        const q = document.getElementById("projectSearch").value.toLowerCase();
        const level = document.getElementById("projectLevel").value;
        const items = state.projects.filter((project) => (level === "ALL" || project.level === level) && (!q || `${project.name} ${project.city} ${project.developer}`.toLowerCase().includes(q)));
        document.getElementById("projectBody").innerHTML = projectTable(items);
      };
      document.getElementById("projectSearch").addEventListener("input", update);
      document.getElementById("projectLevel").addEventListener("change", update);
    } catch (error) { renderError(error); }
  }

  async function toggleFavorite(button) {
    const projectId = button.dataset.projectId;
    const projectName = button.dataset.projectName;
    const favorite = state.favoriteIds.has(projectId);
    button.disabled = true;
    try {
      if (favorite) {
        await window.api.removeFavorite(projectId);
        state.favoriteIds.delete(projectId);
      } else {
        await window.api.addFavorite(projectId);
        state.favoriteIds.add(projectId);
      }
      state.overview = null;
      document.querySelectorAll('[data-action="toggle-favorite"]').forEach((item) => {
        if (item.dataset.projectId !== projectId) return;
        const active = state.favoriteIds.has(projectId);
        item.classList.toggle("active", active);
        item.textContent = active ? "★" : "☆";
        item.setAttribute("aria-pressed", String(active));
        item.setAttribute("aria-label", active ? "Удалить из избранного" : "Добавить в избранное");
        item.disabled = false;
      });
      if (currentRoute() === "projects") {
        const q = document.getElementById("projectSearch")?.value.toLowerCase() || "";
        const level = document.getElementById("projectLevel")?.value || "ALL";
        const visible = state.projects.filter((project) => (level === "ALL" || project.level === level) && (!q || `${project.name} ${project.city} ${project.developer}`.toLowerCase().includes(q)));
        document.getElementById("projectBody").innerHTML = projectTable(visible);
      }
      showToast(favorite ? `${projectName} удалён из избранного` : `${projectName} добавлен в избранное`);
    } catch (error) {
      button.disabled = false;
      showToast(`Не удалось изменить избранное: ${error.message}`);
    }
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
    return items.map((item) => `<article class="feed-row"><span class="severity ${item.level === "YELLOW" ? "yellow" : ""}" style="${item.level === "GREEN" ? "background:#149447" : ""}"></span><div><div class="feed-title-row"><h3>${esc(item.title)}</h3>${chip(item.level)}</div><p>${esc(item.summary)}</p><div class="row-meta"><span>${esc(item.project_name)}</span><span>${esc(item.category)}</span><span>${esc(item.source)}</span></div><button class="inline-ai-btn" data-ai-event="${esc(item.id)}">Спросить ИИ о влиянии</button></div><time class="row-time">${shortTime(item.published_at)}</time></article>`).join("");
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

  function updateNotificationBadge() {
    const unread = state.notifications.filter((item) => !item.read).length;
    const counter = document.getElementById("notificationCount");
    const dot = document.querySelector(".notification-button .notification-dot");
    if (counter) counter.textContent = unread ? `${unread} новых` : "Нет новых";
    if (dot) dot.style.display = unread ? "block" : "none";
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
      if (!state.notifications.length) {
        state.notifications = state.events.map((event, index) => ({ ...event, read: index > 2 }));
      }
      const unread = state.notifications.filter((item) => !item.read).length;
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Центр событий</span><h1>Уведомления</h1><p>Важные изменения по объектам и рискам.</p></div><button id="markAllRead" class="secondary-btn" ${unread ? "" : "disabled"}>Отметить все прочитанными</button></header>
          <div class="notification-layout">
            <section class="card"><div class="card-head"><h2>Все уведомления</h2><span class="chip ${unread ? "red" : "green"}">${unread ? `${unread} новых` : "Всё прочитано"}</span></div><div class="notification-list">${notificationRows(state.notifications)}</div></section>
            <aside class="notification-settings">
              <section class="card"><div class="card-head"><h2>Быстрые действия</h2></div>
                <div class="source-list">
                  <button class="secondary-btn" data-route="news">Открыть ленту и риски</button>
                  <button class="secondary-btn" data-route="ai-analysis">Перейти к ИИ-анализу</button>
                </div>
              </section>
              <section class="card push-card"><div class="push-icon">🔔</div><h2>Push-уведомления</h2><p>Получайте системное уведомление, когда появляется критическая новость по проекту.</p><div class="push-status ${state.pushEnabled ? "enabled" : ""}"><i></i>${state.pushEnabled ? "Включены" : "Выключены"}</div><button id="pushToggle" class="${state.pushEnabled ? "secondary-btn" : "primary-btn"}">${state.pushEnabled ? "Выключить push" : "Включить push"}</button>${state.pushEnabled ? '<button id="testPush" class="text-link push-test">Проверить уведомление</button>' : ""}</section>
              <section class="card"><div class="card-head"><h2>Каналы</h2></div><div class="detail-list"><div class="detail-row"><span>В приложении</span><b>Включены</b></div><div class="detail-row"><span>Push в браузере</span><b>${state.pushEnabled ? "Включены" : "Выключены"}</b></div><div class="detail-row"><span>Email-сводка</span><b>Ежедневно</b></div></div></section>
            </aside>
          </div>
        </div>`;
      updateNotificationBadge();
      document.getElementById("markAllRead").addEventListener("click", () => {
        state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
        updateNotificationBadge();
        showToast("Все уведомления отмечены прочитанными");
        renderNotifications();
      });
      document.getElementById("pushToggle").addEventListener("click", togglePushNotifications);
      document.getElementById("testPush")?.addEventListener("click", () => {
        const item = state.notifications.find((notification) => notification.level === "RED") || state.notifications[0];
        if (item) showBrowserNotification(item);
      });
    } catch (error) { renderError(error); }
  }

  function renderProfile() {
    if (!state.currentUser) return renderLogin();
    const user = state.currentUser;
    app.innerHTML = `
      <div class="page-enter">
        <header class="page-heading"><div><span class="eyebrow">Учётная запись</span><h1>Профиль аналитика</h1><p>Личные данные, роль и рабочие настройки.</p></div><button class="secondary-btn" data-action="logout">Выйти</button></header>
        <div class="profile-grid">
          <section class="card profile-summary">
            <div class="profile-avatar-large">${initials(user.name)}</div>
            <h2>${esc(user.name)}</h2><div class="profile-role">${esc(user.role)}</div><div class="profile-status">В системе</div>
            <button class="primary-btn" data-route="notifications">Открыть уведомления</button>
          </section>
          <div>
            <section class="card"><div class="card-head"><h2>Данные профиля</h2><button class="text-link" data-action="edit-profile">Изменить</button></div><div class="detail-list">
              <div class="detail-row"><span>ФИО</span><b>${esc(user.name)}</b></div><div class="detail-row"><span>Email</span><b>${esc(user.email)}</b></div><div class="detail-row"><span>Роль</span><b>${esc(user.role)}</b></div><div class="detail-row"><span>Подразделение</span><b>${esc(user.department)}</b></div>
            </div></section>
            <div class="stat-grid"><div class="stat"><small>Проверок за месяц</small><strong>38</strong><span class="delta">+6 к маю</span></div><div class="stat"><small>Объектов в работе</small><strong>12</strong><span class="delta">активные</span></div><div class="stat"><small>Рисков разобрано</small><strong>24</strong><span class="delta">за месяц</span></div><div class="stat"><small>Критических</small><strong>5</strong><span class="delta negative">на контроле</span></div></div>
          </div>
        </div>
      </div>`;
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
        state.currentUser = result.user; updateHeaderUser(); showToast("Вход выполнен"); navigate("profile");
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
        state.currentUser = result.user; updateHeaderUser(); showToast("Учётная запись создана"); navigate("profile");
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
    if (route === "login") return renderLogin();
    return renderRegister();
  }

  document.addEventListener("click", async (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) { event.preventDefault(); navigate(routeTarget.dataset.route); return; }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action === "toggle-favorite") {
      event.preventDefault();
      await toggleFavorite(actionTarget);
      return;
    }
    const aiTarget = event.target.closest("[data-ai-event]");
    if (aiTarget) {
      event.preventDefault();
      state.selectedImpactEventId = aiTarget.dataset.aiEvent;
      state.aiImpact = null;
      if (currentRoute() === "ai-analysis") renderAIAnalysis();
      else navigate("ai-analysis");
      return;
    }
    const analyzeTarget = event.target.closest("[data-analyze]");
    if (analyzeTarget) {
      event.preventDefault();
      const name = analyzeTarget.dataset.analyze;
      if (currentRoute() === "dashboard") analyze(name);
      else { state.pendingAnalysis = name; location.hash = "dashboard"; }
      return;
    }
    if (actionTarget?.dataset.action === "logout") {
      state.currentUser = null; updateHeaderUser(); showToast("Вы вышли из системы"); navigate("login");
    } else if (actionTarget?.dataset.action === "edit-profile") {
      showToast("Редактирование профиля будет подключено к backend");
    }
  });
  globalSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = globalSearch.value.trim();
    if (!query) return showToast("Введите название объекта");
    if (currentRoute() === "dashboard") analyze(query);
    else { state.pendingAnalysis = query; location.hash = "dashboard"; }
  });
  window.addEventListener("hashchange", renderRoute);
  updateHeaderUser();
  renderRoute();
})();
