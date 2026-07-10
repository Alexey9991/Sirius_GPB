(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

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
    if (state.projectSort.startsWith("completion")) {
      return sorted.sort((a, b) => direction * (a.completion - b.completion) || a.name.localeCompare(b.name, "ru"));
    }
    if (state.projectSort.startsWith("updated")) {
      return sorted.sort((a, b) => direction * (new Date(a.updated_at) - new Date(b.updated_at)) || a.name.localeCompare(b.name, "ru"));
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
      ANALYZE_ATTRS: projectAnalyzeAttrs(p),
      NAME: esc(p.name),
      CITY: esc(p.city),
      DEVELOPER: esc(p.developer),
      CHIP: chip(p.level),
      SCORE: p.score,
      COMPLETION: p.completion,
      UPDATED: shortTime(p.updated_at),
    })).join("");
  }

async function renderProjects() {
    loading();
    try {
      state.projects = await window.api.getProjects();
      app.innerHTML = pageHtml("projects", { PROJECT_ROWS: projectTable(state.projects) });
      const update = () => {
        const q = document.getElementById("projectSearch").value.toLowerCase();
        const level = document.getElementById("projectLevel").value;
        state.projectSort = document.getElementById("projectSort").value;
        const items = state.projects.filter((project) => (level === "ALL" || project.level === level) && (!q || `${project.name} ${project.city} ${project.developer}`.toLowerCase().includes(q)));
        document.getElementById("projectBody").innerHTML = projectTable(items);
      };
      document.getElementById("projectSort").value = state.projectSort;
      document.getElementById("projectSearch").addEventListener("input", update);
      document.getElementById("projectLevel").addEventListener("change", update);
      document.getElementById("projectSort").addEventListener("change", update);
      document.querySelectorAll("[data-sort-field]").forEach((button) => button.addEventListener("click", () => {
        nextProjectSort(button.dataset.sortField);
        document.getElementById("projectSort").value = state.projectSort;
        update();
      }));
    } catch (error) { renderError(error); }
  }

  ctx.renderProjects = renderProjects;
  ctx.registerPage("projects", renderProjects);
})();
