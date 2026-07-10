(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function searchableText(item) {
    return Object.values(item).filter((value) => typeof value === "string" || typeof value === "number").join(" ").toLowerCase();
  }

function searchCards(title, items, empty, renderItem) {
    return componentHtml("search-section", {
      TITLE: esc(title),
      COUNT: items.length,
      ROWS: items.map(renderItem).join("") || emptyHtml(empty),
    });
  }

async function renderSearchResults() {
    loading();
    try {
      if (!state.projects.length) state.projects = await window.api.getProjects();
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.analysisHistory.length) state.analysisHistory = await window.api.getAnalysisHistory();
      if (!state.searchQuery) {
        state.searchQuery = readPendingValue(pendingKeys.searchQuery);
        if (state.searchQuery) globalSearch.value = state.searchQuery;
      }
      const query = state.searchQuery.trim();
      const normalizedQuery = query.toLowerCase();
      const matches = (item) => !normalizedQuery || searchableText(item).includes(normalizedQuery);
      const projectMatches = state.projects.filter(matches);
      const eventMatches = state.events.filter(matches);
      const historyMatches = state.analysisHistory.filter(matches);
      app.innerHTML = pageHtml("search", {
        QUERY: esc(query),
        PROJECT_COUNT: projectMatches.length,
        EVENT_COUNT: eventMatches.length,
        HISTORY_COUNT: historyMatches.length,
        SEARCH_SECTIONS: `
          ${searchCards("Объекты", projectMatches, "Объекты по запросу не найдены", (project) => componentHtml("search-result-row", { ATTRS: projectAnalyzeAttrs(project), TITLE: esc(project.name), META: `${esc(project.city)} · ${esc(project.developer)} · индекс ${project.score}/100`, CHIP: chip(project.level) }))}
          ${searchCards("Новости и сигналы", eventMatches, "Новости по запросу не найдены", (event) => componentHtml("search-result-row", { ATTRS: `data-ai-event="${esc(event.id)}"`, TITLE: esc(event.title), META: `${esc(event.project_name)} · ${esc(event.category)} · ${esc(event.source)}`, CHIP: chip(event.level) }))}
          ${searchCards("История анализов аккаунта", historyMatches, "В истории этого аккаунта пока нет совпадений", (item) => componentHtml("search-result-row", { ATTRS: `data-analyze="${esc(item.project_name)}"`, TITLE: esc(item.project_name), META: `${dateTime(item.analyzed_at)} · ${esc(item.summary)}`, CHIP: chip(item.level) }))}
        `,
      });
      document.getElementById("siteSearchForm").addEventListener("submit", (event) => {
        event.preventDefault();
        state.searchQuery = document.getElementById("siteSearchQuery").value.trim();
        globalSearch.value = state.searchQuery;
        renderSearchResults();
      });
    } catch (error) { renderError(error); }
  }

  ctx.renderSearchResults = renderSearchResults;
  ctx.registerPage("search", renderSearchResults);
})();
