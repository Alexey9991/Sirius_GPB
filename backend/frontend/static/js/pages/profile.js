(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, toggleBackendSubscription, renderRoute,
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

  function subscriptionTarget(type, value) {
    if (type === "projects") {
      const project = state.projects.find((item) => item.name === value);
      return { type: "project", id: project?.id, name: value };
    }
    if (type === "developers") {
      const project = state.projects.find((item) => item.developer === value);
      return { type: "developer", id: project?.developer_id || project?.raw?.developer?.id || project?.raw?.developer_id, name: value };
    }
    const project = state.projects.find((item) => item.city === value);
    return { type: "city", id: project?.city_id || project?.raw?.city?.id || project?.raw?.city_id, name: value };
  }

  async function updateSubscription(input) {
    const type = input.dataset.subscription;
    const value = input.value;
    const target = subscriptionTarget(type, value);
    input.disabled = true;
    const updated = await toggleBackendSubscription(target.type, target.id, target.name);
    if (updated && currentRoute() === "profile") return renderProfile();
    input.disabled = false;
  }

  function backendSubscriptionNames(user, projects) {
    const result = { locations: [], developers: [], projects: [] };
    const subscriptions = Array.isArray(user?.subscriptions) ? user.subscriptions : [];

    subscriptions.forEach((subscription) => {
      const type = String(subscription.type || "").toLowerCase();
      const itemId = String(subscription.item_id ?? subscription.id ?? "");
      const explicitName = subscription.item?.name
        || subscription.project?.name
        || subscription.city?.name
        || subscription.developer?.name
        || subscription.name;

      if (type.includes("city") || type.includes("location") || type.includes("локац") || type.includes("город")) {
        const project = projects.find((item) => String(item.city_id ?? item.raw?.city?.id ?? item.raw?.city_id ?? "") === itemId);
        const name = explicitName || project?.city;
        if (name) result.locations.push(name);
      } else if (type.includes("developer") || type.includes("застрой")) {
        const project = projects.find((item) => String(item.developer_id ?? item.raw?.developer?.id ?? item.raw?.developer_id ?? "") === itemId);
        const name = explicitName || project?.developer;
        if (name) result.developers.push(name);
      } else if (type.includes("project") || type.includes("жк") || type.includes("объект")) {
        const project = projects.find((item) => String(item.id) === itemId);
        const name = explicitName || project?.name;
        if (name) result.projects.push(name);
      }
    });

    return Object.fromEntries(Object.entries(result).map(([key, values]) => [
      key,
      [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru")),
    ]));
  }

  async function renderProfile() {
    if (!state.currentUser) return ctx.renderLogin();
    loading();
    const user = state.currentUser;
    try {
      state.projects = await window.api.getProjects("", "ALL", null, { force: true, all: true });
      if (Array.isArray(user.subscriptions) && state.backendSubscriptionsOwnerId !== user.id) {
        state.subscriptions = backendSubscriptionNames(user, state.projects);
        state.backendSubscriptionsOwnerId = user.id;
        saveUserSubscriptions();
      }
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
      USER_EMAIL: esc(user.email || "Не указан"),
      USER_DEPARTMENT: esc(user.department || "Не указано"),
      EDIT_USER_NAME: esc(user.name),
      EDIT_USER_EMAIL: esc(user.email || ""),
      EDIT_USER_ROLE: esc(user.role || ""),
      EDIT_USER_DEPARTMENT: esc(user.department || ""),
      LOCATION_CHECKBOXES: subscriptionCheckboxes("locations", locations),
      DEVELOPER_CHECKBOXES: subscriptionCheckboxes("developers", developers),
      PROJECT_CHECKBOXES: subscriptionCheckboxes("projects", projectNames),
      ACCOUNT_HISTORY_ROWS: ctx.analysisHistoryRows?.(state.analysisHistory.slice(0, 5)) || emptyHtml("У этого аккаунта пока нет сохранённых анализов."),
    });
    document.querySelectorAll("[data-subscription]").forEach((input) => input.addEventListener("change", () => updateSubscription(input)));
    const editDialog = document.getElementById("profileEditDialog");
    const editForm = document.getElementById("profileEditForm");
    ctx.openProfileEditor = () => editDialog?.showModal();
    ctx.closeProfileEditor = () => editDialog?.close();
    editForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("profileEditError");
      const button = document.getElementById("profileEditSubmit");
      button.disabled = true;
      button.textContent = "Сохраняем…";
      try {
        const result = await window.api.updateProfile({
          username: document.getElementById("profileEditUsername").value.trim(),
          email: document.getElementById("profileEditEmail").value.trim(),
          role: document.getElementById("profileEditRole").value.trim(),
          division: document.getElementById("profileEditDivision").value.trim(),
        });
        setCurrentUser(result.user);
        showToast("Профиль обновлён");
        editDialog.close();
        renderProfile();
      } catch (error) {
        errorBox.textContent = error.message;
        button.disabled = false;
        button.textContent = "Сохранить";
      }
    });
  }

  ctx.renderProfile = renderProfile;
  ctx.registerPage("profile", renderProfile);
})();
