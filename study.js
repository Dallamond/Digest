// Digest — study.js
// Sesión de estudio interactiva sobre las flashcards de un resumen: una
// tarjeta a la vez, revelar respuesta, autoevaluación (sabía / no sabía),
// resumen final con opción de repetir solo las falladas.

const els = {
  sourceTitle: document.getElementById("sourceTitle"),
  loadError: document.getElementById("loadError"),
  studyPanel: document.getElementById("studyPanel"),
  summaryPanel: document.getElementById("summaryPanel"),

  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),

  card: document.getElementById("card"),
  cardLabel: document.getElementById("cardLabel"),
  cardQuestion: document.getElementById("cardQuestion"),
  cardAnswer: document.getElementById("cardAnswer"),

  revealRow: document.getElementById("revealRow"),
  revealBtn: document.getElementById("revealBtn"),
  assessRow: document.getElementById("assessRow"),
  knowBtn: document.getElementById("knowBtn"),
  dontKnowBtn: document.getElementById("dontKnowBtn"),

  summaryText: document.getElementById("summaryText"),
  retryFailedBtn: document.getElementById("retryFailedBtn"),
  restartBtn: document.getElementById("restartBtn"),
};

let allCards = [];
let sourceTitleText = "";
let session = null; // { cards, index, revealed, known: [], failed: [] }

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  const { digestHistory } = await chrome.storage.local.get("digestHistory");
  const history = Array.isArray(digestHistory) ? digestHistory : [];
  const entry = history.find((e) => e.id === id);

  if (!entry || !entry.flashcards || entry.flashcards.length === 0) {
    els.loadError.hidden = false;
    return;
  }

  allCards = entry.flashcards;
  sourceTitleText = entry.title || "";
  els.sourceTitle.textContent = sourceTitleText ? `Sobre: ${sourceTitleText}` : "";

  els.revealBtn.addEventListener("click", reveal);
  els.knowBtn.addEventListener("click", () => answer(true));
  els.dontKnowBtn.addEventListener("click", () => answer(false));
  els.retryFailedBtn.addEventListener("click", retryFailed);
  els.restartBtn.addEventListener("click", () => startSession(shuffle(allCards.slice())));

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    if (!els.studyPanel.hidden && els.revealRow.hidden === false) reveal();
  });

  startSession(shuffle(allCards.slice()));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startSession(cards) {
  session = { cards, index: 0, known: [], failed: [] };
  els.summaryPanel.hidden = true;
  els.loadError.hidden = true;
  els.studyPanel.hidden = false;
  renderCard();
}

function renderCard() {
  const { cards, index } = session;
  const card = cards[index];

  els.cardQuestion.textContent = card.q;
  els.cardAnswer.textContent = card.a;
  els.cardAnswer.hidden = true;
  els.cardLabel.textContent = "Pregunta";

  els.revealRow.hidden = false;
  els.assessRow.hidden = true;

  const pct = Math.round((index / cards.length) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `${index + 1} / ${cards.length}`;
}

function reveal() {
  els.cardAnswer.hidden = false;
  els.cardLabel.textContent = "Respuesta";
  els.revealRow.hidden = true;
  els.assessRow.hidden = false;
}

function answer(knew) {
  const card = session.cards[session.index];
  if (knew) session.known.push(card);
  else session.failed.push(card);

  session.index += 1;
  if (session.index >= session.cards.length) {
    finishSession();
  } else {
    renderCard();
  }
}

function finishSession() {
  els.progressFill.style.width = "100%";
  els.progressText.textContent = `${session.cards.length} / ${session.cards.length}`;
  els.studyPanel.hidden = true;
  els.summaryPanel.hidden = false;

  const total = session.cards.length;
  const knownCount = session.known.length;
  const failedCount = session.failed.length;

  els.summaryText.textContent =
    failedCount === 0
      ? `¡Perfecto! Te sabías las ${total} tarjetas.`
      : `Te sabías ${knownCount} de ${total}. ${failedCount} para repasar.`;

  els.retryFailedBtn.hidden = failedCount === 0;
  els.retryFailedBtn.textContent = `Repetir solo las falladas (${failedCount})`;
}

function retryFailed() {
  if (!session || session.failed.length === 0) return;
  startSession(shuffle(session.failed.slice()));
}
