(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function subscriptionCheckboxes(type, items) {
    const selected = new Set(state.subscriptions[type] || []);
    const selectedItems = items.filter((item) => selected.has(item));
    if (!selectedItems.length) return emptyHtml("Нет выбранных подписок", "subscription-empty");
    return selectedItems.map((item) => componentHtml("subscription-option", {
      TYPE: esc(type),
      VALUE: esc(item),
      LABEL: esc(item),
    })).join("");
  }

function updateSubscription(input) {
    const type = input.dataset.subscription;
    const value = input.value;
    const current = new Set(state.subscriptions[type] || []);
    if (input.checked) current.add(value);
    else current.delete(value);
    state.subscriptions[type] = [...current].sort((a, b) => a.localeCompare(b, "ru"));
    saveUserSubscriptions();
    ctx.updateNotificationBadge?.();
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
    ctx.updateNotificationBadge?.();
    if (button) {
      button.textContent = active ? "Подписаться на ЖК" : "Вы подписаны";
      button.classList.toggle("primary-btn", active);
      button.classList.toggle("secondary-btn", !active);
    }
    showToast(active ? `${projectName} удалён из подписок` : `Подписка на ${projectName} включена`);
  }

async function renderProfile() {
    if (!state.currentUser) return ctx.renderLogin();
    loading();
    const user = state.currentUser;
    try {
      if (!state.projects.length) state.projects = await window.api.getProjects();
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
      ACCOUNT_HISTORY_ROWS: ctx.analysisHistoryRows?.(state.analysisHistory.slice(0, 5)) || emptyHtml("У этого аккаунта пока нет сохранённых анализов."),
    });
    document.querySelectorAll("[data-subscription]").forEach((input) => input.addEventListener("change", () => updateSubscription(input)));
  }

  ctx.toggleProjectSubscription = toggleProjectSubscription;
  ctx.renderProfile = renderProfile;
  ctx.registerPage("profile", renderProfile);
})();
