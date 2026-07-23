(function () {
  const ctx = window.RiskDesk;
  const {
    app, state, esc, currentRoute, pageHtml, componentHtml, showToast,
    loading, renderError, emptyHtml, chip, shortTime,
  } = ctx;

  const NEWS_LIMIT_STEP = 30;
  let newsScrollHandler = null;
  let newsLimit = NEWS_LIMIT_STEP;
  let newsLoading = false;
  let newsAutoPaused = false;

  function safeSourceUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "#") return "#";
    try {
      const url = new URL(raw, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch (_) {
      return "#";
    }
  }

  function feedRows(items) {
    return items.map((item) => componentHtml("feed-row", {
      SEVERITY_CLASS: item.level === "YELLOW" ? "yellow" : "",
      SEVERITY_STYLE: item.level === "GREEN" ? "background:#149447" : "",
      TITLE: esc(item.title),
      URL: esc(safeSourceUrl(item.source_url)),
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

  function readNewsLimitFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = Number(params.get("limit"));
    if (!Number.isFinite(raw) || raw <= 0) return NEWS_LIMIT_STEP;
    return Math.max(NEWS_LIMIT_STEP, Math.ceil(raw / NEWS_LIMIT_STEP) * NEWS_LIMIT_STEP);
  }

  function syncNewsLimitToUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("limit", String(newsLimit));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function setNewsLoadingState(visible) {
    const status = document.getElementById("newsLoadStatus");
    if (status) status.hidden = !visible;
  }

  async function loadSelectedFeed({ force = false } = {}) {
    const table = state.newsTable || "impact_signals";
    state.events = await window.api.getFeed(table, { force, limit: newsLimit });
    newsAutoPaused = state.events.length < newsLimit;
    return state.events;
  }

  function updateNewsView() {
    const counts = newsCounts(state.events);
    document.getElementById("newsEventsCount").textContent = state.events.length;
    document.getElementById("newsCriticalCount").textContent = counts.critical;
    document.getElementById("newsMediumCount").textContent = counts.medium;
    filterNewsFeed();
  }

  function isNewsPageBottom() {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 32;
  }

  async function loadMoreNews() {
    if (newsLoading || newsAutoPaused) return;
    newsLoading = true;
    const previousLimit = newsLimit;
    const previousLength = state.events.length;
    newsLimit += NEWS_LIMIT_STEP;
    syncNewsLimitToUrl();
    setNewsLoadingState(true);
    try {
      await loadSelectedFeed({ force: true });
      updateNewsView();
      newsAutoPaused = state.events.length <= previousLength || state.events.length < newsLimit;
    } catch (error) {
      newsLimit = previousLimit;
      syncNewsLimitToUrl();
      newsAutoPaused = true;
      showToast(`Не удалось загрузить следующую порцию новостей: ${error.message}`);
    } finally {
      setNewsLoadingState(false);
      newsLoading = false;
    }
  }

  function attachNewsScroll() {
    if (newsScrollHandler) window.removeEventListener("scroll", newsScrollHandler);
    newsScrollHandler = () => {
      if (currentRoute() !== "news" || newsLoading || newsAutoPaused || !isNewsPageBottom()) return;
      loadMoreNews();
    };
    window.addEventListener("scroll", newsScrollHandler, { passive: true });
  }

  function resetNewsLimit() {
    newsLimit = NEWS_LIMIT_STEP;
    newsAutoPaused = false;
    syncNewsLimitToUrl();
    setNewsLoadingState(false);
  }

  async function renderNewsFeed() {
    loading();
    try {
      state.newsTable ||= "impact_signals";
      newsLimit = readNewsLimitFromUrl();
      syncNewsLimitToUrl();
      await loadSelectedFeed({ force: true });
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
          resetNewsLimit();
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
          newsAutoPaused = false;
          await loadSelectedFeed({ force: true });
          updateNewsView();
          showToast("Лента обновлена");
        } catch (error) {
          showToast(`Не удалось обновить ленту: ${error.message}`);
        } finally {
          button.disabled = false;
        }
      });
      setNewsLoadingState(false);
      attachNewsScroll();
    } catch (error) {
      renderError(error);
    }
  }

  ctx.renderNewsFeed = renderNewsFeed;
  ctx.registerPage("news", renderNewsFeed);
})();
