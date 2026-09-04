/* ==========================================================
   Study Together — app logic
   ========================================================== */

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const NAME_KEY = "studyTogetherName";
let myName = localStorage.getItem(NAME_KEY);

/* ---------- helpers ---------- */
function sanitizeKey(name) {
  // Firebase keys can't contain . # $ [ ] /
  return name.trim().replace(/[.#$/\[\]]/g, "_");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/* ---------- name modal ---------- */
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const nameSubmit = document.getElementById("nameSubmit");
const nameError = document.getElementById("nameError");
const appEl = document.getElementById("app");
const whoamiName = document.getElementById("whoamiName");

function showApp() {
  nameModal.classList.add("hidden");
  appEl.classList.remove("hidden");
  whoamiName.textContent = myName;
  initChat();
  initScoreboard();
  initTimerSync();
}

function trySubmitName() {
  const val = nameInput.value.trim();
  if (!val) {
    nameError.textContent = "Type a name so we know whose turn it is.";
    return;
  }
  if (val.length > 24) {
    nameError.textContent = "Keep it under 24 characters.";
    return;
  }
  myName = val;
  localStorage.setItem(NAME_KEY, myName);
  showApp();
}

nameSubmit.addEventListener("click", trySubmitName);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") trySubmitName();
});

document.getElementById("changeNameBtn").addEventListener("click", () => {
  nameInput.value = myName || "";
  nameError.textContent = "";
  appEl.classList.add("hidden");
  nameModal.classList.remove("hidden");
  nameInput.focus();
});

if (myName) {
  showApp();
} else {
  nameInput.focus();
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ==========================================================
   CHAT
   ========================================================== */
function initChat() {
  const messagesEl = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");

  const messagesRef = db.ref("messages").limitToLast(300);

  messagesRef.on("value", (snapshot) => {
    const data = snapshot.val();
    messagesEl.innerHTML = "";
    if (!data) {
      messagesEl.innerHTML = '<p class="empty-note">No notes on the board yet. Say hello.</p>';
      return;
    }
    const entries = Object.values(data).sort((a, b) => a.ts - b.ts);
    entries.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + (m.name === myName ? "mine" : "theirs");
      div.innerHTML = `<span class="msg-meta">${escapeHtml(m.name)} · ${timeAgo(m.ts)}</span>${escapeHtml(m.text)}`;
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    db.ref("messages").push({
      name: myName,
      text: text,
      ts: Date.now()
    });
    input.value = "";
  });
}

/* ==========================================================
   TIMER
   ========================================================== */
const CIRCUMFERENCE = 2 * Math.PI * 100; // r=100

let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;

const timerDisplay = document.getElementById("timerDisplay");
const timerStateEl = document.getElementById("timerState");
const ringProgress = document.getElementById("ringProgress");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const sessionNote = document.getElementById("sessionNote");
const customMinsInput = document.getElementById("customMins");
const customSetBtn = document.getElementById("customSetBtn");

ringProgress.style.strokeDasharray = CIRCUMFERENCE;

function renderTimer() {
  const mins = Math.floor(remainingSeconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(remainingSeconds % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${mins}:${secs}`;
  const fraction = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
}

function setPreset(mins) {
  if (isRunning) return;
  totalSeconds = mins * 60;
  remainingSeconds = totalSeconds;
  sessionNote.textContent = "";
  renderTimer();
}

document.querySelectorAll(".preset").forEach((btn) => {
  btn.addEventListener("click", () => setPreset(parseInt(btn.dataset.mins, 10)));
});

customSetBtn.addEventListener("click", () => {
  const v = parseInt(customMinsInput.value, 10);
  if (!v || v < 1 || v > 180) {
    sessionNote.textContent = "Pick a length between 1 and 180 minutes.";
    return;
  }
  setPreset(v);
});

function tick() {
  remainingSeconds -= 1;
  if (remainingSeconds <= 0) {
    remainingSeconds = 0;
    renderTimer();
    finishSession(true);
    return;
  }
  renderTimer();
}

function startTimer() {
  isRunning = true;
  startPauseBtn.textContent = "Pause";
  timerStateEl.textContent = "studying";
  sessionNote.textContent = "";
  timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
  isRunning = false;
  startPauseBtn.textContent = "Resume";
  timerStateEl.textContent = "paused";
  clearInterval(timerInterval);
  logElapsedMinutes();
}

function finishSession(completed) {
  isRunning = false;
  clearInterval(timerInterval);
  startPauseBtn.textContent = "Start";
  timerStateEl.textContent = completed ? "session complete" : "ready";
  if (completed) {
    sessionNote.textContent = "Nice work — session logged.";
    logElapsedMinutes(Math.round(totalSeconds / 60));
    remainingSeconds = totalSeconds;
    renderTimer();
  }
}

startPauseBtn.addEventListener("click", () => {
  if (!isRunning && remainingSeconds === 0) {
    remainingSeconds = totalSeconds;
  }
  if (isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

resetBtn.addEventListener("click", () => {
  clearInterval(timerInterval);
  isRunning = false;
  logElapsedMinutes();
  remainingSeconds = totalSeconds;
  startPauseBtn.textContent = "Start";
  timerStateEl.textContent = "ready";
  sessionNote.textContent = "";
  renderTimer();
});

// track minutes actually studied this "run" so pausing logs partial credit
let sessionStartRemaining = null;

function logElapsedMinutes(forceMinutes) {
  let mins = forceMinutes;
  if (mins === undefined) {
    if (sessionStartRemaining === null) return;
    const elapsedSec = sessionStartRemaining - remainingSeconds;
    mins = Math.floor(elapsedSec / 60);
    sessionStartRemaining = null;
  }
  if (!mins || mins <= 0) return;
  const key = sanitizeKey(myName);
  const day = todayKey();
  const ref = db.ref(`studyMinutes/${day}/${key}`);
  ref.transaction((current) => (current || 0) + mins);
}

// hook: remember starting point whenever a run begins
const originalStart = startTimer;
startTimer = function () {
  if (sessionStartRemaining === null) sessionStartRemaining = remainingSeconds;
  originalStart();
};

renderTimer();

function initTimerSync() {
  const day = todayKey();
  const minutesList = document.getElementById("minutesList");
  db.ref(`studyMinutes/${day}`).on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data || Object.keys(data).length === 0) {
      minutesList.innerHTML = '<p class="empty-note">Start a session to log your first minutes.</p>';
      return;
    }
    minutesList.innerHTML = "";
    Object.entries(data).forEach(([name, mins]) => {
      const div = document.createElement("div");
      div.className = "minutes-item";
      div.innerHTML = `<span class="mins-value">${mins}</span><span class="mins-name">${escapeHtml(name)} min today</span>`;
      minutesList.appendChild(div);
    });
  });
}

/* ==========================================================
   SCOREBOARD
   ========================================================== */
function buildTally(count) {
  const groups = [];
  let remaining = count;
  while (remaining > 0) {
    const take = Math.min(5, remaining);
    groups.push(take);
    remaining -= take;
  }
  return groups
    .map((n) => {
      const struck = n === 5 ? "struck" : "";
      const strokes = Array.from({ length: Math.min(n, 4) })
        .map(() => '<span class="tally-stroke"></span>')
        .join("");
      return `<span class="tally-group ${struck}">${strokes}</span>`;
    })
    .join("");
}

function initScoreboard() {
  const scoreList = document.getElementById("scoreList");
  const myKey = sanitizeKey(myName);

  db.ref("scores").on("value", (snapshot) => {
    const data = snapshot.val() || {};
    // ensure my own card always exists, even at 0
    if (!(myKey in data)) data[myKey] = 0;

    const entries = Object.entries(data);
    // sort: me first, then alphabetically
    entries.sort((a, b) => {
      if (a[0] === myKey) return -1;
      if (b[0] === myKey) return 1;
      return a[0].localeCompare(b[0]);
    });

    scoreList.innerHTML = "";
    entries.forEach(([key, count]) => {
      const isMine = key === myKey;
      const displayName = isMine ? myName : key;
      const card = document.createElement("div");
      card.className = "score-card " + (isMine ? "mine" : "theirs");
      card.innerHTML = `
        <p class="score-name">${escapeHtml(isMine ? "You" : displayName)}</p>
        <p class="score-count">${count || 0}</p>
        <div class="tally-marks">${buildTally(count || 0)}</div>
        <div class="score-actions">
          ${isMine ? '<button class="chalk-btn primary add-question">+1 question</button><button class="chalk-btn undo-question">undo</button>' : ""}
        </div>
      `;
      scoreList.appendChild(card);

      if (isMine) {
        card.querySelector(".add-question").addEventListener("click", () => {
          db.ref(`scores/${myKey}`).transaction((c) => (c || 0) + 1);
        });
        card.querySelector(".undo-question").addEventListener("click", () => {
          db.ref(`scores/${myKey}`).transaction((c) => Math.max(0, (c || 0) - 1));
        });
      }
    });
  });
}
