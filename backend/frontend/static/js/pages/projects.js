(function () {
  const ctx = window.RiskDesk;
  const {
    app, state, esc, currentRoute, pageHtml, componentHtml, showToast,
    loading, renderError, emptyHtml, chip, dateTime, levelRank, projectDetailAttrs,
  } = ctx;

  const PROJECT_LIMIT_STEP = 30;
  let projectScrollHandler = null;
  let projectSearchTimer = null;
  let projectLimit = PROJECT_LIMIT_STEP;
  let projectAutoPaused = false;
  let projectLoading = false;

  function sortProjects(items) {
    const sorted = [...items];
    const direction = state.projectSort.endsWith("-asc") ? 1 : -1;
    if (state.projectSort.startsWith("city")) {
      return sorted.sort((a, b) => direction * a.city.localeCompare(b.city, "ru") || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("name")) {
      return sorted.sort((a, b) => direction * a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("developer")) {
      return sorted.sort((a, b) => direction * a.developer.localeCompare(b.developer, "ru") || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("risk")) {
      return sorted.sort((a, b) => direction * (levelRank(a.level) - levelRank(b.level)) || b.score - a.score);
    }
    if (state.projectSort.startsWith("score")) {
      return sorted.sort((a, b) => direction * (a.score - b.score) || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("updated")) {
      return sorted.sort((a, b) => direction * (new Date(a.created_at || a.updated_at) - new Date(b.created_at || b.updated_at)) || a.name.localeCompare(b.name, "ru"));
    }
    return sorted.sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.score - a.score || a.name.localeCompare(b.name, "ru"));
  }

  function nextProjectSort(field) {
    const currentField = state.projectSort.split("-")[0];
    const currentDirection = state.projectSort.endsWith("-asc") ? "asc" : "desc";
    const defaultDirection = ["name", "city", "developer"].includes(field) ? "asc" : "desc";
    const nextDirection = currentField === field ? (currentDirection === "desc" ? "asc" : "desc") : defaultDirection;
    state.projectSort = `${field}-${nextDirection}`;
  }

  function projectTable(items) {
    return sortProjects(items).map((p) => componentHtml("project-table-row", {
      DETAIL_ATTRS: projectDetailAttrs(p),
      NAME: esc(p.name),
      CITY: esc(p.city),
      DEVELOPER: esc(p.developer),
      CHIP: chip(p.level),
      SCORE: p.score,
      UPDATED: dateTime(p.created_at || p.updated_at),
    })).join("");
  }

  function readProjectLimitFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = Number(params.get("limit"));
    if (!Number.isFinite(raw) || raw <= 0) return PROJECT_LIMIT_STEP;
    return Math.max(PROJECT_LIMIT_STEP, Math.ceil(raw / PROJECT_LIMIT_STEP) * PROJECT_LIMIT_STEP);
  }

  function syncProjectLimitToUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("limit", String(projectLimit));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function projectControls() {
    return {
      search: document.getElementById("projectSearch"),
      level: document.getElementById("projectLevel"),
      sort: document.getElementById("projectSort"),
      body: document.getElementById("projectBody"),
      loadMoreWrap: document.querySelector(".project-load-more"),
      loadMoreButton: document.getElementById("loadMoreProjects"),
      loadStatus: document.getElementById("projectLoadStatus"),
    };
  }

  function setLoadMoreState(visible, busy = false) {
    const { loadMoreWrap, loadMoreButton, loadStatus } = projectControls();
    if (!loadMoreWrap || !loadMoreButton) return;
    loadMoreWrap.hidden = !visible;
    loadMoreButton.disabled = busy;
    loadMoreButton.textContent = busy ? "Загружаем…" : "Загрузить ещё";
    if (visible && loadStatus) loadStatus.hidden = true;
  }

  function setScrollLoadingState(visible) {
    const { loadStatus, loadMoreWrap } = projectControls();
    if (!loadStatus) return;
    loadStatus.hidden = !visible;
    if (visible && loadMoreWrap) loadMoreWrap.hidden = true;
  }

  function renderProjectRows() {
    const { body } = projectControls();
    if (!body) return;
    body.innerHTML = projectTable(state.projects || []) || emptyHtml("Объекты по заданным условиям не найдены.");
  }

  function currentProjectQuery() {
    return document.getElementById("projectSearch")?.value.trim() || "";
  }

  function currentProjectLevel() {
    return document.getElementById("projectLevel")?.value || "ALL";
  }

  async function fetchProjects({ reset = false, fromButton = false } = {}) {
    if (projectLoading) return;
    projectLoading = true;
    const showScrollLoader = !reset && !fromButton && !projectAutoPaused;
    setScrollLoadingState(showScrollLoader);
    if (fromButton || projectAutoPaused) setLoadMoreState(true, true);

    const previousLength = reset ? 0 : (state.projects || []).length;
    try {
      state.projects = await window.api.getProjects(currentProjectQuery(), currentProjectLevel(), projectLimit, { force: true });
      renderProjectRows();

      const hasNewRows = reset || state.projects.length > previousLength;
      projectAutoPaused = !reset && !hasNewRows;
      setLoadMoreState(projectAutoPaused, false);
    } catch (error) {
      if (reset) renderError(error);
      else {
        projectAutoPaused = true;
        setLoadMoreState(true, false);
        showToast(error.message || "Не удалось загрузить следующую порцию");
      }
    } finally {
      setScrollLoadingState(false);
      projectLoading = false;
    }
  }

  function increaseProjectLimitAndLoad(source) {
    projectLimit += PROJECT_LIMIT_STEP;
    syncProjectLimitToUrl();
    return fetchProjects({ fromButton: source === "button" });
  }

  function isProjectPageBottom() {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 32;
  }

  function attachProjectScroll() {
    if (projectScrollHandler) window.removeEventListener("scroll", projectScrollHandler);
    projectScrollHandler = () => {
      if (currentRoute() !== "projects" || projectLoading || projectAutoPaused || !isProjectPageBottom()) return;
      increaseProjectLimitAndLoad("scroll");
    };
    window.addEventListener("scroll", projectScrollHandler, { passive: true });
  }

  function resetProjectLimit() {
    projectLimit = PROJECT_LIMIT_STEP;
    projectAutoPaused = false;
    syncProjectLimitToUrl();
    setLoadMoreState(false);
    setScrollLoadingState(false);
  }

  async function renderProjects() {
    loading();
    try {
      projectLimit = readProjectLimitFromUrl();
      syncProjectLimitToUrl();
      state.projects = await window.api.getProjects("", "ALL", projectLimit, { force: true });
      app.innerHTML = pageHtml("projects", { PROJECT_ROWS: projectTable(state.projects) });

      const { search, level, sort, loadMoreButton } = projectControls();
      sort.value = state.projectSort;

      const refreshFromControls = () => {
        state.projectSort = sort.value;
        renderProjectRows();
      };

      const resetAndFetch = () => {
        resetProjectLimit();
        fetchProjects({ reset: true });
      };

      search.addEventListener("input", () => {
        clearTimeout(projectSearchTimer);
        projectSearchTimer = setTimeout(resetAndFetch, 250);
      });
      level.addEventListener("change", resetAndFetch);
      sort.addEventListener("change", refreshFromControls);
      loadMoreButton.addEventListener("click", () => increaseProjectLimitAndLoad("button"));
      document.querySelectorAll("[data-sort-field]").forEach((button) => button.addEventListener("click", () => {
        nextProjectSort(button.dataset.sortField);
        sort.value = state.projectSort;
        refreshFromControls();
      }));

      setLoadMoreState(false);
      setScrollLoadingState(false);
      attachProjectScroll();
    } catch (error) {
      renderError(error);
    }
  }

  ctx.renderProjects = renderProjects;
  ctx.registerPage("projects", renderProjects);
})();
