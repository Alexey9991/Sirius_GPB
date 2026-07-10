/**
 * Frontend API adapter for the current backend.
 *
 * The backend exposes generic table endpoints:
 *   GET /api/get/<table>
 *   GET /api/search/<table>?stype=<field>&q=<query>
 *
 * Page components still consume a richer UI contract, so this file maps real
 * backend rows into projects, events, alerts and object analysis objects.
 */
(function () {
  const config = window.APP_CONFIG || {};
  const DEFAULT_LIMIT = 30;
  const storageKeys = {
    analysisHistory: "analysis-history",
    riskChanges: "risk-changes",
    users: "users",
  };
  const cache = {
    projects: null,
    news: null,
    signals: null,
    events: null,
    normalizedProjects: null,
    normalizedProjectsWithEvents: null,
    projectsRequest: null,
    newsRequest: null,
    signalsRequest: null,
    eventsRequest: null,
    normalizedProjectsRequest: null,
    normalizedProjectsWithEventsRequest: null,
    projectsLimit: 0,
    projectsRequestLimit: 0,
    normalizedProjectsLimit: 0,
  };

  function apiBaseUrl() {
    const raw = String(config.baseUrl || "http://localhost:8000").replace(/\/+$/, "");
    return raw.endsWith("/api") ? raw : `${raw}/api`;
  }

  function activeUserId() {
    return localStorage.getItem("risk-intelligence:active-user-id") || "u-001";
  }

  function accountKey(key) {
    return `risk-intelligence:${activeUserId()}:${key}`;
  }

  function readLocal(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clamp(value, min = 0, max = 100) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function decodeHtmlEntities(value) {
    const text = String(value ?? "");
    if (!/[&][a-z0-9#]+;/i.test(text)) return text;
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      return textarea.value;
    }
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function normalizeText(value, fallback = "") {
    return decodeHtmlEntities(value ?? fallback).trim();
  }

  function compactText(value, max = 190) {
    const text = normalizeText(value).replace(/\s+/g, " ");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function normalizeDate(value) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function normalizeLimit(limit = DEFAULT_LIMIT) {
    const number = Number(limit);
    if (!Number.isFinite(number) || number <= 0) return DEFAULT_LIMIT;
    return Math.max(DEFAULT_LIMIT, Math.ceil(number));
  }

  function riskScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (number <= 3) return { 1: 24, 2: 57, 3: 86 }[Math.round(number)] || 0;
    return clamp(number);
  }

  function riskLevelFromScore(score) {
    if (score >= 70) return "RED";
    if (score >= 35) return "YELLOW";
    return "GREEN";
  }

  function tableUrl(table, params = {}) {
    const query = new URLSearchParams(params);
    return `${apiBaseUrl()}/get/${encodeURIComponent(table)}${query.size ? `?${query}` : ""}`;
  }

  function searchUrl(table, params = {}) {
    const query = new URLSearchParams(params);
    return `${apiBaseUrl()}/search/${encodeURIComponent(table)}?${query}`;
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 3000);
    try {
      const headers = { ...(options.headers || {}) };
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const fetchOptions = {
        ...options,
        signal: controller.signal,
      };
      delete fetchOptions.timeoutMs;
      delete fetchOptions.headers;
      if (Object.keys(headers).length) fetchOptions.headers = headers;

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`API ${response.status}: ${detail || response.statusText}`);
      }
      if (response.status === 204) return null;
      return response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Бэкенд не ответил за отведённое время: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getTable(table, limit = DEFAULT_LIMIT) {
    const rows = await request(tableUrl(table, { limit: normalizeLimit(limit) }));
    return Array.isArray(rows) ? rows : [];
  }

  async function searchTable(table, stype, query, limit = DEFAULT_LIMIT) {
    const rows = await request(searchUrl(table, { stype, q: normalizeText(query), limit: normalizeLimit(limit) }));
    return Array.isArray(rows) ? rows : [];
  }

  async function backendProjects(limit = DEFAULT_LIMIT, options = {}) {
    const normalizedLimit = normalizeLimit(limit);
    if (!options.force && cache.projects && cache.projectsLimit >= normalizedLimit) {
      return cache.projects.slice(0, normalizedLimit);
    }
    if (!cache.projectsRequest || cache.projectsRequestLimit !== normalizedLimit || options.force) {
      cache.projectsRequestLimit = normalizedLimit;
      cache.projectsRequest = getTable("projects", normalizedLimit).finally(() => {
        cache.projectsRequest = null;
        cache.projectsRequestLimit = 0;
      });
    }
    cache.projects = await cache.projectsRequest;
    cache.projectsLimit = normalizedLimit;
    cache.normalizedProjects = null;
    cache.normalizedProjectsWithEvents = null;
    cache.normalizedProjectsLimit = 0;
    return cache.projects.slice(0, normalizedLimit);
  }

  async function backendNews() {
    if (!cache.news) {
      cache.newsRequest ||= getTable("news").finally(() => { cache.newsRequest = null; });
      cache.news = await cache.newsRequest;
      cache.events = null;
      cache.normalizedProjectsWithEvents = null;
    }
    return cache.news;
  }

  async function backendSignals() {
    if (!cache.signals) {
      cache.signalsRequest ||= getTable("impact_signals").finally(() => { cache.signalsRequest = null; });
      cache.signals = await cache.signalsRequest;
      cache.events = null;
      cache.normalizedProjectsWithEvents = null;
    }
    return cache.signals;
  }

  function relationName(row, relationKey, fallbackKey) {
    const relation = row?.[relationKey];
    const value = relation && typeof relation === "object" ? relation.name : relation;
    return normalizeText(value || row?.[fallbackKey] || "");
  }

  function projectEventMatch(event, project) {
    if (!event || !project) return false;
    if (event.project_id && project.id && event.project_id === project.id) return true;
    return normalizeText(event.project_name).toLowerCase() === normalizeText(project.name).toLowerCase();
  }

  function normalizeSignal(signal) {
    const news = signal.news || {};
    const project = signal.project || {};
    const city = signal.city || project.city || {};
    const developer = signal.developer || project.developer || {};
    const score = riskScore(signal.risk_level);
    const level = riskLevelFromScore(score);
    const title = normalizeText(news.title || signal.risk_category, "Сигнал риска");
    const sourceUrl = normalizeText(news.parse_news?.url || news.url || "#");
    return {
      id: normalizeText(signal.id || news.id || `${signal.project_id}-${signal.created_at}`),
      news_id: normalizeText(news.id || signal.news_id || ""),
      project_id: normalizeText(signal.project_id || project.id || ""),
      project_name: normalizeText(project.name || signal.project_name, "Объект не указан"),
      city: normalizeText(city.name || signal.city_name),
      developer: normalizeText(developer.name || signal.developer_name),
      title,
      summary: compactText(news.content || title),
      category: normalizeText(signal.risk_category || news.category, "Импакт-сигнал"),
      sentiment: level === "GREEN" ? "NEUTRAL" : "NEGATIVE",
      level,
      score,
      source: normalizeText(news.source, "Backend API"),
      published_at: normalizeDate(news.date || news.created_at || signal.created_at),
      source_url: sourceUrl,
      raw: signal,
    };
  }

  function normalizeNews(news) {
    const signal = Array.isArray(news.impact_signal) ? news.impact_signal[0] : news.impact_signal;
    if (signal) return normalizeSignal({ ...signal, news });
    return {
      id: normalizeText(news.id || news.url || news.created_at),
      news_id: normalizeText(news.id || ""),
      project_id: "",
      project_name: "Не привязано к ЖК",
      city: "",
      developer: "",
      title: normalizeText(news.title, "Новость без заголовка"),
      summary: compactText(news.content || news.category || "Новость из backend API"),
      category: normalizeText(news.category, "Новость"),
      sentiment: "NEUTRAL",
      level: "GREEN",
      score: 0,
      source: normalizeText(news.source, "Backend API"),
      published_at: normalizeDate(news.date || news.created_at),
      source_url: normalizeText(news.parse_news?.url || news.url || "#"),
      raw: news,
    };
  }

  function sortByDateDesc(items) {
    return [...items].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }

  async function normalizedEvents() {
    if (cache.events) return cache.events;
    if (cache.eventsRequest) return cache.eventsRequest;

    cache.eventsRequest = Promise.all([backendSignals(), backendNews()])
      .then(([signals, news]) => {
        const signalEvents = signals.map(normalizeSignal);
        const signalNewsIds = new Set(signalEvents.map((event) => event.news_id).filter(Boolean));
        const standaloneNews = news
          .filter((news) => !signalNewsIds.has(news.id))
          .map(normalizeNews);
        cache.events = sortByDateDesc([...signalEvents, ...standaloneNews]);
        return cache.events;
      })
      .finally(() => { cache.eventsRequest = null; });
    return cache.eventsRequest;
  }

  function projectEmbeddedSignals(project) {
    const signals = Array.isArray(project.impact_signals) ? project.impact_signals : [];
    return signals.map((signal) => {
      const score = riskScore(signal.risk_level);
      return {
        score,
        level: riskLevelFromScore(score),
        category: normalizeText(signal.risk_category, "Импакт-сигнал"),
        project_id: normalizeText(signal.project_id || project.id),
        project_name: normalizeText(project.name),
        published_at: normalizeDate(signal.created_at || project.created_at),
      };
    });
  }

  function estimateCompletion(project) {
    if (project.completion !== undefined) return clamp(project.completion);
    const planned = project.planned_rve_date ? new Date(project.planned_rve_date) : null;
    const created = project.created_at ? new Date(project.created_at) : null;
    if (!planned || Number.isNaN(planned.getTime())) return 0;
    if (planned <= new Date()) return 100;
    const start = created && !Number.isNaN(created.getTime())
      ? created
      : new Date(planned.getFullYear() - 2, planned.getMonth(), planned.getDate());
    const total = planned - start;
    const elapsed = Date.now() - start.getTime();
    return total > 0 ? clamp(Math.round((elapsed / total) * 100)) : 0;
  }

  function latestProjectDate(project, events) {
    const dates = events.map((event) => new Date(event.published_at).getTime()).filter(Number.isFinite);
    if (project.created_at) dates.push(new Date(project.created_at).getTime());
    return new Date(Math.max(...dates, Date.now())).toISOString();
  }

  function normalizeProject(project, events = null) {
    const related = events
      ? events.filter((event) => projectEventMatch(event, project))
      : projectEmbeddedSignals(project);
    const score = related.length ? Math.max(...related.map((event) => event.score || 0)) : 0;
    return {
      id: normalizeText(project.id),
      name: normalizeText(project.name, "Объект без названия"),
      city: relationName(project, "city", "city_name") || "Не указан",
      developer: relationName(project, "developer", "developer_name") || "Не указан",
      score,
      level: riskLevelFromScore(score),
      completion: estimateCompletion(project),
      created_at: normalizeDate(project.created_at),
      updated_at: latestProjectDate(project, related),
      planned_rve_date: project.planned_rve_date || null,
      signals_count: related.length,
      raw: project,
    };
  }

  async function normalizedProjects(options = {}) {
    const limit = normalizeLimit(options.limit);
    const query = normalizeText(options.query);
    const projects = query
      ? await searchTable("projects", "name", query, limit)
      : await backendProjects(limit, { force: options.force });
    const events = options.events || null;
    const withEvents = Array.isArray(events);
    const canUseCache = !query && !options.force;

    if (!withEvents && canUseCache && cache.normalizedProjects && cache.normalizedProjectsLimit >= limit) {
      return cache.normalizedProjects.slice(0, limit);
    }
    if (withEvents && cache.normalizedProjectsWithEvents) return cache.normalizedProjectsWithEvents;
    if (!withEvents && canUseCache && cache.normalizedProjectsRequest) return cache.normalizedProjectsRequest;
    if (withEvents && cache.normalizedProjectsWithEventsRequest) return cache.normalizedProjectsWithEventsRequest;

    const build = Promise.resolve().then(() => {
      const byId = new Map();
      projects.forEach((project) => byId.set(project.id, normalizeProject(project, events)));

      if (withEvents) {
        events.forEach((event) => {
          if (!event.project_id || byId.has(event.project_id) || event.project_name === "Не привязано к ЖК") return;
          byId.set(event.project_id, normalizeProject({
            id: event.project_id,
            name: event.project_name,
            city: { name: event.city },
            developer: { name: event.developer },
            created_at: event.published_at,
          }, events));
        });
      }

      const normalized = [...byId.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
      if (withEvents) cache.normalizedProjectsWithEvents = normalized;
      else if (!query) {
        cache.normalizedProjects = normalized;
        cache.normalizedProjectsLimit = limit;
      }
      return normalized;
    }).finally(() => {
      if (withEvents) cache.normalizedProjectsWithEventsRequest = null;
      else cache.normalizedProjectsRequest = null;
    });

    if (withEvents) cache.normalizedProjectsWithEventsRequest = build;
    else cache.normalizedProjectsRequest = build;
    return build;
  }

  function findProject(projectInput, projects) {
    const name = typeof projectInput === "object"
      ? normalizeText(projectInput.project_name || projectInput.name)
      : normalizeText(projectInput);
    const id = typeof projectInput === "object" ? normalizeText(projectInput.project_id) : "";
    return projects.find((project) => id && project.id === id)
      || projects.find((project) => project.name.toLowerCase() === name.toLowerCase())
      || projects.find((project) => project.name.toLowerCase().includes(name.toLowerCase()))
      || {
        id,
        name,
        city: normalizeText(projectInput?.city, "Не указан"),
        developer: normalizeText(projectInput?.developer, "Не указан"),
        score: 0,
        level: "GREEN",
        completion: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
  }

  function driverRows(events) {
    const byCategory = events.reduce((acc, event) => {
      const key = event.category || "Импакт-сигнал";
      acc[key] = acc[key] || { name: key, value: 0, text: event.summary, count: 0 };
      acc[key].count += 1;
      acc[key].value = Math.max(acc[key].value, event.score || 0);
      if ((event.score || 0) >= acc[key].value) acc[key].text = event.summary;
      return acc;
    }, {});
    return Object.values(byCategory).sort((a, b) => b.value - a.value).slice(0, 4);
  }

  function analysisSummary(project, events, level) {
    const critical = events.filter((event) => event.level === "RED");
    const medium = events.filter((event) => event.level === "YELLOW");
    if (!events.length) {
      return `В backend по объекту ${project.name} не найдено связанных impact-сигналов. Объект можно оставить в плановом мониторинге до появления новых публикаций.`;
    }
    if (level === "RED") {
      return `По объекту ${project.name} найдено ${critical.length} критических сигналов и ${events.length} связанных публикаций. Требуется проверка первоисточников и графика проекта.`;
    }
    if (level === "YELLOW") {
      return `По объекту ${project.name} есть умеренные сигналы: ${medium.length} публикаций требуют наблюдения, критический уровень пока не подтверждён.`;
    }
    return `По объекту ${project.name} критических сигналов не найдено. В ленте есть ${events.length} связанных публикаций без высокого риска.`;
  }

  function recordAnalysis(analysis) {
    const history = readLocal(accountKey(storageKeys.analysisHistory), []);
    const previous = history.find((item) => item.project_name === analysis.project_name);
    const entry = {
      id: `analysis-${Date.now()}`,
      project_id: analysis.project_id,
      project_name: analysis.project_name,
      level: analysis.level,
      score: analysis.score,
      summary: analysis.summary,
      model_version: analysis.model_version,
      analyzed_at: analysis.analyzed_at,
    };
    writeLocal(accountKey(storageKeys.analysisHistory), [entry, ...history].slice(0, 100));

    if (!previous || previous.level !== analysis.level || previous.score !== analysis.score) {
      const changes = readLocal(accountKey(storageKeys.riskChanges), []);
      changes.unshift({
        id: `risk-${Date.now()}`,
        project_id: analysis.project_id,
        project_name: analysis.project_name,
        previous_level: previous?.level || null,
        new_level: analysis.level,
        previous_score: previous?.score ?? null,
        new_score: analysis.score,
        changed_at: analysis.analyzed_at,
      });
      writeLocal(accountKey(storageKeys.riskChanges), changes.slice(0, 100));
    }
  }

  async function analyzeProject(projectInput) {
    const events = await normalizedEvents();
    const projects = await normalizedProjects({ events });
    const project = findProject(projectInput, projects);
    const projectEvents = events.filter((event) => projectEventMatch(event, project));
    const score = projectEvents.length ? Math.max(...projectEvents.map((event) => event.score || 0)) : project.score || 0;
    const level = riskLevelFromScore(score);
    const analysis = {
      project_id: project.id || null,
      project_name: project.name,
      level,
      score,
      summary: analysisSummary(project, projectEvents, level),
      drivers: driverRows(projectEvents),
      events: sortByDateDesc(projectEvents).slice(0, 8),
      model_version: "backend-impact-signals",
      analyzed_at: new Date().toISOString(),
    };
    recordAnalysis(analysis);
    return analysis;
  }

  function isToday(value) {
    const date = new Date(value);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  }

  function eventImpact(event, question) {
    const delta = event.level === "RED" ? 18 : event.level === "YELLOW" ? 7 : -2;
    const confidence = event.level === "RED" ? 90 : event.level === "YELLOW" ? 78 : 70;
    return {
      event_id: event.id,
      project_name: event.project_name,
      question,
      verdict: event.level === "RED"
        ? "Существенно повышает риск проекта"
        : event.level === "YELLOW"
          ? "Умеренно повышает риск проекта"
          : "Не повышает текущий риск",
      detailed_analysis: `${event.title}. Категория: ${event.category}. Источник: ${event.source}. ${event.summary}`,
      risk_delta: delta,
      confidence,
      factors: [event.category, event.source, event.project_name].filter(Boolean),
      recommendations: event.level === "RED"
        ? ["Проверить первоисточник", "Сверить событие с проектной декларацией", "Назначить ручную проверку"]
        : ["Продолжить мониторинг", "Проверить повторяемость сигнала"],
      generated_at: new Date().toISOString(),
    };
  }

  async function getOverview() {
    const projects = await normalizedProjects();
    const events = await normalizedEvents();
    return {
      stats: {
        projects_total: projects.length,
        critical_projects: projects.filter((project) => project.level === "RED").length,
        events_today: events.filter((event) => isToday(event.published_at)).length,
        sources_online: new Set(events.map((event) => event.source).filter(Boolean)).size,
      },
      recent_events: events.slice(0, 4),
    };
  }

  async function getProjects(query = "", level = "ALL", limit = DEFAULT_LIMIT, options = {}) {
    const projects = await normalizedProjects({ query, limit, force: options.force });
    return projects.filter((project) => {
      const matchesLevel = level === "ALL" || project.level === level;
      return matchesLevel;
    });
  }

  async function getEvents() {
    return normalizedEvents();
  }

  async function getAlerts(level = "ALL") {
    const events = await normalizedEvents();
    return events.filter((event) => event.level !== "GREEN" && (level === "ALL" || event.level === level));
  }

  async function explainImpact(eventId, question) {
    const events = await normalizedEvents();
    const event = events.find((item) => item.id === eventId) || events[0];
    if (!event) throw new Error("В backend пока нет новостей для разбора");
    return eventImpact(event, question);
  }

  async function getAnalysisHistory() {
    return readLocal(accountKey(storageKeys.analysisHistory), []);
  }

  async function getRiskChanges() {
    return readLocal(accountKey(storageKeys.riskChanges), []);
  }

  async function login(credentials) {
    const email = normalizeText(credentials.email, "analyst@gpb.ru");
    const savedUsers = readLocal(`risk-intelligence:${storageKeys.users}`, {});
    const user = savedUsers[email] || {
      id: email,
      name: email.split("@")[0],
      email,
      role: "Аналитик рисков",
      department: "Проектное финансирование",
    };
    return { token: `local-${Date.now()}`, user };
  }

  async function register(profile) {
    const email = normalizeText(profile.email);
    const user = {
      id: email || `user-${Date.now()}`,
      name: normalizeText(profile.name, "Аналитик"),
      email,
      role: "Аналитик рисков",
      department: normalizeText(profile.department, "Проектное финансирование"),
    };
    const savedUsers = readLocal(`risk-intelligence:${storageKeys.users}`, {});
    savedUsers[user.email] = user;
    writeLocal(`risk-intelligence:${storageKeys.users}`, savedUsers);
    return { token: `local-${Date.now()}`, user };
  }

  window.api = {
    getOverview,
    analyze: analyzeProject,
    getAlerts,
    getProjects,
    getEvents,
    explainImpact,
    getAnalysisHistory,
    getRiskChanges,
    login,
    register,
    searchProjectsByName: (query, limit = DEFAULT_LIMIT) => normalizedProjects({ query, limit, force: true }),
  };
})();
