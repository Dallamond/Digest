// Digest — popup.js

const els = {
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("resultTitle"),
  resultUrl: document.getElementById("resultUrl"),
  resultProvider: document.getElementById("resultProvider"),
  resultText: document.getElementById("resultText"),
  summarizePage: document.getElementById("summarizePage"),
  summarizeSelection: document.getElementById("summarizeSelection"),
  copyBtn: document.getElementById("copyBtn"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  openOptions: document.getElementById("openOptions"),
};

let currentEntry = null;

init();

async function init() {
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.summarizePage.addEventListener("click", () => handleSummarize("page"));
  els.summarizeSelection.addEventListener("click", () => handleSummarize("selection"));
  els.copyBtn.addEventListener("click", handleCopy);
  els.exportMdBtn.addEventListener("click", handleExport);

  // Si venimos de un clic en el menú contextual, ya hay un resultado
  // esperando en session storage — lo mostramos directamente.
  const { digestPending } = await chrome.storage.session.get("digestPending");
  if (digestPending) {
    await chrome.storage.session.remove("digestPending");
    if (digestPending.ok) {
      showResult(digestPending.entry);
    } else {
      showStatus(digestPending.error, true);
    }
  }

  const { digestProviders, digestConfig } = await chrome.storage.local.get(["digestProviders", "digestConfig"]);
  const hasProvider = (Array.isArray(digestProviders) && digestProviders.length > 0) || (digestConfig && digestConfig.endpoint);
  if (!hasProvider) {
    showStatus("No has configurado ningún proveedor de IA todavía. Ve a Opciones (⚙️) para añadir tu API key o tu endpoint local.", true);
  }
}

function getSelectedLength() {
  const checked = document.querySelector('input[name="length"]:checked');
  return checked ? checked.value : "medio";
}

async function handleSummarize(source) {
  setButtonsDisabled(true);
  showStatus(source === "page" ? "Extrayendo y resumiendo la página…" : "Resumiendo selección…", false);
  els.result.hidden = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "digest-summarize",
      source,
      length: getSelectedLength(),
    });

    if (!response || !response.ok) {
      showStatus((response && response.error) || "Ha ocurrido un error inesperado.", true);
      return;
    }

    showResult(response.entry);
    hideStatus();
  } catch (err) {
    showStatus(String(err && err.message ? err.message : err), true);
  } finally {
    setButtonsDisabled(false);
  }
}

function showResult(entry) {
  currentEntry = entry;
  els.resultTitle.textContent = entry.title || "(sin título)";
  els.resultUrl.textContent = entry.url || "";
  els.resultUrl.href = entry.url || "#";
  renderMarkdown(els.resultText, entry.summary || "");

  if (entry.providerLabel) {
    els.resultProvider.hidden = false;
    els.resultProvider.textContent = entry.fallbackUsed ? `vía ${entry.providerLabel} (fallback)` : `vía ${entry.providerLabel}`;
  } else {
    els.resultProvider.hidden = true;
  }

  els.result.hidden = false;
}

// Renderiza el resumen como Markdown (negrita, listas, encabezados...) en
// vez de texto plano con los `**` visibles. El CSP de la extensión
// (script-src 'self') impide que se ejecute cualquier <script> que pudiera
// colarse en el HTML generado, así que innerHTML aquí es seguro.
function renderMarkdown(el, text) {
  if (window.marked) {
    el.innerHTML = window.marked.parse(text);
  } else {
    el.textContent = text;
  }
}

function showStatus(text, isError) {
  els.status.textContent = text;
  els.status.hidden = false;
  els.status.classList.toggle("error", !!isError);
}

function hideStatus() {
  els.status.hidden = true;
}

function setButtonsDisabled(disabled) {
  els.summarizePage.disabled = disabled;
  els.summarizeSelection.disabled = disabled;
}

async function handleCopy() {
  if (!currentEntry) return;
  await navigator.clipboard.writeText(currentEntry.summary);
  els.copyBtn.textContent = "¡Copiado!";
  setTimeout(() => (els.copyBtn.textContent = "Copiar"), 1200);
}

function handleExport() {
  if (!currentEntry) return;
  const md = buildMarkdown(currentEntry);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `digest-${slugify(currentEntry.title)}-${currentEntry.date.slice(0, 10)}.md`;
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
}

function buildMarkdown(entry) {
  const frontmatter = [
    "---",
    `title: "${(entry.title || "").replace(/"/g, '\\"')}"`,
    `url: ${entry.url || ""}`,
    `fecha: ${entry.date.slice(0, 10)}`,
    `longitud: ${entry.length}`,
    "tags: []",
    "---",
    "",
  ].join("\n");
  return `${frontmatter}# ${entry.title || "Resumen"}\n\n${entry.summary}\n`;
}

function slugify(text) {
  return (text || "resumen")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
