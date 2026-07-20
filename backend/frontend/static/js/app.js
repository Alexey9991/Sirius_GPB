(function () {
  const app = document.getElementById("app");
  const globalSearch = document.getElementById("globalSearch");
  const notificationOverlay = document.getElementById("notificationOverlay");
  const initialRoute = document.body.dataset.initialRoute || "dashboard";
  const defaultUser = null;
  const defaultSubscriptions = { locations: [], developers: [], projects: [] };
  const state = { overview: null, analysis: null, streamInsight: null, pendingInsightQuestion: "", selectedImpactEventId: "", alerts: [], projects: [], events: [], notifications: [], notificationsInitialized: false, analysisHistory: [], riskChanges: [], pendingAnalysis: "", pendingProjectContext: null, searchQuery: "", projectSort: "risk-desc", subscriptions: readUserSubscriptions(), backendSubscriptions: [], backendSubscriptionsOwnerId: null, pushEnabled: localStorage.getItem("risk-intelligence:push-enabled") === "true" && "Notification" in window && Notification.permission === "granted", currentUser: null };
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

  function componentHtml(name, slots = {}) {
    return window.renderTemplate(`component-${name}`, slots);
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
    const profileButton = document.getElementById("profileButton");
    if (profileButton) profileButton.dataset.route = user ? "profile" : "login";
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("visible"), 20000);
  }

  function loading() { app.innerHTML = componentHtml("loader"); }
  function renderError(error) { app.innerHTML = componentHtml("error", { MESSAGE: esc(error.message) }); }
  function emptyHtml(message, className = "") { return componentHtml("empty", { MESSAGE: esc(message), CLASS_NAME: esc(className) }); }
  function chip(level) { const p = palette[level] || palette.GREEN; return componentHtml("chip", { CSS_CLASS: p.css, LABEL: p.label }); }
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
    const previousUserId = String(state.currentUser?.id || "");
    const nextUserId = String(user?.id || "");
    state.currentUser = user;
    state.backendSubscriptions = Array.isArray(user?.subscriptions) ? [...user.subscriptions] : [];
    state.backendSubscriptionsOwnerId = null;
    if (previousUserId !== nextUserId) {
      state.notifications = [];
      state.notificationsInitialized = false;
    }
    localStorage.setItem("risk-intelligence:active-user-id", user?.id || "guest");
    state.subscriptions = readUserSubscriptions(user?.id);
    updateHeaderUser();
  }

  function hasBackendSubscription(subType, itemId) {
    const normalizedType = String(subType || "").toLowerCase();
    const normalizedId = String(itemId ?? "");
    if (!normalizedId) return false;
    return state.backendSubscriptions.some((subscription) => (
      String(subscription.sub_type || "").toLowerCase() === normalizedType
      && String(subscription.item_id ?? "") === normalizedId
    ));
  }

  function updateNamedSubscription(subType, name, active) {
    const collection = subType === "developer" ? "developers" : subType === "city" ? "locations" : "projects";
    const values = new Set(state.subscriptions[collection] || []);
    if (active) values.add(name);
    else values.delete(name);
    state.subscriptions[collection] = [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, "ru"));
    saveUserSubscriptions();
  }

  async function toggleBackendSubscription(subType, itemId, name, button) {
    if (!state.currentUser) {
      showToast("Войдите в аккаунт, чтобы управлять подписками");
      navigate("login");
      return false;
    }
    if (!itemId) {
      showToast("Не удалось определить объект подписки");
      return false;
    }

    const active = hasBackendSubscription(subType, itemId);
    if (button) {
      button.disabled = true;
      button.textContent = active ? "Удаляем…" : "Подписываем…";
    }
    try {
      if (active) {
        await window.api.unsubscribe(subType, itemId);
        state.backendSubscriptions = state.backendSubscriptions.filter((subscription) => !(
          String(subscription.sub_type || "").toLowerCase() === String(subType).toLowerCase()
          && String(subscription.item_id ?? "") === String(itemId)
        ));
      } else {
        const subscription = await window.api.subscribe(subType, itemId);
        if (!subscription || typeof subscription !== "object") {
          throw new Error("Сервер не вернул созданную подписку");
        }
        state.backendSubscriptions.push(subscription);
      }

      if (state.currentUser) state.currentUser.subscriptions = [...state.backendSubscriptions];
      updateNamedSubscription(subType, name, !active);
      ctx.updateNotificationBadge?.();
      if (currentRoute() === "dashboard" && state.analysis) {
        document.getElementById("resultPanel").innerHTML = ctx.analysisPanel?.(state.analysis) || "";
      }
      showToast(active ? `${name} удалён из подписок` : `Подписка на ${name} включена`);
      return true;
    } catch (error) {
      showToast(`Не удалось обновить подписку: ${error.message}`);
      if (button) {
        button.disabled = false;
        button.textContent = active ? button.dataset.subscribedLabel : button.dataset.subscribeLabel;
      }
      return false;
    }
  }

  async function refreshSession() {
    try {
      const user = await window.api.whoAmI();
      setCurrentUser(user);
      return user;
    } catch (error) {
      if (window.api.isAuthError(error)) {
        setCurrentUser(null);
        return null;
      }
      setCurrentUser(null);
      showToast(`Не удалось проверить сессию: ${error.message}`);
      return null;
    }
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

  const pageRenderers = {};

  function registerPage(route, renderer) {
    pageRenderers[route] = renderer;
  }

  async function renderRoute() {
    const route = currentRoute();
    window.scrollTo(0, 0);
    setActiveNav(route);
    await refreshSession();
    const renderer = pageRenderers[route] || pageRenderers.dashboard;
    if (!renderer) return renderError(new Error(`Страница не зарегистрирована: ${route}`));
    return renderer();
  }

  const ctx = {
    app, globalSearch, notificationOverlay, initialRoute, defaultUser, defaultSubscriptions, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, setActiveNav, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, subscriptionKey, readUserSubscriptions, saveUserSubscriptions, setCurrentUser, refreshSession,
    uniqueValues, levelRank, projectByName, projectAnalyzeAttrs, hasBackendSubscription, toggleBackendSubscription, registerPage, renderRoute,
  };

  window.RiskDesk = ctx;

  document.addEventListener("click", async (event) => {
    const notificationButton = event.target.closest(".notification-button");
    const notificationPopover = event.target.closest(".notification-popover");
    if (notificationOverlay && !notificationOverlay.hidden && !notificationButton && !notificationPopover) {
      ctx.closeNotificationOverlay?.();
    }
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) { event.preventDefault(); ctx.closeNotificationOverlay?.(); navigate(routeTarget.dataset.route); return; }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget?.dataset.action === "toggle-notifications") {
      event.preventDefault();
      await ctx.toggleNotificationOverlay?.();
      return;
    }
    if (actionTarget?.dataset.action === "close-notifications") {
      event.preventDefault();
      ctx.closeNotificationOverlay?.();
      return;
    }
    if (actionTarget?.dataset.action === "mark-overlay-notifications-read") {
      event.preventDefault();
      await ctx.markOverlayNotificationsRead?.();
      return;
    }
    if (actionTarget?.dataset.action === "clear-overlay-notifications") {
      event.preventDefault();
      await ctx.clearOverlayNotifications?.();
      return;
    }
    if (actionTarget?.dataset.action === "toggle-backend-subscription") {
      event.preventDefault();
      await toggleBackendSubscription(
        actionTarget.dataset.subscriptionType,
        actionTarget.dataset.subscriptionId,
        actionTarget.dataset.subscriptionName,
        actionTarget,
      );
      return;
    }
    const aiTarget = event.target.closest("[data-ai-event]");
    if (aiTarget) {
      event.preventDefault();
      const eventItem = state.events.find((item) => item.id === aiTarget.dataset.aiEvent);
      state.pendingInsightQuestion = eventItem ? `Разбери сигнал по потоку: ${eventItem.title}. Проект: ${eventItem.project_name}.` : "Какие риски связаны с выбранной новостью?";
      state.streamInsight = null;
      ctx.closeNotificationOverlay?.();
      if (currentRoute() === "ai-analysis") renderRoute();
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
      ctx.closeNotificationOverlay?.();
      if (currentRoute() === "dashboard") ctx.analyze?.(name, context);
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
      actionTarget.disabled = true;
      try {
        await window.api.logout();
      } catch (error) {
        if (!window.api.isAuthError(error)) {
          actionTarget.disabled = false;
          showToast(`Не удалось выйти: ${error.message}`);
          return;
        }
      }
      setCurrentUser(null);
      state.backendSubscriptionsOwnerId = null;
      state.analysisHistory = [];
      state.riskChanges = [];
      showToast("Вы вышли из системы");
      navigate("login");
    } else if (actionTarget?.dataset.action === "edit-profile") {
      ctx.openProfileEditor?.();
    } else if (actionTarget?.dataset.action === "close-profile-editor") {
      ctx.closeProfileEditor?.();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") ctx.closeNotificationOverlay?.();
  });
  globalSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = globalSearch.value.trim();
    if (!query) return showToast("Введите запрос для поиска по сайту");
    state.searchQuery = query;
    sessionStorage.setItem(pendingKeys.searchQuery, query);
    if (currentRoute() === "search") renderRoute();
    else navigate("search");
  });
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("DOMContentLoaded", () => {
    updateHeaderUser();
    ctx.updateNotificationBadge?.();
    renderRoute();
  });
})();
