(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

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
      if (!state.searchQuery) {
        state.searchQuery = readPendingValue(pendingKeys.searchQuery);
        if (state.searchQuery) globalSearch.value = state.searchQuery;
      }
      const query = state.searchQuery.trim();
      const result = query
        ? await window.api.searchSite(query, 30)
        : { projects: [], news: [], signals: [] };
      const projectMatches = result.projects;
      const newsMatches = result.news;
      const signalMatches = result.signals;
      state.events = [...signalMatches, ...newsMatches];
      app.innerHTML = pageHtml("search", {
        QUERY: esc(query),
        PROJECT_COUNT: projectMatches.length,
        EVENT_COUNT: newsMatches.length,
        SIGNAL_COUNT: signalMatches.length,
        SEARCH_SECTIONS: `
          ${searchCards("Объекты", projectMatches, "Объекты по запросу не найдены", (project) => componentHtml("search-result-row", { ATTRS: projectAnalyzeAttrs(project), TITLE: esc(project.name), META: `${esc(project.city)} · ${esc(project.developer)} · индекс ${project.score}/100`, CHIP: chip(project.level) }))}
          ${searchCards("Новости", newsMatches, "Новости по запросу не найдены", (item) => componentHtml("search-result-row", { ATTRS: `data-ai-event="${esc(item.id)}"`, TITLE: esc(item.title), META: `${esc(item.source)} · ${dateTime(item.published_at)}`, CHIP: chip(item.level) }))}
          ${searchCards("Импакт-сигналы", signalMatches, "Импакт-сигналы по запросу не найдены", (item) => componentHtml("search-result-row", { ATTRS: `data-ai-event="${esc(item.id)}"`, TITLE: esc(item.title), META: `${esc(item.project_name)} · ${esc(item.category)} · ${esc(item.source)}`, CHIP: chip(item.level) }))}
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
