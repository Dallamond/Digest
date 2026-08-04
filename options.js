// Digest — options.js
// Gestión de varios proveedores de IA guardados en `digestProviders`
// (array, orden = prioridad de fallback). El formulario usa un modelo de
// borrador en memoria + guardado explícito (mismo patrón UX que Mirage),
// pero ahora "guardar" añade/edita una entrada de la lista en vez de pisar
// una config única.

const PROVIDER_PRESETS = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    needsKey: true,
    keyHint: "Consíguela en platform.openai.com/api-keys",
  },
  gemini: {
    label: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.5-flash",
    needsKey: true,
    keyHint: "Gratis. Consíguela en aistudio.google.com/apikey",
  },
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    needsKey: true,
    keyHint: "Gratis y muy rápido. Consíguela en console.groq.com/keys",
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    needsKey: true,
    keyHint: "Gratis (modelos :free). Consíguela en openrouter.ai/keys — límite bajo de peticiones/día.",
  },
  ollama: {
    label: "Ollama (local)",
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1",
    needsKey: false,
    keyHint: "Ollama local no necesita API key.",
  },
  custom: {
    label: "Personalizado",
    endpoint: "",
    model: "",
    needsKey: true,
    keyHint: "Depende del proveedor que uses.",
  },
};

const els = {
  list: document.getElementById("providerList"),
  emptyMsg: document.getElementById("emptyProviders"),
  addBtn: document.getElementById("addProviderBtn"),
  form: document.getElementById("providerForm"),
  formTitle: document.getElementById("formTitle"),
  provider: document.getElementById("provider"),
  label: document.getElementById("label"),
  apiKeyRow: document.getElementById("apiKeyRow"),
  apiKey: document.getElementById("apiKey"),
  apiKeyHint: document.getElementById("apiKeyHint"),
  endpoint: document.getElementById("endpoint"),
  model: document.getElementById("model"),
  advanced: document.getElementById("advanced"),
  testBtn: document.getElementById("testBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  testResult: document.getElementById("testResult"),
};

let providers = [];
let editingId = null; // null = modo "añadir"

// ---------- Tipos de resumen ----------

const summaryTypeEls = {
  list: document.getElementById("summaryTypeList"),
  emptyMsg: document.getElementById("emptySummaryTypes"),
  addBtn: document.getElementById("addSummaryTypeBtn"),
  resetBtn: document.getElementById("resetSummaryTypesBtn"),
  form: document.getElementById("summaryTypeForm"),
  formTitle: document.getElementById("summaryTypeFormTitle"),
  label: document.getElementById("summaryTypeLabel"),
  instruction: document.getElementById("summaryTypeInstruction"),
  cancelBtn: document.getElementById("cancelSummaryTypeBtn"),
};

let summaryTypes = [];
let editingSummaryTypeIdx = null; // null = modo "añadir"

init();

async function init() {
  providers = await loadProviders();
  render();

  els.addBtn.addEventListener("click", () => openForm(null));
  els.cancelBtn.addEventListener("click", closeForm);
  els.form.addEventListener("submit", handleSave);
  els.testBtn.addEventListener("click", handleTestFromForm);
  // Al elegir un proveedor distinto en el desplegable, siempre se aplica su
  // endpoint/modelo por defecto — es una acción explícita del usuario, no
  // debe respetar un valor previo que quedó puesto por el proveedor anterior.
  els.provider.addEventListener("change", () => applyPreset(els.provider.value, /* onlyIfEmpty */ false));

  summaryTypes = await loadSummaryTypes();
  renderSummaryTypes();

  summaryTypeEls.addBtn.addEventListener("click", () => openSummaryTypeForm(null));
  summaryTypeEls.cancelBtn.addEventListener("click", closeSummaryTypeForm);
  summaryTypeEls.form.addEventListener("submit", handleSaveSummaryType);
  summaryTypeEls.resetBtn.addEventListener("click", handleResetSummaryTypes);
}

async function loadSummaryTypes() {
  const response = await chrome.runtime.sendMessage({ type: "digest-get-summary-types" });
  return (response && response.ok && response.types) || [];
}

async function persistSummaryTypes() {
  const response = await chrome.runtime.sendMessage({ type: "digest-save-summary-types", types: summaryTypes });
  summaryTypes = (response && response.types) || summaryTypes;
}

function renderSummaryTypes() {
  summaryTypeEls.list.innerHTML = "";
  summaryTypeEls.emptyMsg.hidden = summaryTypes.length > 0;

  summaryTypes.forEach((t, idx) => {
    const li = document.createElement("li");
    li.className = "provider-card";

    const info = document.createElement("div");
    info.className = "provider-info";
    info.innerHTML = `
      <span class="provider-priority">#${idx + 1}</span>
      <div>
        <div class="provider-label">${escapeHtml(t.label)}</div>
        <div class="provider-model">${escapeHtml((t.instruction || "").slice(0, 90))}${t.instruction && t.instruction.length > 90 ? "…" : ""}</div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "provider-actions";

    const upBtn = mkBtn("↑", () => moveSummaryType(idx, -1), idx === 0);
    const downBtn = mkBtn("↓", () => moveSummaryType(idx, 1), idx === summaryTypes.length - 1);
    const editBtn = mkBtn("Editar", () => openSummaryTypeForm(idx));
    const deleteBtn = mkBtn("Eliminar", () => removeSummaryType(idx), false, true);

    actions.append(upBtn, downBtn, editBtn, deleteBtn);
    li.append(info, actions);
    summaryTypeEls.list.appendChild(li);
  });
}

function moveSummaryType(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= summaryTypes.length) return;
  [summaryTypes[idx], summaryTypes[target]] = [summaryTypes[target], summaryTypes[idx]];
  persistSummaryTypes();
  renderSummaryTypes();
}

function removeSummaryType(idx) {
  if (!confirm(`¿Eliminar el tipo "${summaryTypes[idx].label}"?`)) return;
  summaryTypes.splice(idx, 1);
  persistSummaryTypes();
  renderSummaryTypes();
}

function openSummaryTypeForm(idx) {
  editingSummaryTypeIdx = idx === null ? null : idx;
  summaryTypeEls.form.hidden = false;
  summaryTypeEls.formTitle.textContent = idx === null ? "Añadir tipo de resumen" : "Editar tipo de resumen";

  if (idx === null) {
    summaryTypeEls.label.value = "";
    summaryTypeEls.instruction.value = "";
  } else {
    const t = summaryTypes[idx];
    summaryTypeEls.label.value = t.label || "";
    summaryTypeEls.instruction.value = t.instruction || "";
  }

  summaryTypeEls.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeSummaryTypeForm() {
  summaryTypeEls.form.hidden = true;
  editingSummaryTypeIdx = null;
}

async function handleSaveSummaryType(e) {
  e.preventDefault();
  const label = summaryTypeEls.label.value.trim();
  const instruction = summaryTypeEls.instruction.value.trim();
  if (!label || !instruction) return;

  if (editingSummaryTypeIdx === null) {
    summaryTypes.push({ id: `t-${Date.now()}`, label, instruction });
  } else {
    const existing = summaryTypes[editingSummaryTypeIdx];
    summaryTypes[editingSummaryTypeIdx] = { id: existing.id, label, instruction };
  }

  await persistSummaryTypes();
  renderSummaryTypes();
  closeSummaryTypeForm();
}

async function handleResetSummaryTypes() {
  if (!confirm("¿Restaurar los tipos de resumen por defecto? Se perderán los tipos personalizados que hayas creado.")) return;
  const response = await chrome.runtime.sendMessage({ type: "digest-save-summary-types", types: [] });
  summaryTypes = (response && response.types) || [];
  renderSummaryTypes();
}

async function loadProviders() {
  const { digestProviders, digestConfig } = await chrome.storage.local.get(["digestProviders", "digestConfig"]);
  if (Array.isArray(digestProviders) && digestProviders.length > 0) return digestProviders;

  // Migración desde la v0.1 (config única) a la lista de proveedores.
  if (digestConfig && digestConfig.endpoint) {
    const migrated = [{ ...digestConfig, id: "migrated-1", enabled: true, label: digestConfig.label || "Proveedor" }];
    await chrome.storage.local.set({ digestProviders: migrated });
    return migrated;
  }
  return [];
}

async function persist() {
  await chrome.storage.local.set({ digestProviders: providers });
}

function render() {
  els.list.innerHTML = "";
  els.emptyMsg.hidden = providers.length > 0;

  providers.forEach((p, idx) => {
    const li = document.createElement("li");
    li.className = "provider-card" + (p.enabled === false ? " disabled" : "");

    const info = document.createElement("div");
    info.className = "provider-info";
    info.innerHTML = `
      <span class="provider-priority">#${idx + 1}</span>
      <div>
        <div class="provider-label">${escapeHtml(p.label || PROVIDER_PRESETS[p.provider]?.label || p.provider)}</div>
        <div class="provider-model">${escapeHtml(p.model || "")}</div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "provider-actions";

    const upBtn = mkBtn("↑", () => move(idx, -1), idx === 0);
    const downBtn = mkBtn("↓", () => move(idx, 1), idx === providers.length - 1);
    const toggleBtn = mkBtn(p.enabled === false ? "Activar" : "Desactivar", () => toggleEnabled(idx));
    const editBtn = mkBtn("Editar", () => openForm(idx));
    const deleteBtn = mkBtn("Eliminar", () => remove(idx), false, true);

    actions.append(upBtn, downBtn, toggleBtn, editBtn, deleteBtn);
    li.append(info, actions);
    els.list.appendChild(li);
  });
}

function mkBtn(text, onClick, disabled = false, danger = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.disabled = disabled;
  if (danger) b.className = "danger";
  b.addEventListener("click", onClick);
  return b;
}

function move(idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= providers.length) return;
  [providers[idx], providers[target]] = [providers[target], providers[idx]];
  persist();
  render();
}

