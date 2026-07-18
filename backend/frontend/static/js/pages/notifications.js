(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

  function isSubscribed(item) {
    const subscriptions = Array.isArray(state.backendSubscriptions) ? state.backendSubscriptions : [];
    return subscriptions.some((subscription) => {
      const type = String(subscription.type || "").toLowerCase();
      const itemId = String(subscription.item_id ?? "");
      if (["project", "projects", "object", "objects", "жк"].includes(type)) return itemId === String(item.project_id || "");
      if (["developer", "developers", "застройщик"].includes(type)) return itemId === String(item.developer_id || "");
      if (["city", "cities", "location", "locations"].includes(type)) return itemId === String(item.city_id || "");
      return false;
    });
  }

  function scopedNotifications() {
    return state.notifications.filter(isSubscribed);
  }

  function updateNotificationBadge() {
    const unread = scopedNotifications().filter((item) => !item.read).length;
    const counter = document.getElementById("notificationCount");
    const dot = document.querySelector(".notification-button .notification-dot");
    if (counter) counter.textContent = unread ? `${unread} новых` : "Нет новых";
    if (dot) dot.style.display = unread ? "block" : "none";
  }

  async function ensureNotificationsLoaded() {
    if (!state.notificationsInitialized) {
      state.notifications = state.currentUser
        ? (await window.api.getNotifications()).map((item) => ({ ...item, read: false }))
        : [];
      state.notificationsInitialized = true;
    }
    updateNotificationBadge();
  }

  function closeNotificationOverlay() {
    if (!notificationOverlay) return;
    notificationOverlay.hidden = true;
    notificationOverlay.innerHTML = "";
    document.querySelector(".notification-button")?.classList.remove("active");
    document.querySelector(".notification-button")?.setAttribute("aria-expanded", "false");
  }

  function overlayNotificationRows(items) {
    return items.slice(0, 8).map((item) => componentHtml("overlay-notification-item", {
      READ_CLASS: item.read ? "" : "unread",
      EVENT_ID: esc(item.id),
      TITLE: esc(item.title),
      META: `${esc(item.project_name)} · ${esc(item.category)} · ${shortTime(item.published_at)}`,
      CHIP: chip(item.level),
    })).join("");
  }

  async function openNotificationOverlay() {
    if (!notificationOverlay) return;
    await ensureNotificationsLoaded();
    const visibleNotifications = scopedNotifications();
    const unread = visibleNotifications.filter((item) => !item.read).length;
    notificationOverlay.innerHTML = componentHtml("notification-popover", {
      TITLE: unread ? `${unread} новых` : "Всё прочитано",
      ROWS: overlayNotificationRows(visibleNotifications) || emptyHtml("По текущим подпискам уведомлений нет."),
      CLEAR_DISABLED: visibleNotifications.length ? "" : "disabled",
    });
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

  async function deleteAllNotifications() {
    try {
      if (state.currentUser) await window.api.clearAlerts();
      state.notifications = [];
      state.notificationsInitialized = true;
      updateNotificationBadge();
      showToast("Уведомления удалены");
      return true;
    } catch (error) {
      showToast(`Не удалось удалить уведомления: ${error.message}`);
      return false;
    }
  }

  async function clearOverlayNotifications() {
    if (await deleteAllNotifications()) await openNotificationOverlay();
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
    return items.map((item) => componentHtml("notification-row", {
      READ_CLASS: item.read ? "" : "unread",
      SYMBOL: item.level === "RED" ? "!" : item.level === "YELLOW" ? "▲" : "✓",
      TITLE: esc(item.title),
      SUMMARY: esc(item.summary),
      META: `${esc(item.project_name)} · ${esc(item.category)}`,
      TIME: shortTime(item.published_at),
    })).join("");
  }

  async function renderNotifications() {
    loading();
    try {
      await ensureNotificationsLoaded();
      const visibleNotifications = scopedNotifications();
      const unread = visibleNotifications.filter((item) => !item.read).length;
      app.innerHTML = pageHtml("notifications", {
        MARK_ALL_DISABLED: unread ? "" : "disabled",
        CLEAR_ALL_DISABLED: visibleNotifications.length ? "" : "disabled",
        UNREAD_CHIP_CLASS: unread ? "red" : "green",
        UNREAD_LABEL: unread ? `${unread} новых` : "Всё прочитано",
        NOTIFICATION_ROWS: notificationRows(visibleNotifications) || emptyHtml("По текущим подпискам уведомлений нет. Измените подписки в профиле."),
        PUSH_ENABLED_CLASS: state.pushEnabled ? "enabled" : "",
        PUSH_STATUS: state.pushEnabled ? "Включены" : "Выключены",
        PUSH_BUTTON_CLASS: state.pushEnabled ? "secondary-btn" : "primary-btn",
        PUSH_BUTTON_TEXT: state.pushEnabled ? "Выключить push" : "Включить push",
        TEST_PUSH_BUTTON: state.pushEnabled ? componentHtml("test-push-button") : "",
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
      document.getElementById("clearAllNotifications").addEventListener("click", async () => {
        if (await deleteAllNotifications()) renderNotifications();
      });
      document.getElementById("pushToggle").addEventListener("click", togglePushNotifications);
      document.getElementById("testPush")?.addEventListener("click", () => {
        const item = visibleNotifications.find((notification) => notification.level === "RED") || visibleNotifications[0];
        if (item) showBrowserNotification(item);
      });
    } catch (error) { renderError(error); }
  }

  ctx.updateNotificationBadge = updateNotificationBadge;
  ctx.ensureNotificationsLoaded = ensureNotificationsLoaded;
  ctx.closeNotificationOverlay = closeNotificationOverlay;
  ctx.toggleNotificationOverlay = toggleNotificationOverlay;
  ctx.markOverlayNotificationsRead = markOverlayNotificationsRead;
  ctx.clearOverlayNotifications = clearOverlayNotifications;
  ctx.deleteAllNotifications = deleteAllNotifications;
  ctx.showBrowserNotification = showBrowserNotification;
  ctx.renderNotifications = renderNotifications;
  ctx.registerPage("notifications", renderNotifications);
})();
