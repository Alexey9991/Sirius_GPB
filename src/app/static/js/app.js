// This file is watched by src/main.py and reloads automatically after saving.
(function () {
  const app = document.getElementById("app");
  const globalSearch = document.getElementById("globalSearch");
  const defaultUser = { id: "u-001", name: "Анна Иванова", email: "a.ivanova@gpb.ru", role: "Аналитик рисков", department: "Проектное финансирование" };
  const state = { overview: null, analysis: null, alerts: [], projects: [], events: [], notifications: [], pendingAnalysis: "", currentUser: defaultUser };
  const routeTitles = {
    dashboard: "Проверить ЖК", alerts: "Риски", projects: "Проекты", monitoring: "Мониторинг",
    notifications: "Уведомления", profile: "Профиль аналитика", login: "Вход", register: "Регистрация",
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
        <div class="card-head"><h2>События</h2><button class="text-link" data-route="monitoring">Вся лента</button></div>
        ${(data.events || []).slice(0, 3).map((e) => `
          <article class="event-mini"><time>${shortTime(e.published_at)}</time><b>${esc(e.title)}</b><a href="${esc(e.source_url || "#")}">${esc(e.source)}</a></article>`).join("") || '<div class="object-meta">Связанных публикаций не найдено</div>'}
      </section>`;
  }

  async function renderDashboard(pendingAnalysis = "") {
    loading();
    try {
      state.overview ||= await window.api.getOverview();
      const data = state.overview;
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
                ${data.favorites.slice(0, 3).map((p) => `<button class="sample" data-analyze="${esc(p.name)}">${esc(p.name)}</button>`).join("")}
              </div>
            </section>
            <section class="card">
              <div class="card-head"><h2>Избранные объекты</h2><button class="text-link" data-route="projects">Все объекты</button></div>
              <div class="object-list">${projectRows(data.favorites)}</div>
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
        </div><time class="row-time">Сегодня, ${shortTime(item.published_at)}</time>
      </article>`).join("");
  }

  async function renderAlerts() {
    loading();
    try {
      state.alerts = await window.api.getAlerts("ALL");
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Контроль рисков</span><h1>Риски</h1><p>События, которые требуют внимания аналитика.</p></div><button class="primary-btn" data-route="monitoring">Открыть мониторинг</button></header>
          <div class="stat-grid">
            <div class="stat"><small>Критические</small><strong>${state.alerts.filter((x) => x.level === "RED").length}</strong><span class="delta negative">+2 за сутки</span></div>
            <div class="stat"><small>Средние</small><strong>${state.alerts.filter((x) => x.level === "YELLOW").length}</strong><span class="delta">без изменений</span></div>
            <div class="stat"><small>Новые</small><strong>${state.alerts.length}</strong><span class="delta negative">за сегодня</span></div>
            <div class="stat"><small>Требуют проверки</small><strong>${state.alerts.filter((x) => x.level !== "GREEN").length}</strong><span class="delta negative">критические и средние</span></div>
          </div>
          <section class="card">
            <div class="toolbar"><input id="alertSearch" class="input" placeholder="Поиск по объектам и событиям"><select id="alertLevel" class="select"><option value="ALL">Все уровни</option><option value="RED">Критические</option><option value="YELLOW">Средние</option></select></div>
            <div id="alertList" class="data-list">${alertRows(state.alerts)}</div>
          </section>
        </div>`;
      const update = () => {
        const q = document.getElementById("alertSearch").value.toLowerCase();
        const level = document.getElementById("alertLevel").value;
        const filtered = state.alerts.filter((x) => (level === "ALL" || x.level === level) && `${x.title} ${x.project_name}`.toLowerCase().includes(q));
        document.getElementById("alertList").innerHTML = alertRows(filtered) || '<div class="empty-state">Риски не найдены</div>';
      };
      document.getElementById("alertSearch").addEventListener("input", update);
      document.getElementById("alertLevel").addEventListener("change", update);
    } catch (error) { renderError(error); }
  }

  function projectTable(items) {
    return items.map((p) => `<tr data-analyze="${esc(p.name)}"><td>${esc(p.name)}</td><td>${esc(p.city)}</td><td>${esc(p.developer)}</td><td>${chip(p.level)}</td><td><b>${p.score}</b>/100</td><td class="progress">${p.completion}%<div class="progress-line"><span style="width:${p.completion}%"></span></div></td><td>${shortTime(p.updated_at)}</td></tr>`).join("");
  }

  async function renderProjects() {
    loading();
    try {
      state.projects = await window.api.getProjects();
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Проектное финансирование</span><h1>Портфель проектов</h1><p>Единый список объектов и их текущий риск-профиль.</p></div><button class="primary-btn" data-route="dashboard">Проверить новый ЖК</button></header>
          <section class="card">
            <div class="toolbar"><input id="projectSearch" class="input" placeholder="Название, город или застройщик"><select id="projectLevel" class="select"><option value="ALL">Все риски</option><option value="RED">Критические</option><option value="YELLOW">Средние</option><option value="GREEN">Низкие</option></select></div>
            <div class="table-wrap"><table><thead><tr><th>Объект</th><th>Город</th><th>Застройщик</th><th>Риск</th><th>Индекс</th><th>Готовность</th><th>Обновлено</th></tr></thead><tbody id="projectBody">${projectTable(state.projects)}</tbody></table></div>
          </section>
        </div>`;
      const update = async () => {
        const q = document.getElementById("projectSearch").value;
        const level = document.getElementById("projectLevel").value;
        const items = await window.api.getProjects(q, level);
        document.getElementById("projectBody").innerHTML = projectTable(items);
      };
      document.getElementById("projectSearch").addEventListener("input", update);
      document.getElementById("projectLevel").addEventListener("change", update);
    } catch (error) { renderError(error); }
  }

  function feedRows(items) {
    return items.map((item) => `<article class="feed-row"><span class="severity ${item.level === "YELLOW" ? "yellow" : item.level === "GREEN" ? "" : ""}" style="${item.level === "GREEN" ? "background:#149447" : ""}"></span><div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="row-meta"><span>${esc(item.project_name)}</span><span>${esc(item.category)}</span><span>${esc(item.source)}</span></div></div><time class="row-time">${shortTime(item.published_at)}</time></article>`).join("");
  }

  async function renderMonitoring() {
    loading();
    try {
      state.events = await window.api.getEvents();
      app.innerHTML = `
        <div class="page-enter">
          <header class="page-heading"><div><span class="eyebrow">Поток данных</span><h1>Мониторинг источников</h1><p>Новости, жалобы и официальные публикации в реальном времени.</p></div><button class="secondary-btn" id="refreshFeed">Обновить ленту</button></header>
          <div class="stat-grid">
            <div class="stat"><small>Публикаций сегодня</small><strong>1 847</strong><span class="delta">+12% к вчера</span></div>
            <div class="stat"><small>Источников онлайн</small><strong>126</strong><span class="delta">99,2% доступны</span></div>
            <div class="stat"><small>Негативных</small><strong>143</strong><span class="delta negative">7,7% потока</span></div>
            <div class="stat"><small>Последнее обновление</small><strong id="lastUpdate">сейчас</strong><span class="delta">автообновление</span></div>
          </div>
          <div class="monitor-grid">
            <section class="card"><div class="card-head"><h2>Лента событий</h2><span class="online">● LIVE</span></div><div id="feed" class="data-list">${feedRows(state.events)}</div></section>
            <aside><section class="card"><div class="card-head"><h2>Источники</h2></div><div class="source-list">
              ${[["Официальные реестры", "24 канала"], ["Деловые СМИ", "48 изданий"], ["Региональные новости", "31 источник"], ["Отзывы и жалобы", "23 площадки"]].map(([name, count]) => `<div class="source-row"><span><b>${name}</b><small>${count}</small></span><span class="online">● онлайн</span></div>`).join("")}
            </div></section></aside>
          </div>
        </div>`;
      document.getElementById("refreshFeed").addEventListener("click", async () => {
        state.events = await window.api.getEvents();
        document.getElementById("feed").innerHTML = feedRows(state.events);
        document.getElementById("lastUpdate").textContent = "сейчас";
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
                  <button class="secondary-btn" data-route="alerts">Открыть все риски</button>
                  <button class="secondary-btn" data-route="monitoring">Перейти к мониторингу</button>
                </div>
              </section>
              <section class="card"><div class="card-head"><h2>Каналы</h2></div><div class="detail-list"><div class="detail-row"><span>В приложении</span><b>Включены</b></div><div class="detail-row"><span>Email-сводка</span><b>Ежедневно</b></div></div></section>
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
    setActiveNav(route);
    if (route === "dashboard") {
      const pending = state.pendingAnalysis;
      state.pendingAnalysis = "";
      return renderDashboard(pending);
    }
    if (route === "alerts") return renderAlerts();
    if (route === "projects") return renderProjects();
    if (route === "monitoring") return renderMonitoring();
    if (route === "notifications") return renderNotifications();
    if (route === "profile") return renderProfile();
    if (route === "login") return renderLogin();
    return renderRegister();
  }

  document.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) { event.preventDefault(); navigate(routeTarget.dataset.route); return; }
    const analyzeTarget = event.target.closest("[data-analyze]");
    if (analyzeTarget) {
      event.preventDefault();
      const name = analyzeTarget.dataset.analyze;
      if (currentRoute() === "dashboard") analyze(name);
      else { state.pendingAnalysis = name; location.hash = "dashboard"; }
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
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
