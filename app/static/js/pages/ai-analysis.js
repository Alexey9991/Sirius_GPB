(function () {
  const ctx = window.RiskDesk;
  const {
    app, globalSearch, notificationOverlay, state, routeTitles, routePaths, pendingKeys, searchHistoryKey, palette,
    esc, currentRoute, readPendingValue, readPendingJson, pageHtml, componentHtml, navigate, initials, updateHeaderUser, showToast,
    loading, renderError, emptyHtml, chip, shortTime, dateTime, saveUserSubscriptions, setCurrentUser, uniqueValues,
    levelRank, projectByName, projectAnalyzeAttrs, renderRoute,
  } = ctx;

function sourceCards(items) {
    return (items || []).map((event) => componentHtml("source-card", {
      CHIP: chip(event.level),
      TIME: dateTime(event.published_at),
      TITLE: esc(event.title),
      SUMMARY: esc(event.summary || event.category || "Событие из новостного потока"),
      META: `${esc(event.project_name)} · ${esc(event.source)}`,
      URL: esc(event.source_url || "#"),
    })).join("");
  }

function buildStreamInsight(question) {
    const query = String(question || "").trim();
    const scopedEvents = state.events;
    const scopedProjects = state.projects;
    const critical = scopedEvents.filter((event) => event.level === "RED");
    const medium = scopedEvents.filter((event) => event.level === "YELLOW");
    const rankedProjects = [...scopedProjects].sort((a, b) => b.score - a.score);
    const topProject = rankedProjects[0];
    const projectByName = new Map(scopedProjects.map((project) => [project.name, project]));
    const criticalProjects = rankedProjects.filter((project) => project.level === "RED" || project.score >= 70);
    const developerStats = scopedEvents.reduce((acc, event) => {
      const developer = projectByName.get(event.project_name)?.developer || "Не указан";
      acc[developer] = acc[developer] || { total: 0, critical: 0 };
      acc[developer].total += 1;
      if (event.level === "RED") acc[developer].critical += 1;
      return acc;
    }, {});
    const developerHotspot = Object.entries(developerStats)
      .sort((a, b) => b[1].critical - a[1].critical || b[1].total - a[1].total)[0];
    const evidenceEvents = [...scopedEvents]
      .sort((a, b) => levelRank(b.level) - levelRank(a.level) || new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 4);
    const verdict = critical.length
      ? `В потоке есть ${critical.length} критических сигнала`
      : medium.length
        ? "Поток требует наблюдения, критических сигналов не найдено"
        : "По текущему потоку существенных рисков не видно";
    return {
      query,
      verdict,
      confidence: critical.length ? 91 : medium.length ? 82 : 76,
      lead: topProject
        ? `${topProject.name} сейчас выглядит главным объектом внимания: индекс ${topProject.score}/100, ${topProject.city}, застройщик ${topProject.developer}.`
        : "В текущем потоке пока нет объектов, по которым можно построить приоритет риска.",
      detailed_analysis: topProject
        ? `ИИ анализирует весь доступный новостной поток: ${scopedEvents.length} публикаций по ${scopedProjects.length} объектам. Вопрос аналитика: «${query || "общая оценка потока"}». Наибольшее внимание сейчас требует ${topProject.name}: индекс ${topProject.score}/100, город ${topProject.city}, застройщик ${topProject.developer}.`
        : "В потоке пока нет связанных объектов. Подключите источники или обновите ленту новостей.",
      metrics: [
        { label: "Критические сигналы", value: critical.length, hint: `из ${scopedEvents.length} новостей`, tone: critical.length ? "red" : "green" },
        { label: "Объекты в риске", value: criticalProjects.length, hint: "красный уровень или индекс от 70", tone: criticalProjects.length ? "red" : "green" },
        { label: "Средние сигналы", value: medium.length, hint: "требуют наблюдения", tone: medium.length ? "yellow" : "green" },
      ],
      factors: [
        `${critical.length} красных публикаций из ${scopedEvents.length} новостей в общей ленте.`,
        topProject ? `Максимальный индекс риска у ${topProject.name}: ${topProject.score}/100.` : "",
        developerHotspot ? `${developerHotspot[0]} чаще всего встречается в риск-сигналах: ${developerHotspot[1].total} упоминаний.` : "",
      ].filter(Boolean),
      recommendations: critical.length
        ? [
            topProject ? `Проверить график, юридические события и транши по ${topProject.name}.` : "Открыть карточки критических объектов.",
            "Сверить красные новости с проектной декларацией и жалобами покупателей.",
            developerHotspot ? `Поставить ${developerHotspot[0]} в усиленный мониторинг до снятия красных сигналов.` : "Поставить критические объекты в усиленный мониторинг.",
          ]
        : ["Сохранить наблюдение по подпискам", "Проверять повторяемость сигналов", "Использовать глобальный поиск для детализации"],
      priorities: rankedProjects.slice(0, 3).map((project) => {
        const related = scopedEvents.filter((event) => event.project_name === project.name);
        const mainSignal = related.find((event) => event.level === "RED") || related[0];
        return {
          name: project.name,
          city: project.city,
          developer: project.developer,
          score: project.score,
          level: project.level,
          eventsCount: related.length,
          signal: mainSignal?.title || "Свежих негативных публикаций не найдено",
        };
      }),
      projects: rankedProjects.slice(0, 5),
      events: scopedEvents.slice(0, 5),
      sources: evidenceEvents,
      generated_at: new Date().toISOString(),
    };
  }

function streamInsightResult(data) {
    if (!data) return componentHtml("ai-empty");
    const hasCritical = data.events.some((event) => event.level === "RED");
    const focus = data.query ? `Фокус: ${data.query}` : "Фокус: общая оценка потока";
    const metrics = data.metrics || [];
    const priorities = data.priorities || [];
    const sources = data.sources || data.events || [];
    return componentHtml("ai-report", {
      VERDICT: esc(data.verdict),
      FOCUS: esc(focus),
      CONFIDENCE_CLASS: hasCritical ? "danger" : "stable",
      CONFIDENCE: data.confidence,
      METRICS: metrics.map((item) => componentHtml("ai-metric", {
        TONE: esc(item.tone),
        LABEL: esc(item.label),
        VALUE: esc(item.value),
        HINT: esc(item.hint),
      })).join(""),
      LEAD: esc(data.lead || data.detailed_analysis),
      FACTORS: data.factors.map((item) => componentHtml("list-item", { TEXT: esc(item) })).join(""),
      RECOMMENDATIONS: data.recommendations.map((item) => componentHtml("list-item", { TEXT: esc(item) })).join(""),
      PRIORITIES: priorities.map((project, index) => componentHtml("ai-priority-card", {
        ANALYZE_ATTRS: projectAnalyzeAttrs(project),
        INDEX: index + 1,
        NAME: esc(project.name),
        META: `${esc(project.city)} · ${esc(project.developer)}`,
        SIGNAL: esc(project.signal),
        SCORE: project.score,
        CHIP: chip(project.level),
      })).join("") || emptyHtml("Приоритетные объекты не найдены"),
      SOURCES_COUNT: sources.length,
      SOURCES: sourceCards(sources) || emptyHtml("Источники не найдены"),
      PROJECTS: data.projects.map((project) => componentHtml("mini-result", {
        ATTRS: projectAnalyzeAttrs(project),
        TITLE: esc(project.name),
        META: `${esc(project.city)} · ${esc(project.developer)} · ${project.score}/100`,
      })).join("") || emptyHtml("Объекты не найдены"),
      EVENTS: data.events.map((event) => componentHtml("mini-result", {
        ATTRS: `data-ai-event="${esc(event.id)}"`,
        TITLE: esc(event.title),
        META: `${esc(event.project_name)} · ${esc(event.source)} · ${palette[event.level]?.label || "Риск"}`,
      })).join("") || emptyHtml("Новости не найдены"),
    });
  }

async function askStreamInsight(question) {
    const button = document.getElementById("askAiButton");
    if (button) { button.disabled = true; button.textContent = "ИИ анализирует новости…"; }
    try {
      await new Promise((resolve) => setTimeout(resolve, 220));
      state.streamInsight = buildStreamInsight(question);
      document.getElementById("aiImpactResult").innerHTML = streamInsightResult(state.streamInsight);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Запустить ИИ-анализ"; }
    }
  }

async function renderAIAnalysis() {
    loading();
    try {
      if (!state.events.length) state.events = await window.api.getEvents();
      if (!state.projects.length) state.projects = await window.api.getProjects();
      const suggestions = ["Какие ЖК сейчас требуют внимания?", "Какие риски видны по всем новостям?", "Какие застройщики чаще попадают в негативные новости?"];
      const pending = state.pendingInsightQuestion || readPendingValue(pendingKeys.aiQuestion) || "Какие ЖК сейчас требуют внимания?";
      state.pendingInsightQuestion = "";
      app.innerHTML = pageHtml("ai-analysis", {
        PROJECTS_COUNT: state.projects.length,
        EVENTS_COUNT: state.events.length,
        PENDING_QUESTION: esc(pending),
        SUGGESTIONS: suggestions.map((question) => componentHtml("question-suggestion", { QUESTION: esc(question) })).join(""),
        STREAM_RESULT: streamInsightResult(state.streamInsight),
      });
      document.getElementById("aiQuestionForm").addEventListener("submit", (event) => {
        event.preventDefault();
        askStreamInsight(document.getElementById("aiQuestion").value.trim());
      });
      document.getElementById("aiQuestion").addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          document.getElementById("aiQuestionForm").requestSubmit();
        }
      });
      document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
        document.getElementById("aiQuestion").value = button.dataset.question;
      }));
    } catch (error) { renderError(error); }
  }

  ctx.renderAIAnalysis = renderAIAnalysis;
  ctx.registerPage("ai-analysis", renderAIAnalysis);
})();