function toggleEnabled(idx) {
  providers[idx].enabled = providers[idx].enabled === false;
  persist();
  render();
}

function remove(idx) {
  if (!confirm(`¿Eliminar "${providers[idx].label}"?`)) return;
  providers.splice(idx, 1);
  persist();
  render();
}

function openForm(idx) {
  editingId = idx === null ? null : idx;
  els.form.hidden = false;
  els.testResult.hidden = true;
  els.formTitle.textContent = idx === null ? "Añadir proveedor" : "Editar proveedor";

  if (idx === null) {
    els.provider.value = "openai";
    els.label.value = "";
    els.apiKey.value = "";
    applyPreset("openai", false);
  } else {
    const p = providers[idx];
    els.provider.value = p.provider || "custom";
    els.label.value = p.label || "";
    els.apiKey.value = p.apiKey || "";
    els.endpoint.value = p.endpoint || "";
    els.model.value = p.model || "";
    updateApiKeyVisibility(p.provider);
  }

  els.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  els.form.hidden = true;
  editingId = null;
}

function applyPreset(providerKey, onlyIfEmpty) {
  const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.custom;
  if (!onlyIfEmpty || !els.endpoint.value.trim()) els.endpoint.value = preset.endpoint;
  if (!onlyIfEmpty || !els.model.value.trim()) els.model.value = preset.model;
  if (!els.label.value.trim()) els.label.value = preset.label;
  updateApiKeyVisibility(providerKey);
  if (providerKey === "custom") els.advanced.open = true;
}

