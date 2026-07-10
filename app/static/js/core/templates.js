(function () {
  function renderTemplate(templateId, slots = {}) {
    const template = document.getElementById(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);
    return template.innerHTML.replace(/\[\[([A-Z0-9_]+)\]\]/g, (_, key) => String(slots[key] ?? ""));
  }

  window.renderTemplate = renderTemplate;
})();
