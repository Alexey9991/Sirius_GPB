(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function analysisHistoryRows(items) {
    return items.map((item) => componentHtml("history-row", {
      PROJECT_NAME: esc(item.project_name),
      META: `${dateTime(item.analyzed_at)} · ${esc(item.model_version)}`,
      SUMMARY: esc(item.summary),
      SCORE: item.score,
      CHIP: chip(item.level),
    })).join("");
  }

function riskChangeRows(items) {
    return items.map((item) => {
      const initial = item.previous_level === null;
      return componentHtml("risk-change-row", {
        MARKER_CLASS: palette[item.new_level]?.css || "green",
        PROJECT_NAME: esc(item.project_name),
        META: `${initial ? "Первичная оценка риска" : "Риск изменился"} · ${dateTime(item.changed_at)}`,
        TRANSITION: `${initial ? "Новый" : `${chip(item.previous_level)} <i>→</i>`} ${chip(item.new_level)}`,
        SCORE_CHANGE: item.previous_score === null ? "" : `${item.previous_score} → `,
        NEW_SCORE: item.new_score,
      });
    }).join("");
  }

async function renderHistory() {
    loading();
    try {
      [state.analysisHistory, state.riskChanges] = await Promise.all([
        window.api.getAnalysisHistory(),
        window.api.getRiskChanges(),
      ]);
      const projectsCount = new Set(state.analysisHistory.map((item) => item.project_name)).size;
      const criticalCount = state.analysisHistory.filter((item) => item.level === "RED").length;
      app.innerHTML = pageHtml("history", {
        HISTORY_COUNT: state.analysisHistory.length,
        PROJECTS_COUNT: projectsCount,
        CHANGES_COUNT: state.riskChanges.length,
        CRITICAL_COUNT: criticalCount,
        HISTORY_ROWS: analysisHistoryRows(state.analysisHistory) || emptyHtml("История пуста. Запустите первый анализ на главной странице."),
        RISK_CHANGE_ROWS: riskChangeRows(state.riskChanges) || emptyHtml("Изменений риска пока не зафиксировано."),
      });
    } catch (error) { renderError(error); }
  }

  ctx.analysisHistoryRows = analysisHistoryRows;
  ctx.renderHistory = renderHistory;
  ctx.registerPage("history", renderHistory);
})();
