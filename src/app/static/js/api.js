/**
 * Единственная граница между интерфейсом и backend.
 * Компоненты страниц не знают URL эндпоинтов и не содержат мок-логику.
 */
(function () {
  const config = window.APP_CONFIG || {};

  // FRONTEND/BACKEND SWITCH
  // config.useMock=true  -> functions in `mocks` below are used, no API needed.
  // config.useMock=false -> functions in `remote` call the real backend.
  // main.py builds this config from USE_MOCK_API and API_BASE_URL.
  // Backend developers normally should not edit page rendering in app.js.

  const projects = [
    { id: "p-001", name: "ЖК Северный берег", city: "Москва", developer: "ГК Север Девелопмент", score: 86, level: "RED", completion: 62, updated_at: "2026-07-03T08:42:00+05:00" },
    { id: "p-002", name: "ЖК Лесной квартал", city: "Санкт-Петербург", developer: "СтройИнвест", score: 57, level: "YELLOW", completion: 78, updated_at: "2026-07-03T08:31:00+05:00" },
    { id: "p-003", name: "ЖК Солнечный парк", city: "Казань", developer: "Городские проекты", score: 18, level: "GREEN", completion: 91, updated_at: "2026-07-03T07:55:00+05:00" },
    { id: "p-004", name: "ЖК Речной порт", city: "Нижний Новгород", developer: "Домстрой", score: 31, level: "GREEN", completion: 49, updated_at: "2026-07-03T07:37:00+05:00" },
    { id: "p-005", name: "ЖК Новые высоты", city: "Екатеринбург", developer: "Урал Девелопмент", score: 68, level: "YELLOW", completion: 35, updated_at: "2026-07-03T06:48:00+05:00" },
  ];

  const events = [
    { id: "e-001", project_name: "ЖК Северный берег", title: "Прокуратура начала проверку застройщика", summary: "Ведомство проверяет соблюдение сроков и использование средств дольщиков.", category: "Юридический риск", sentiment: "NEGATIVE", level: "RED", source: "Регион Онлайн", published_at: "2026-07-03T08:42:00+05:00", source_url: "#" },
    { id: "e-002", project_name: "ЖК Новые высоты", title: "Покупатели сообщают о замедлении строительных работ", summary: "В открытых источниках растёт число сообщений о снижении активности на площадке.", category: "Сроки", sentiment: "NEGATIVE", level: "YELLOW", source: "Недвижимость сегодня", published_at: "2026-07-03T08:15:00+05:00", source_url: "#" },
    { id: "e-003", project_name: "ЖК Северный берег", title: "Срок сдачи корпуса перенесён на шесть месяцев", summary: "Застройщик обновил проектную декларацию и новый график ввода.", category: "Сроки", sentiment: "NEGATIVE", level: "RED", source: "Городские новости", published_at: "2026-07-03T07:20:00+05:00", source_url: "#" },
    { id: "e-004", project_name: "ЖК Солнечный парк", title: "Строительная готовность нового корпуса достигла 91%", summary: "Работы идут по графику, разрешительная документация актуальна.", category: "Строительство", sentiment: "POSITIVE", level: "GREEN", source: "Строительный портал", published_at: "2026-07-03T06:50:00+05:00", source_url: "#" },
    { id: "e-005", project_name: "ЖК Лесной квартал", title: "Застройщик обсуждает корректировку графика работ", summary: "Критических изменений в проектной декларации пока не опубликовано.", category: "Сроки", sentiment: "NEUTRAL", level: "YELLOW", source: "Рынок недвижимости", published_at: "2026-07-03T06:10:00+05:00", source_url: "#" },
  ];

  function analysisFor(projectName) {
    const name = projectName.toLowerCase();
    const red = name.includes("север") || name.includes("берег");
    const yellow = name.includes("лес") || name.includes("квартал") || name.includes("высот");
    const level = red ? "RED" : yellow ? "YELLOW" : "GREEN";
    const score = red ? 86 : yellow ? 57 : 18;
    const summaries = {
      RED: "Обнаружена связка негативных сигналов: перенос срока сдачи, проверка надзорных органов и жалобы покупателей. Требуется проверка влияния на график строительства и cash flow проекта.",
      YELLOW: "Зафиксированы умеренные сигналы риска: обсуждение сроков и отдельные жалобы покупателей. Критических юридических событий не найдено.",
      GREEN: "Существенных негативных сигналов не найдено. Новостной фон нейтральный или положительный, критических событий по объекту нет.",
    };
    const values = level === "RED" ? [91, 88, 74, 63] : level === "YELLOW" ? [55, 22, 48, 35] : [18, 10, 16, 22];
    const labels = ["Срыв сроков", "Юридический риск", "Репутация", "Финансовый риск"];
    const notes = level === "RED"
      ? ["перенос сдачи корпуса", "проверка прокуратуры", "рост жалоб покупателей", "давление на продажи"]
      : level === "YELLOW"
        ? ["есть обсуждение сроков", "проверок не найдено", "единичные жалобы", "прямых сигналов нет"]
        : ["работы идут по графику", "проверок нет", "фон нейтральный", "прямых сигналов нет"];
    const related = events.filter((item) => item.project_name.toLowerCase().includes(name.replace("жк ", "")));
    return {
      project_id: projects.find((p) => p.name.toLowerCase() === name)?.id || null,
      project_name: projectName,
      level,
      score,
      summary: summaries[level],
      drivers: labels.map((label, index) => ({ name: label, value: values[index], text: notes[index] })),
      events: related.length ? related : events.slice(level === "GREEN" ? 3 : 0, level === "GREEN" ? 5 : 3),
      model_version: "risk-model-demo-1",
      analyzed_at: new Date().toISOString(),
    };
  }

  const mocks = {
    async getOverview() {
      return { stats: { projects_total: 42, critical_projects: 5, events_today: 1847, sources_online: 126 }, favorites: projects.slice(0, 4), recent_events: events.slice(0, 4) };
    },
    async analyze(projectName) { await delay(280); return analysisFor(projectName); },
    async getAlerts(level = "ALL") { return events.filter((e) => level === "ALL" || e.level === level); },
    async getProjects(query = "", level = "ALL") {
      const q = query.toLowerCase();
      return projects.filter((p) => (!q || `${p.name} ${p.city} ${p.developer}`.toLowerCase().includes(q)) && (level === "ALL" || p.level === level));
    },
    async getEvents() { return events; },
    async login(credentials) {
      await delay(240);
      return {
        token: "demo-token",
        user: { id: "u-001", name: "Анна Иванова", email: credentials.email, role: "Аналитик рисков", department: "Проектное финансирование" },
      };
    },
    async register(profile) {
      await delay(280);
      return {
        token: "demo-token",
        user: { id: "u-new", name: profile.name, email: profile.email, role: "Аналитик рисков", department: profile.department || "Проектное финансирование" },
      };
    },
  };

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function request(path, options = {}) {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API ${response.status}: ${detail || response.statusText}`);
    }
    return response.json();
  }

  // REAL API BOUNDARY
  // Keep all backend URLs in this object. Each response must match
  // API_CONTRACT.md. If the backend contract changes, adapt it here instead of
  // scattering fetch calls across the page components.
  const remote = {
    getOverview: () => request("/overview"),
    analyze: (projectName) => request("/analysis", { method: "POST", body: JSON.stringify({ project_name: projectName }) }),
    getAlerts: (level = "ALL") => request(`/alerts?level=${encodeURIComponent(level)}&limit=100`),
    getProjects: (query = "", level = "ALL") => request(`/projects?query=${encodeURIComponent(query)}&level=${encodeURIComponent(level)}`),
    getEvents: () => request("/events?limit=100"),
    login: (credentials) => request("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
    register: (profile) => request("/auth/register", { method: "POST", body: JSON.stringify(profile) }),
  };

  window.api = config.useMock ? mocks : remote;
})();
