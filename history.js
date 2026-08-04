// Digest — history.js

const els = {
  list: document.getElementById("historyList"),
  empty: document.getElementById("emptyMsg"),
  search: document.getElementById("searchInput"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  clearBtn: document.getElementById("clearBtn"),
};

let history = [];

init();

async function init() {
  const { digestHistory } = await chrome.storage.local.get("digestHistory");
  history = Array.isArray(digestHistory) ? digestHistory : [];
  render(history);

  els.search.addEventListener("input", () => {
    const q = els.search.value.trim().toLowerCase();
    if (!q) return render(history);
    const filtered = history.filter((e) => {
      const domain = safeDomain(e.url);
      return (e.title || "").toLowerCase().includes(q) || domain.includes(q);
    });
    render(filtered);
  });

  els.exportAllBtn.addEventListener("click", exportAll);
  els.clearBtn.addEventListener("click", clearHistory);
}

function render(entries) {
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
    url.textContent = entry.url || "";

    const summary = document.createElement("div");
    summary.className = "entry-summary md-content";
    if (window.marked) {
      summary.innerHTML = window.marked.parse(entry.summary || "");
    } else {
      summary.textContent = entry.summary || "";
    }

    if (entry.providerLabel) {
      const badge = document.createElement("span");
      badge.className = "provider-badge";
      badge.textContent = entry.fallbackUsed ? `vía ${entry.providerLabel} (fallback)` : `vía ${entry.providerLabel}`;
      header.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Ver / ocultar";
    toggleBtn.addEventListener("click", () => li.classList.toggle("expanded"));

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Exportar .md";
    exportBtn.addEventListener("click", () => exportEntry(entry));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Eliminar";
    deleteBtn.addEventListener("click", () => deleteEntry(entry.id));

    actions.appendChild(toggleBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(header);
    li.appendChild(url);
    li.appendChild(summary);
    li.appendChild(actions);
    els.list.appendChild(li);
  }
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
  const md = `${frontmatter}# ${entry.title || "Resumen"}\n\n${entry.summary}\n`;
  downloadBlob(md, `digest-${entry.date.slice(0, 10)}.md`, "text/markdown;charset=utf-8");
}

function exportAll() {
  downloadBlob(JSON.stringify(history, null, 2), `digest-historial-${Date.now()}.json`, "application/json");
}

async function deleteEntry(id) {
  history = history.filter((e) => e.id !== id);
  await chrome.storage.local.set({ digestHistory: history });
  render(history);
}

async function clearHistory() {
  if (!confirm("¿Borrar todo el historial de Digest? Esta acción no se puede deshacer.")) return;
  history = [];
  await chrome.storage.local.set({ digestHistory: [] });
  render(history);
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
}