function updateApiKeyVisibility(providerKey) {
  const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.custom;
  els.apiKeyRow.style.display = preset.needsKey ? "flex" : "none";
  els.apiKeyHint.textContent = preset.keyHint;
}

function readFormConfig() {
  const providerKey = els.provider.value;
  const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.openai;
  return {
    provider: providerKey,
    label: els.label.value.trim() || preset.label,
    endpoint: els.endpoint.value.trim() || preset.endpoint,
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim() || preset.model,
    enabled: true,
  };
}

async function handleSave(e) {
  e.preventDefault();
  const config = readFormConfig();

  if (editingId === null) {
    config.id = `p-${Date.now()}`;
    providers.push(config);
  } else {
    config.id = providers[editingId].id;
    config.enabled = providers[editingId].enabled;
    providers[editingId] = config;
  }

  await persist();
  render();
  closeForm();
}

async function handleTestFromForm() {
  const config = readFormConfig();
  els.testBtn.disabled = true;
  els.testBtn.textContent = "Probando…";
  showTestResult("Comprobando conexión con el proveedor…", false);

  try {
    const response = await chrome.runtime.sendMessage({ type: "digest-test-config", config });
    if (response && response.ok) {
      showTestResult("✅ Conexión correcta. La API respondió sin errores.", false);
    } else {
      showTestResult(`❌ ${(response && response.error) || "No se pudo conectar."}`, true);
    }
  } catch (err) {
    showTestResult(`❌ ${String(err && err.message ? err.message : err)}`, true);
  } finally {
    els.testBtn.disabled = false;
    els.testBtn.textContent = "Probar conexión";
  }
}

function showTestResult(text, isError) {
  els.testResult.hidden = false;
  els.testResult.textContent = text;
  els.testResult.classList.toggle("error", isError);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
