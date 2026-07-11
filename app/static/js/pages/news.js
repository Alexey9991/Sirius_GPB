(function () {
  const ctx = window.RiskDesk;
  const {
    app, state, esc, pageHtml, componentHtml, showToast,
    loading, renderError, emptyHtml, chip, shortTime,
  } = ctx;

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
    const filtered = state.events.filter((item) => (
      level === "ALL" || item.level === level
    ) && (!query || `${item.title} ${item.project_name} ${item.summary}`.toLowerCase().includes(query)));
    document.getElementById("feed").innerHTML = feedRows(filtered) || emptyHtml("Новости по заданным условиям не найдены.");
  }

  function newsCounts(items) {
    return {
      critical: items.filter((item) => item.level === "RED").length,
      medium: items.filter((item) => item.level === "YELLOW").length,
    };
  }

  async function renderNewsFeed() {
    loading();
    try {
      state.events = await window.api.getEvents();
      const counts = newsCounts(state.events);
      app.innerHTML = pageHtml("news", {
        EVENTS_COUNT: state.events.length,
        CRITICAL_COUNT: counts.critical,
        MEDIUM_COUNT: counts.medium,
        FEED_ROWS: feedRows(state.events),
      });
      document.getElementById("newsSearch").addEventListener("input", filterNewsFeed);
      document.getElementById("newsLevel").addEventListener("change", filterNewsFeed);
      document.getElementById("refreshFeed").addEventListener("click", async () => {
        const button = document.getElementById("refreshFeed");
        button.disabled = true;
        try {
          state.events = await window.api.getEvents({ force: true });
          const refreshedCounts = newsCounts(state.events);
          document.getElementById("newsEventsCount").textContent = state.events.length;
          document.getElementById("newsCriticalCount").textContent = refreshedCounts.critical;
          document.getElementById("newsMediumCount").textContent = refreshedCounts.medium;
          document.getElementById("feed").innerHTML = feedRows(state.events);
          showToast("Лента обновлена");
        } catch (error) {
          showToast(`Не удалось обновить ленту: ${error.message}`);
        } finally {
          button.disabled = false;
        }
      });
    } catch (error) {
      renderError(error);
    }
  }

  ctx.renderNewsFeed = renderNewsFeed;
  ctx.registerPage("news", renderNewsFeed);
})();
