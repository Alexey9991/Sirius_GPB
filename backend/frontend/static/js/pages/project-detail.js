(function () {
  const ctx = window.RiskDesk;
  const {
    app, esc, pageHtml, componentHtml, loading, renderError, emptyHtml, chip,
  } = ctx;

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function projectIdFromUrl() {
    return params().get("id") || "";
  }

  function domRfObjectId(projectId) {
    const explicit = params().get("object_id") || params().get("domrf_id");
    if (explicit) return explicit;
    const match = String(projectId || "").match(/domrf:(\d+)/i) || String(projectId || "").match(/\b(\d{4,})\b/);
    return match ? match[1] : "";
  }

  function fallbackProject() {
    const query = params();
    return {
      id: query.get("id") || "",
      name: query.get("name") || "Объект недвижимости",
      city: query.get("city") || "Город не указан",
      developer: query.get("developer") || "Застройщик не указан",
    };
  }

  function value(value, fallback = "Не указано") {
    return value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function formatDate(value) {
    if (!value) return "Не указано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function progressValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function levelClass(level) {
    return { high: "red", medium: "yellow", low: "green" }[String(level || "").toLowerCase()] || "green";
  }

  function riskHintsHtml(hints) {
    if (!Array.isArray(hints) || !hints.length) {
      return emptyHtml("По данным наш.дом.рф автоматических риск-подсказок пока нет.");
    }
    return hints.map((hint) => componentHtml("project-detail-risk", {
      LEVEL_CLASS: levelClass(hint.level),
      TITLE: esc(hint.type || "Сигнал"),
      SUMMARY: esc(hint.summary || ""),
    })).join("");
  }

  function photoUrl(photo) {
    const url = typeof photo === "string"
      ? photo
      : photo?.url || photo?.src || photo?.fileUrl || photo?.imageUrl || "";
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `https://xn--80az8a.xn--d1aqf.xn--p1ai${url}`;
    return url;
  }

  function photosHtml(photos) {
    if (!Array.isArray(photos) || !photos.length) return "";
    return `<div class="detail-photo-grid">${photos.slice(0, 4).map((photo) => {
      const url = photoUrl(photo);
      return url ? componentHtml("project-detail-photo", { URL: esc(url) }) : "";
    }).join("")}</div>`;
  }

  function sourceUrl(objectId, data) {
    return data.source_url || `https://xn--80az8a.xn--d1aqf.xn--p1ai/сервисы/каталог-новостроек/объект/${objectId}`;
  }

  function renderDomRfCard(payload, project, objectId) {
    const data = payload.object || {};
    const progress = progressValue(data.construction_progress);
    return componentHtml("project-detail-card", {
      NAME: esc(value(data.name, project.name)),
      ADDRESS: esc(value(data.address, `${value(data.city, project.city)} · ${value(data.developer_name, project.developer)}`)),
      SOURCE_URL: esc(sourceUrl(objectId, data)),
      STATUS: `<span class="detail-status">${esc(value(data.status, "Статус не указан"))}</span>`,
      CITY: esc(value(data.city, project.city)),
      REGION: esc(value(data.region)),
      DEVELOPER: esc(value(data.developer_name, project.developer)),
      INN_OGRN: esc([data.developer_inn, data.developer_ogrn].filter(Boolean).join(" / ") || "Не указано"),
      DOMRF_ID: esc(value(data.domrf_object_id, objectId)),
      PROGRESS: progress,
      PLANNED_DATE: formatDate(data.planned_rve_date),
      ACTUAL_DATE: formatDate(data.actual_rve_date),
      RISK_HINTS: riskHintsHtml(data.risk_hints),
      DOCUMENTS_COUNT: Array.isArray(data.documents) ? data.documents.length : 0,
      PHOTOS_COUNT: Array.isArray(data.photos) ? data.photos.length : 0,
      PHOTOS: photosHtml(data.photos),
    });
  }

  function renderBasic(project) {
    return componentHtml("project-detail-basic", {
      NAME: esc(project.name),
      META: esc(`${project.city} · ${project.developer}`),
    });
  }

  async function renderProjectDetail() {
    loading();
    try {
      const projectId = projectIdFromUrl();
      const project = await window.api.getProjectById(projectId).catch(() => null) || fallbackProject();
      const objectId = domRfObjectId(project.id);
      if (!objectId) {
        app.innerHTML = pageHtml("project-detail", { CONTENT: renderBasic(project) });
        return;
      }
      const payload = await window.api.getDomRfObject(objectId).catch((error) => ({ error }));
      const content = payload.error
        ? `${renderBasic(project)}<section class="card"><h2>наш.дом.рф не ответил</h2><p class="detail-muted">${esc(payload.error.message)}</p><p class="detail-muted">Проверь DOMRF_OBJECT_URL_TEMPLATE после Copy as cURL из DevTools.</p></section>`
        : renderDomRfCard(payload, project, objectId);
      app.innerHTML = pageHtml("project-detail", { CONTENT: content });
    } catch (error) {
      renderError(error);
    }
  }

  ctx.registerPage("project-detail", renderProjectDetail);
})();
