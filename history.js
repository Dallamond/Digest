// Digest — history.js
// Dos pestañas: Historial (resúmenes ya generados) y Cola de lectura
// (páginas guardadas para resumir más tarde, procesables una a una o todas
// de golpe).

const els = {
  tabHistory: document.getElementById("tabHistory"),
  tabQueue: document.getElementById("tabQueue"),
  historyPanel: document.getElementById("historyPanel"),
  queuePanel: document.getElementById("queuePanel"),
  historyActions: document.getElementById("historyActions"),
  queueActions: document.getElementById("queueActions"),
  queueCount: document.getElementById("queueCount"),

  list: document.getElementById("historyList"),
  empty: document.getElementById("emptyMsg"),
  search: document.getElementById("searchInput"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  clearBtn: document.getElementById("clearBtn"),

  queueList: document.getElementById("queueList"),
  emptyQueue: document.getElementById("emptyQueueMsg"),
  queueWantFlashcards: document.getElementById("queueWantFlashcards"),
  processAllBtn: document.getElementById("processAllBtn"),
  queueSummaryType: document.getElementById("queueSummaryType"),
};

let history = [];
let queue = [];

init();

async function init() {
  await Promise.all([loadHistory(), loadQueue(), loadSummaryTypes()]);
  renderHistory(history);
  renderQueue();

  els.tabHistory.addEventListener("click", () => switchTab("history"));
  els.tabQueue.addEventListener("click", () => switchTab("queue"));
  if (location.hash === "#queue") switchTab("queue");

  els.search.addEventListener("input", () => {
    const q = els.search.value.trim().toLowerCase();
    if (!q) return renderHistory(history);
    const filtered = history.filter((e) => {
      const domain = safeDomain(e.url);
      return (e.title || "").toLowerCase().includes(q) || domain.includes(q);
    });
    renderHistory(filtered);
  });

  els.exportAllBtn.addEventListener("click", exportAll);
  els.clearBtn.addEventListener("click", clearHistory);
  els.processAllBtn.addEventListener("click", processAllQueue);
}

function switchTab(tab) {
  const isHistory = tab === "history";
  els.tabHistory.classList.toggle("active", isHistory);
  els.tabQueue.classList.toggle("active", !isHistory);
  els.historyPanel.hidden = !isHistory;
  els.queuePanel.hidden = isHistory;
  els.historyActions.hidden = !isHistory;
  els.queueActions.hidden = isHistory;
}

// ---------- Historial ----------

async function loadHistory() {
  const { digestHistory } = await chrome.storage.local.get("digestHistory");
  history = Array.isArray(digestHistory) ? digestHistory : [];
}

function renderHistory(entries) {
  els.list.innerHTML = "";
  els.empty.hidden = entries.length > 0;

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "entry";

    const header = document.createElement("div");
    header.className = "entry-header";

    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = entry.title || "(sin título)";

    const metaRight = document.createElement("span");
    metaRight.className = "entry-meta-right";

    const date = document.createElement("span");
    date.className = "entry-date";
    date.textContent = new Date(entry.date).toLocaleString();
    metaRight.appendChild(date);

    if (entry.kind === "pdf") {
      const kindBadge = document.createElement("span");
      kindBadge.className = "provider-badge";
      kindBadge.textContent = "📄 PDF";
      metaRight.appendChild(kindBadge);
    }

    if (entry.providerLabel) {
      const badge = document.createElement("span");
      badge.className = "provider-badge";
      badge.textContent = entry.fallbackUsed ? `vía ${entry.providerLabel} (fallback)` : `vía ${entry.providerLabel}`;
      metaRight.appendChild(badge);
    }

    header.appendChild(title);
    header.appendChild(metaRight);

    const url = document.createElement("a");
    url.className = "entry-url";
    url.href = entry.url || "#";
    url.target = "_blank";
    url.rel = "noopener";
    url.textContent = entry.url || "(archivo local, sin URL)";
    if (!entry.url) url.addEventListener("click", (e) => e.preventDefault());

    const summary = document.createElement("div");
    summary.className = "entry-summary md-content";
    if (window.marked) {
      summary.innerHTML = window.marked.parse(entry.summary || "");
    } else {
      summary.textContent = entry.summary || "";
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Ver / ocultar";
    toggleBtn.addEventListener("click", () => li.classList.toggle("expanded"));

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Exportar .md";
    exportBtn.addEventListener("click", () => exportEntry(entry));

    const exportPdfLink = document.createElement("a");
    exportPdfLink.className = "button-link";
    exportPdfLink.href = `print.html?id=${encodeURIComponent(entry.id)}&auto=1`;
    exportPdfLink.target = "_blank";
    exportPdfLink.textContent = "Exportar PDF";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", () => deleteEntry(entry.id));

    actions.appendChild(toggleBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(exportPdfLink);

    if (entry.flashcards && entry.flashcards.length > 0) {
      const useLink = document.createElement("a");
      useLink.className = "button-link primary-link";
      useLink.href = `study.html?id=${encodeURIComponent(entry.id)}`;
      useLink.target = "_blank";
      useLink.textContent = "Usar flashcards →";
      actions.appendChild(useLink);

      const ankiBtn = document.createElement("button");
      ankiBtn.textContent = "Flashcards → Anki";
      ankiBtn.addEventListener("click", () => exportAnki(entry));
      actions.appendChild(ankiBtn);
    }

    actions.appendChild(deleteBtn);

    li.appendChild(header);
    li.appendChild(url);
    li.appendChild(summary);

    if (entry.flashcards && entry.flashcards.length > 0) {
      const fcTitle = document.createElement("div");
      fcTitle.className = "flashcards-title";
      fcTitle.textContent = `Flashcards (${entry.flashcards.length})`;
      const fcList = document.createElement("div");
      fcList.className = "flashcards-list";
      entry.flashcards.forEach((card) => fcList.appendChild(buildFlashcardEl(card)));
      li.appendChild(fcTitle);
      li.appendChild(fcList);
    }

    li.appendChild(actions);
    els.list.appendChild(li);
  }
}

function buildFlashcardEl(card) {
  const wrap = document.createElement("div");
  wrap.className = "flashcard";
  const q = document.createElement("div");
  q.className = "flashcard-q";
  q.textContent = card.q;
  const a = document.createElement("div");
  a.className = "flashcard-a";
  a.textContent = card.a;
  wrap.appendChild(q);
  wrap.appendChild(a);
  wrap.addEventListener("click", () => wrap.classList.toggle("revealed"));
  return wrap;
}

function safeDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function exportEntry(entry) {
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
  downloadBlob(body, `digest-${entry.date.slice(0, 10)}.md`, "text/markdown;charset=utf-8");
}

function exportAnki(entry) {
  const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const csv = entry.flashcards.map((c) => `${escape(c.q)};${escape(c.a)}`).join("\n");
  downloadBlob(csv, `digest-flashcards-${entry.date.slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

function exportAll() {
  downloadBlob(JSON.stringify(history, null, 2), `digest-historial-${Date.now()}.json`, "application/json");
}

async function deleteEntry(id) {
  history = history.filter((e) => e.id !== id);
  await chrome.storage.local.set({ digestHistory: history });
  renderHistory(history);
}

async function clearHistory() {
  if (!confirm("¿Borrar todo el historial de Digest? Esta acción no se puede deshacer.")) return;
  history = [];
  await chrome.storage.local.set({ digestHistory: [] });
  renderHistory(history);
}

// ---------- Cola de lectura ----------

async function loadQueue() {
  const { digestQueue } = await chrome.storage.local.get("digestQueue");
  queue = Array.isArray(digestQueue) ? digestQueue : [];
}

async function loadSummaryTypes() {
  const response = await chrome.runtime.sendMessage({ type: "digest-get-summary-types" });
  const types = (response && response.ok && response.types) || [];
  els.queueSummaryType.innerHTML = "";
  types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    els.queueSummaryType.appendChild(opt);
  });
  if (types.some((t) => t.id === "medio")) els.queueSummaryType.value = "medio";
}

function getQueueSummaryType() {
  return els.queueSummaryType.value || (els.queueSummaryType.options[0] && els.queueSummaryType.options[0].value) || "medio";
}

function renderQueue() {
  els.queueList.innerHTML = "";
  els.emptyQueue.hidden = queue.length > 0;
  els.queueCount.hidden = queue.length === 0;
  els.queueCount.textContent = queue.length;

  for (const item of queue) {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.dataset.id = item.id;

    const header = document.createElement("div");
    header.className = "entry-header";

    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = item.title || "(sin título)";

    const date = document.createElement("span");
    date.className = "entry-date";
    date.textContent = new Date(item.dateAdded).toLocaleString();

    header.appendChild(title);
    header.appendChild(date);

    const url = document.createElement("a");
    url.className = "entry-url";
    url.href = item.url || "#";
    url.target = "_blank";
    url.rel = "noopener";
    url.textContent = item.url || "";

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const processBtn = document.createElement("button");
    processBtn.textContent = "Resumir ahora";
    processBtn.addEventListener("click", () => processQueueItem(item.id, processBtn, /* switchOnSuccess */ true));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Quitar de la cola";
    removeBtn.addEventListener("click", () => removeFromQueue(item.id));

    actions.appendChild(processBtn);
    actions.appendChild(removeBtn);

    const status = document.createElement("div");
    status.className = "queue-item-status";
    status.hidden = true;

    li.appendChild(header);
    li.appendChild(url);
    li.appendChild(actions);
    li.appendChild(status);
    els.queueList.appendChild(li);
  }
}

async function processQueueItem(id, btn, switchOnSuccess) {
  const li = document.querySelector(`.queue-item[data-id="${id}"]`);
  const status = li ? li.querySelector(".queue-item-status") : null;
  if (btn) btn.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Resumiendo…";
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "digest-queue-process",
      id,
      summaryTypeId: getQueueSummaryType(),
      wantFlashcards: els.queueWantFlashcards.checked,
    });

    if (!response || !response.ok) {
      if (status) {
        status.textContent = `❌ ${(response && response.error) || "Error al resumir."}`;
        status.classList.add("error");
      }
      if (btn) btn.disabled = false;
      return;
    }

    queue = queue.filter((q) => q.id !== id);
    history.unshift(response.entry);
    renderQueue();
    renderHistory(history);
    if (switchOnSuccess) switchTab("history");
  } catch (err) {
    if (status) {
      status.hidden = false;
      status.textContent = `❌ ${String(err && err.message ? err.message : err)}`;
      status.classList.add("error");
    }
    if (btn) btn.disabled = false;
  }
}

async function removeFromQueue(id) {
  queue = queue.filter((q) => q.id !== id);
  await chrome.storage.local.set({ digestQueue: queue });
  renderQueue();
}

async function processAllQueue() {
  if (queue.length === 0) return;
  els.processAllBtn.disabled = true;
  const ids = queue.map((q) => q.id);

  for (const id of ids) {
    // Secuencial a propósito: evita disparar N peticiones simultáneas al
    // mismo proveedor (rate limits de los tiers gratuitos) y deja ver el
    // progreso item a item.
    await processQueueItem(id, null);
  }

  els.processAllBtn.disabled = false;
}

// ---------- Utilidades compartidas ----------

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
}
