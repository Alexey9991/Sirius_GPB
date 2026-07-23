(function () {
  function slotValue(slots, key) {
    return String(slots[key.toUpperCase()] ?? slots[key] ?? "");
  }

  function renderTemplate(templateId, slots = {}) {
    const template = document.getElementById(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);
    return template.innerHTML
      .replace(/\s+\[\[([A-Z0-9_]+)\]\](?:="")/gi, (_, key) => {
        const value = slotValue(slots, key);
        return value ? ` ${value}` : "";
      })
      .replace(/\[\[([A-Z0-9_]+)\]\]/gi, (_, key) => slotValue(slots, key));
  }

  window.renderTemplate = renderTemplate;
})();
