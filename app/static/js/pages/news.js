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

  async function loadSelectedFeed({ force = false } = {}) {
    const table = state.newsTable || "impact_signals";
    state.events = await window.api.getFeed(table, { force, limit: 30 });
    return state.events;
  }

  function updateNewsView() {
    const counts = newsCounts(state.events);
    document.getElementById("newsEventsCount").textContent = state.events.length;
    document.getElementById("newsCriticalCount").textContent = counts.critical;
    document.getElementById("newsMediumCount").textContent = counts.medium;
    filterNewsFeed();
  }

  async function renderNewsFeed() {
    loading();
    try {
      state.newsTable ||= "impact_signals";
      await loadSelectedFeed();
      const counts = newsCounts(state.events);
      app.innerHTML = pageHtml("news", {
        EVENTS_COUNT: state.events.length,
        CRITICAL_COUNT: counts.critical,
        MEDIUM_COUNT: counts.medium,
        FEED_ROWS: feedRows(state.events),
      });
      document.getElementById("newsSearch").addEventListener("input", filterNewsFeed);
      document.getElementById("newsLevel").addEventListener("change", filterNewsFeed);
      const tableSelect = document.getElementById("newsTable");
      tableSelect.value = state.newsTable;
      tableSelect.addEventListener("change", async () => {
        state.newsTable = tableSelect.value;
        tableSelect.disabled = true;
        try {
          await loadSelectedFeed({ force: true });
          updateNewsView();
        } catch (error) {
          showToast(`Не удалось загрузить ${state.newsTable}: ${error.message}`);
        } finally {
          tableSelect.disabled = false;
        }
      });
      document.getElementById("refreshFeed").addEventListener("click", async () => {
        const button = document.getElementById("refreshFeed");
        button.disabled = true;
        try {
          await loadSelectedFeed({ force: true });
          updateNewsView();
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
