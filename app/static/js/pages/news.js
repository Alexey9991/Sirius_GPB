(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function alertRows(items) {
    return items.map((item) => componentHtml("alert-row", {
      SEVERITY_CLASS: item.level === "YELLOW" ? "yellow" : "",
      TITLE: esc(item.title),
      SUMMARY: esc(item.summary),
      PROJECT_NAME: esc(item.project_name),
      CATEGORY: esc(item.category),
      SOURCE: esc(item.source),
      EVENT_ID: esc(item.id),
      TIME: shortTime(item.published_at),
    })).join("");
  }

function feedRows(items) {
    return items.map((item) => componentHtml("feed-row", {
      SEVERITY_CLASS: item.level === "YELLOW" ? "yellow" : "",
      SEVERITY_STYLE: item.level === "GREEN" ? "background:#149447" : "",
      TITLE: esc(item.title),
      CHIP: chip(item.level),
      SUMMARY: esc(item.summary),
      PROJECT_NAME: esc(item.project_name),
      CATEGORY: esc(item.category),
      SOURCE: esc(item.source),
      EVENT_ID: esc(item.id),
      TIME: shortTime(item.published_at),
    })).join("");
  }

function filterNewsFeed() {
    const query = document.getElementById("newsSearch")?.value.toLowerCase() || "";
    const level = document.getElementById("newsLevel")?.value || "ALL";
    const filtered = state.events.filter((item) => (level === "ALL" || item.level === level) && (!query || `${item.title} ${item.project_name} ${item.summary}`.toLowerCase().includes(query)));
    document.getElementById("feed").innerHTML = feedRows(filtered) || emptyHtml("Новости по заданным условиям не найдены.");
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
        SOURCE_ROWS: [["Официальные реестры", "24 канала"], ["Деловые СМИ", "48 изданий"], ["Региональные новости", "31 источник"], ["Отзывы и жалобы", "23 площадки"]].map(([name, count]) => componentHtml("source-row", { NAME: esc(name), COUNT: esc(count) })).join(""),
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

  ctx.renderNewsFeed = renderNewsFeed;
  ctx.registerPage("news", renderNewsFeed);
})();
