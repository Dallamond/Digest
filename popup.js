// Digest — popup.js

const els = {
  status: document.getElementById("status"),
  statusSpinner: document.getElementById("statusSpinner"),
  statusText: document.getElementById("statusText"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("resultTitle"),
  resultUrl: document.getElementById("resultUrl"),
  resultProvider: document.getElementById("resultProvider"),
  resultKind: document.getElementById("resultKind"),
  resultText: document.getElementById("resultText"),
  summarizePage: document.getElementById("summarizePage"),
  summarizeSelection: document.getElementById("summarizeSelection"),
  addToQueue: document.getElementById("addToQueue"),
  importPdfBtn: document.getElementById("importPdfBtn"),
  pdfFileInput: document.getElementById("pdfFileInput"),
  wantFlashcards: document.getElementById("wantFlashcards"),
  flashcardsSection: document.getElementById("flashcardsSection"),
  flashcardsCount: document.getElementById("flashcardsCount"),
  useFlashcardsLink: document.getElementById("useFlashcardsLink"),
  flashcardsError: document.getElementById("flashcardsError"),
  exportAnkiBtn: document.getElementById("exportAnkiBtn"),
  copyBtn: document.getElementById("copyBtn"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  exportPdfLink: document.getElementById("exportPdfLink"),
  openOptions: document.getElementById("openOptions"),
  summaryType: document.getElementById("summaryType"),
};

let currentEntry = null;

init();

async function init() {
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.summarizePage.addEventListener("click", () => handleSummarize("page"));
  els.summarizeSelection.addEventListener("click", () => handleSummarize("selection"));
  els.addToQueue.addEventListener("click", handleAddToQueue);
  els.importPdfBtn.addEventListener("click", () => els.pdfFileInput.click());
  els.pdfFileInput.addEventListener("change", handleImportPdf);
  els.copyBtn.addEventListener("click", handleCopy);
  els.exportMdBtn.addEventListener("click", handleExport);
  els.exportAnkiBtn.addEventListener("click", handleExportAnki);

  await loadSummaryTypes();

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

async function loadSummaryTypes() {
  const response = await chrome.runtime.sendMessage({ type: "digest-get-summary-types" });
  const types = (response && response.ok && response.types) || [];
  els.summaryType.innerHTML = "";
  types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    els.summaryType.appendChild(opt);
  });
  // "medio" es el valor por defecto histórico si existe entre los tipos.
  if (types.some((t) => t.id === "medio")) els.summaryType.value = "medio";
}

function getSelectedSummaryType() {
  return els.summaryType.value || (els.summaryType.options[0] && els.summaryType.options[0].value) || "medio";
}

async function handleSummarize(source) {
  setButtonsDisabled(true);
  showStatus(source === "page" ? "Extrayendo y resumiendo la página…" : "Resumiendo selección…", false, true);
  els.result.hidden = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "digest-summarize",
      source,
      summaryTypeId: getSelectedSummaryType(),
      wantFlashcards: els.wantFlashcards.checked,
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

async function handleAddToQueue() {
  els.addToQueue.disabled = true;
  const original = els.addToQueue.textContent;
  showStatus("Añadiendo página a la cola…", false, true);

  try {
    const response = await chrome.runtime.sendMessage({ type: "digest-queue-add" });
    if (!response || !response.ok) {
      showStatus((response && response.error) || "No se pudo añadir a la cola.", true);
      return;
    }
    els.addToQueue.textContent = "Añadida ✓";
    showStatus(`"${response.item.title}" guardada en la cola. Procésala desde "Ver cola" cuando quieras.`, false);
    setTimeout(() => (els.addToQueue.textContent = original), 1500);
  } catch (err) {
    showStatus(String(err && err.message ? err.message : err), true);
  } finally {
    els.addToQueue.disabled = false;
  }
}

// Convierte el archivo a base64 (sin el prefijo "data:...;base64,"). Se
// manda como string por mensajería en vez de como ArrayBuffer: chrome.runtime.
// sendMessage no serializa tipos binarios de forma fiable entre popup y
// background, y con string no hay ambigüedad posible.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

async function handleImportPdf(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // permite reimportar el mismo archivo si hace falta
  if (!file) return;

  setButtonsDisabled(true);
  els.importPdfBtn.disabled = true;
  showStatus(`Leyendo "${file.name}"…`, false, true);
  els.result.hidden = true;

  try {
    const base64 = await fileToBase64(file);
    const response = await chrome.runtime.sendMessage({
      type: "digest-summarize-pdf-file",
      base64,
      fileName: file.name,
      summaryTypeId: getSelectedSummaryType(),
      wantFlashcards: els.wantFlashcards.checked,
    });

    if (!response || !response.ok) {
      showStatus((response && response.error) || "No se pudo procesar el PDF.", true);
      return;
    }

    showResult(response.entry);
    hideStatus();
  } catch (err) {
    showStatus(String(err && err.message ? err.message : err), true);
  } finally {
    setButtonsDisabled(false);
    els.importPdfBtn.disabled = false;
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

  els.resultKind.hidden = entry.kind !== "pdf";

  els.exportPdfLink.href = `print.html?id=${encodeURIComponent(entry.id)}&auto=1`;

  renderFlashcards(entry);
  els.result.hidden = false;
}

function renderFlashcards(entry) {
  if (entry.flashcards && entry.flashcards.length > 0) {
    els.flashcardsSection.hidden = false;
    els.flashcardsCount.textContent = `${entry.flashcards.length} flashcards generadas`;
    els.useFlashcardsLink.href = `study.html?id=${encodeURIComponent(entry.id)}`;
  } else {
    els.flashcardsSection.hidden = true;
  }

  if (entry.flashcardsError) {
    els.flashcardsError.hidden = false;
    els.flashcardsError.textContent = `No se pudieron generar las flashcards: ${entry.flashcardsError}`;
  } else {
    els.flashcardsError.hidden = true;
  }
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

function showStatus(text, isError, loading) {
  els.statusText.textContent = text;
  els.status.hidden = false;
  els.status.classList.toggle("error", !!isError);
  els.statusSpinner.hidden = !loading || !!isError;
}

function hideStatus() {
  els.status.hidden = true;
}

function setButtonsDisabled(disabled) {
  els.summarizePage.disabled = disabled;
  els.summarizeSelection.disabled = disabled;
  els.addToQueue.disabled = disabled;
  els.importPdfBtn.disabled = disabled;
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
  downloadBlob(md, `digest-${slugify(currentEntry.title)}-${currentEntry.date.slice(0, 10)}.md`, "text/markdown;charset=utf-8");
}

function handleExportAnki() {
  if (!currentEntry || !currentEntry.flashcards || currentEntry.flashcards.length === 0) return;
  const csv = buildAnkiCSV(currentEntry.flashcards);
  downloadBlob(csv, `digest-flashcards-${slugify(currentEntry.title)}.csv`, "text/csv;charset=utf-8");
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
  let body = `${frontmatter}# ${entry.title || "Resumen"}\n\n${entry.summary}\n`;
  if (entry.flashcards && entry.flashcards.length > 0) {
    body += `\n## Flashcards\n\n`;
    body += entry.flashcards.map((c) => `**P:** ${c.q}\n**R:** ${c.a}`).join("\n\n");
    body += "\n";
  }
  return body;
}

// Formato Anki: CSV de dos columnas (pregunta;respuesta), importable
// directamente en Anki eligiendo ";" como separador de campos.
function buildAnkiCSV(flashcards) {
  const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return flashcards.map((c) => `${escape(c.q)};${escape(c.a)}`).join("\n");
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
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
