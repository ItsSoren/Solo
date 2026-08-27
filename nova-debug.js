(() => {
  "use strict";
  const enabled = new URLSearchParams(location.search).has("debug");
  let panel = null;
  const lines = [];
  const text = value => typeof value === "string" ? value : JSON.stringify(value || {});
  const ensurePanel = () => {
    if (!enabled || panel) return panel;
    panel = document.createElement("aside");
    panel.id = "novaDebugTrace";
    Object.assign(panel.style, { position: "fixed", zIndex: "10000", right: "12px", bottom: "12px", width: "min(430px,calc(100vw - 24px))", maxHeight: "42vh", overflow: "auto", padding: "12px 14px", border: "1px solid rgba(124,232,229,.45)", borderRadius: "14px", background: "rgba(5,24,31,.94)", color: "#e9ffff", font: "12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace", boxShadow: "0 18px 55px rgba(0,0,0,.3)" });
    document.body.append(panel);
    return panel;
  };
  const step = (name, details = {}) => {
    const entry = `[Sōlo trace] ${name}`;
    console.log(entry, details);
    if (!enabled) return;
    lines.push(`${new Date().toLocaleTimeString()}  ${name}${Object.keys(details).length ? `  ${text(details)}` : ""}`);
    while (lines.length > 14) lines.shift();
    const node = ensurePanel();
    node.innerHTML = `<strong style="display:block;margin-bottom:7px;color:#8ff2e9">Sōlo diagnostic</strong>${lines.map(line => `<div style="padding:2px 0;border-top:1px solid rgba(160,230,230,.12)">${line.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</div>`).join("")}`;
  };
  window.NovaTrace = { step };
  step("00 diagnostic prêt", { debugPanel: enabled });
  document.addEventListener("DOMContentLoaded", () => step("01 DOM prêt", { sharedSection: Boolean(document.getElementById("sharedSection")) }), { once: true });
  document.addEventListener("click", event => {
    const target = event.target.closest?.("[data-cloud-action]");
    if (target) step("02 clic reçu", { action: target.dataset.cloudAction, element: target.tagName });
  }, true);
  window.addEventListener("error", event => step("ERREUR runtime", { message: event.message || "inconnue" }));
  window.addEventListener("unhandledrejection", event => step("ERREUR promise", { message: event.reason?.message || String(event.reason || "inconnue") }));
})();
