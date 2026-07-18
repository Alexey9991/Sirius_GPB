(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, hasBackendSubscription, renderRoute,
  } = ctx;

function projectRows(items) {
    return items.map((p) => componentHtml("object-row", {
      ANALYZE_ATTRS: projectAnalyzeAttrs(p),
      INITIALS: esc(p.name.replace("ЖК ", "").split(" ").map((x) => x[0]).join("").slice(0, 2)),
      NAME: esc(p.name),
      META: `${esc(p.city)} · ${esc(p.developer)}`,
      SCORE: p.score,
      CHIP: chip(p.level),
    })).join("");
  }

function readSearchHistory() {
    try {
      const items = JSON.parse(localStorage.getItem(searchHistoryKey) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

function saveSearchHistory(items) {
    localStorage.setItem(searchHistoryKey, JSON.stringify(items.slice(0, 6)));
  }

function rememberSearchHistory(analysis, query) {
    const name = analysis?.project_name || query;
    if (!name) return;
    const item = {
      project_name: name,
      summary: analysis?.summary || "Запрос по новостному потоку",
      score: Number(analysis?.score || 0),
      level: analysis?.level || "GREEN",
      analyzed_at: new Date().toISOString(),
    };
    const next = [item, ...readSearchHistory().filter((entry) => entry.project_name !== name)];
    saveSearchHistory(next);
  }

function searchHistoryRows(items) {
    return items.map((item) => componentHtml("search-history-row", {
      PROJECT_NAME: esc(item.project_name),
      META: `${dateTime(item.analyzed_at)} · ${esc(item.summary || "Запрос по новостному потоку")}`,
      SCORE: Number(item.score || 0),
      CHIP: chip(item.level || "GREEN"),
    })).join("");
  }

function analysisPanel(data) {
    if (!data) return componentHtml("analysis-empty");
    const p = palette[data.level] || palette.GREEN;
    const projectSubscribed = hasBackendSubscription("project", data.project_id);
    const developerSubscribed = hasBackendSubscription("developer", data.developer_id);
    const events = (data.events || []).slice(0, 3).map((event) => componentHtml("event-mini", {
      TIME: shortTime(event.published_at),
      TITLE: esc(event.title),
      URL: esc(event.source_url || "#"),
      SOURCE: esc(event.source),
    })).join("") || emptyHtml("Связанных публикаций не найдено");
    return componentHtml("analysis-panel", {
      CHIP: chip(data.level),
      PROJECT_SUBSCRIBE_CLASS: projectSubscribed ? "secondary-btn" : "primary-btn",
      PROJECT_SUBSCRIBE_LABEL: projectSubscribed ? "Вы подписаны на ЖК" : "Подписаться на ЖК",
      PROJECT_SUBSCRIBE_DISABLED: data.project_id ? "" : "disabled",
      PROJECT_ID: esc(data.project_id || ""),
      PROJECT_NAME: esc(data.project_name),
      DEVELOPER_SUBSCRIBE_CLASS: developerSubscribed ? "secondary-btn" : "primary-btn",
      DEVELOPER_SUBSCRIBE_LABEL: developerSubscribed ? "Вы подписаны на застройщика" : "Подписаться на застройщика",
      DEVELOPER_SUBSCRIBE_DISABLED: data.developer_id ? "" : "disabled",
      DEVELOPER_ID: esc(data.developer_id || ""),
      DEVELOPER_NAME: esc(data.developer_name || "Застройщик не указан"),
      SUMMARY: esc(data.summary),
      RING_COLOR: p.color,
      SCORE: Number(data.score),
      EVENTS: events,
    });
  }

async function renderDashboard(pendingAnalysis = "") {
    if (!pendingAnalysis) {
      const storedAnalysis = readPendingValue(pendingKeys.analysis);
      if (storedAnalysis) {
        pendingAnalysis = storedAnalysis;
        state.pendingProjectContext = readPendingJson(pendingKeys.analysisContext) || {};
      }
    }
    loading();
    try {
      if (!state.analysisHistory.length) state.analysisHistory = await window.api.getAnalysisHistory();
      const searchHistory = readSearchHistory();
      const historyItems = (searchHistory.length ? searchHistory : state.analysisHistory).slice(0, 4);
      app.innerHTML = pageHtml("dashboard", {
        SEARCH_HISTORY_ROWS: searchHistoryRows(historyItems) || emptyHtml("История поиска пока пуста. Запустите первый анализ объекта."),
        ANALYSIS_PANEL: analysisPanel(state.analysis),
      });
      document.getElementById("analysisForm").addEventListener("submit", (event) => {
        event.preventDefault(); analyze(document.getElementById("projectInput").value);
      });
      if (pendingAnalysis) {
        document.getElementById("projectInput").value = pendingAnalysis;
        analyze(pendingAnalysis, state.pendingProjectContext || {});
        state.pendingProjectContext = null;
      }
    } catch (error) { renderError(error); }
  }

async function analyze(projectName, projectContext = {}) {
    const value = String(projectName || "").trim();
    if (!value) return showToast("Введите название жилого комплекса");

    const request = projectContext?.projectId
      ? {
          project_id: projectContext.projectId,
          project_name: value,
          city: projectContext.city || "",
          developer: projectContext.developer || "",
        }
      : value;

    console.log("НА АНАЛИЗ УШЛО:", request);

    const button = document.getElementById("analyzeButton");
    if (button) { button.disabled = true; button.textContent = "Анализируем…"; }
    try {
      state.analysis = await window.api.analyze(request);
      state.analysisHistory = [];
      state.riskChanges = [];
      rememberSearchHistory(state.analysis, value);
      const panel = document.getElementById("resultPanel");
      if (panel) panel.innerHTML = analysisPanel(state.analysis);
      globalSearch.value = value;
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { showToast(`Ошибка анализа: ${error.message}`); }
    finally { if (button) { button.disabled = false; button.textContent = "Анализировать"; } }
  }

  ctx.analyze = analyze;
  ctx.analysisPanel = analysisPanel;
  ctx.renderDashboard = renderDashboard;
  ctx.registerPage("dashboard", renderDashboard);
})();
