/* ==========================================================
   Study Together — app logic
   ========================================================== */

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const NAME_KEY = "studyTogetherName";
let myName = localStorage.getItem(NAME_KEY);
let myKey = null;

const SUBJECTS = ["chemistry", "physics", "maths"];
const SUBJECT_LABELS = { chemistry: "Chemistry", physics: "Physics", maths: "Maths" };
const USER_COLORS = ["#6366f1", "#f97316", "#22d3ee", "#a3e635", "#e879f9"];

/* ---------- helpers ---------- */
function sanitizeKey(name) {
  return name.trim().replace(/[.#$/\[\]]/g, "_");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function colorForUser(index) {
  return USER_COLORS[index % USER_COLORS.length];
}

/* ---------- name modal ---------- */
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const nameSubmit = document.getElementById("nameSubmit");
const nameError = document.getElementById("nameError");
const appEl = document.getElementById("app");
const whoamiName = document.getElementById("whoamiName");

let appStarted = false;

function showApp() {
  nameModal.classList.add("hidden");
  appEl.classList.remove("hidden");
  whoamiName.textContent = myName;
  myKey = sanitizeKey(myName);
  if (!appStarted) {
    appStarted = true;
    initChat();
    initScoreboard();
    initTimerDayWatch();
  } else {
    // name changed after app already running — re-bind day-dependent listeners
    initScoreboard();
    refreshMinutesToday();
  }
}

function trySubmitName() {
  const val = nameInput.value.trim();
  if (!val) { nameError.textContent = "Type a name so we know whose turn it is."; return; }
  if (val.length > 24) { nameError.textContent = "Keep it under 24 characters."; return; }
  myName = val;
  localStorage.setItem(NAME_KEY, myName);
  showApp();
}

nameSubmit.addEventListener("click", trySubmitName);
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") trySubmitName(); });

document.getElementById("changeNameBtn").addEventListener("click", () => {
  nameInput.value = myName || "";
  nameError.textContent = "";
  appEl.classList.add("hidden");
  nameModal.classList.remove("hidden");
  nameInput.focus();
});

if (myName) { showApp(); } else { nameInput.focus(); }

/* ---------- tabs ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "analysis") loadAnalysis();
  });
});

/* ==========================================================
   CHAT (with reply + edit)
   ========================================================== */
let replyDraft = null; // { key, name, text }
let editingKey = null;
let latestMessages = [];

function initChat() {
  const messagesEl = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const replyBanner = document.getElementById("replyBanner");
  const replyBannerText = document.getElementById("replyBannerText");
  const replyCancelBtn = document.getElementById("replyCancelBtn");

  function renderReplyBanner() {
    if (replyDraft) {
      replyBannerText.textContent = `Replying to ${replyDraft.name}: "${replyDraft.text}"`;
      replyBanner.classList.remove("hidden");
    } else {
      replyBanner.classList.add("hidden");
    }
  }

  function saveEdit(key, newText) {
    const text = newText.trim();
    if (!text) return;
    db.ref(`messages/${key}`).update({ text, edited: true });
    editingKey = null;
    renderMessages();
  }

  function renderMessages() {
    messagesEl.innerHTML = "";
    if (latestMessages.length === 0) {
      messagesEl.innerHTML = '<p class="empty-note">No messages yet — say hello.</p>';
      return;
    }

    latestMessages.forEach((m) => {
      const isMine = m.name === myName;
      const div = document.createElement("div");
      div.className = "msg " + (isMine ? "mine" : "theirs");

      let inner = `<span class="msg-meta">${escapeHtml(m.name)} · ${timeAgo(m.ts)}${m.edited ? ' <span class="msg-edited-tag">(edited)</span>' : ""}</span>`;
      if (m.replyTo) inner += `<div class="msg-quote">↳ ${escapeHtml(m.replyTo.name)}: ${escapeHtml(m.replyTo.text)}</div>`;

      if (editingKey === m.key) {
        inner += `
          <div class="msg-edit-row">
            <input type="text" class="edit-input" value="${escapeHtml(m.text)}" maxlength="500">
            <button class="btn tiny primary save-edit">Save</button>
            <button class="btn tiny cancel-edit">Cancel</button>
          </div>`;
      } else {
        inner += `<div class="msg-text">${escapeHtml(m.text)}</div>`;
        inner += `<div class="msg-actions"><button class="reply-btn">reply</button>${isMine ? '<button class="edit-btn">edit</button>' : ""}</div>`;
      }

      div.innerHTML = inner;
      messagesEl.appendChild(div);

      if (editingKey === m.key) {
        const editInput = div.querySelector(".edit-input");
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);
        div.querySelector(".save-edit").addEventListener("click", () => saveEdit(m.key, editInput.value));
        div.querySelector(".cancel-edit").addEventListener("click", () => { editingKey = null; renderMessages(); });
        editInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") saveEdit(m.key, editInput.value);
          if (e.key === "Escape") { editingKey = null; renderMessages(); }
        });
      } else {
        div.querySelector(".reply-btn").addEventListener("click", () => {
          replyDraft = { key: m.key, name: m.name, text: m.text.slice(0, 60) };
          renderReplyBanner();
          input.focus();
        });
        if (isMine) {
          div.querySelector(".edit-btn").addEventListener("click", () => { editingKey = m.key; renderMessages(); });
        }
      }
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  db.ref("messages").limitToLast(300).on("value", (snapshot) => {
    const entries = [];
    snapshot.forEach((child) => { entries.push({ key: child.key, ...child.val() }); });
    entries.sort((a, b) => a.ts - b.ts);
    latestMessages = entries;
    renderMessages();
  });

  replyCancelBtn.addEventListener("click", () => { replyDraft = null; renderReplyBanner(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const payload = { name: myName, text, ts: Date.now() };
    if (replyDraft) payload.replyTo = { name: replyDraft.name, text: replyDraft.text };
    db.ref("messages").push(payload);
    input.value = "";
    replyDraft = null;
    renderReplyBanner();
  });
}

/* ==========================================================
   TIMER — stopwatch with 10-minute focus check-ins
   ========================================================== */
const CIRCUMFERENCE = 2 * Math.PI * 100;
const CHECK_INTERVAL_SECONDS = 600; // 10 minutes

let running = false;
let elapsedSeconds = 0;      // this session, for display
let secondsSinceCredit = 0;  // toward next 1-minute DB credit
let secondsSinceCheck = 0;   // toward next check-in
let tickHandle = null;
let checkActive = false;
let currentDay = dayKey();

const timerDisplay = document.getElementById("timerDisplay");
const timerStateEl = document.getElementById("timerState");
const ringProgress = document.getElementById("ringProgress");
const startPauseBtn = document.getElementById("startPauseBtn");
const stopBtn = document.getElementById("stopBtn");
const sessionNote = document.getElementById("sessionNote");

ringProgress.style.strokeDasharray = CIRCUMFERENCE;

function formatElapsed(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function renderTimer() {
  timerDisplay.textContent = formatElapsed(elapsedSeconds);
  const fraction = secondsSinceCheck / CHECK_INTERVAL_SECONDS;
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(fraction, 1));
  ringProgress.classList.toggle("due", fraction > 0.85);
}

function creditMinute() {
  const key = `studyMinutes/${dayKey()}/${myKey}`;
  db.ref(key).transaction((current) => (current || 0) + 1);
}

function tick() {
  if (checkActive) return;
  elapsedSeconds++;
  secondsSinceCredit++;
  secondsSinceCheck++;

  if (secondsSinceCredit >= 60) {
    secondsSinceCredit -= 60;
    creditMinute();
  }
  if (secondsSinceCheck >= CHECK_INTERVAL_SECONDS) {
    secondsSinceCheck = 0;
    triggerCheck();
  }
  renderTimer();
}

function startTimer() {
  running = true;
  startPauseBtn.textContent = "Pause";
  timerStateEl.textContent = "studying";
  sessionNote.textContent = "";
  if (!tickHandle) tickHandle = setInterval(tick, 1000);
}

function pauseTimer() {
  running = false;
  startPauseBtn.textContent = "Resume";
  timerStateEl.textContent = "paused";
}

function stopTimer() {
  running = false;
  clearInterval(tickHandle);
  tickHandle = null;
  elapsedSeconds = 0;
  secondsSinceCredit = 0;
  secondsSinceCheck = 0;
  startPauseBtn.textContent = "Start";
  timerStateEl.textContent = "ready";
  sessionNote.textContent = "Session ended — logged to today's progress.";
  renderTimer();
}

startPauseBtn.addEventListener("click", () => {
  if (running) pauseTimer(); else startTimer();
});

stopBtn.addEventListener("click", stopTimer);

/* ---- 10-minute check-in ---- */
const checkModal = document.getElementById("checkModal");
const checkPrompt = document.getElementById("checkPrompt");
const checkOptions = document.getElementById("checkOptions");
const checkFeedback = document.getElementById("checkFeedback");

function generateCheckQuestion() {
  const a = Math.floor(Math.random() * 10) + 2; // 2-11
  const b = Math.floor(Math.random() * 10) + 2;
  const correct = a * b;
  const options = new Set([correct]);
  while (options.size < 4) {
    const offset = Math.floor(Math.random() * 24) - 12;
    const val = correct + offset;
    if (val > 0 && val !== correct) options.add(val);
  }
  const opts = Array.from(options).sort(() => Math.random() - 0.5);
  return { prompt: `${a} × ${b} = ?`, correct, opts };
}

function renderCheckQuestion(q, isRetry) {
  checkPrompt.textContent = q.prompt;
  checkFeedback.textContent = isRetry ? "Not quite — here's another one." : "";
  checkOptions.innerHTML = "";
  q.opts.forEach((val) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = val;
    btn.addEventListener("click", () => {
      if (val === q.correct) {
        checkModal.classList.add("hidden");
        checkActive = false;
        timerStateEl.textContent = running ? "studying" : "paused";
      } else {
        renderCheckQuestion(generateCheckQuestion(), true);
      }
    });
    checkOptions.appendChild(btn);
  });
}

function triggerCheck() {
  checkActive = true;
  timerStateEl.textContent = "check-in!";
  renderCheckQuestion(generateCheckQuestion(), false);
  checkModal.classList.remove("hidden");
}

renderTimer();

function refreshMinutesToday() {
  const day = dayKey();
  const minutesList = document.getElementById("minutesList");
  db.ref(`studyMinutes/${day}`).off();
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
      div.innerHTML = `<span class="mins-value">${formatMinutes(mins)}</span><span class="mins-name">${escapeHtml(name)}</span>`;
      minutesList.appendChild(div);
    });
  });
}

function initTimerDayWatch() {
  refreshMinutesToday();
  // Check once a minute whether the calendar day has rolled over past midnight,
  // and if so, point the "today" listeners at the new day automatically.
  setInterval(() => {
    const nowKey = dayKey();
    if (nowKey !== currentDay) {
      currentDay = nowKey;
      refreshMinutesToday();
    }
  }, 30000);
}

/* ==========================================================
   SCOREBOARD — Chemistry / Physics / Maths, per person
   Scores are stored dated (scores/{day}/{subject}/{userKey}) so the
   Analysis tab can chart them per day; totals here are the sum
   across every day on record.
   ========================================================== */
function sumScoresAcrossDays(data) {
  // data shape: { [day]: { [subject]: { [userKey]: count } } }
  const totals = {}; // { [subject]: { [userKey]: count } }
  SUBJECTS.forEach((s) => (totals[s] = {}));
  Object.values(data || {}).forEach((dayNode) => {
    SUBJECTS.forEach((s) => {
      const subjNode = dayNode[s] || {};
      Object.entries(subjNode).forEach(([user, count]) => {
        totals[s][user] = (totals[s][user] || 0) + count;
      });
    });
  });
  return totals;
}

function initScoreboard() {
  const scoreList = document.getElementById("scoreList");
  db.ref("scores").off();
  db.ref("scores").on("value", (snapshot) => {
    const raw = snapshot.val() || {};
    const totals = sumScoresAcrossDays(raw);

    const userKeys = new Set([myKey]);
    SUBJECTS.forEach((s) => Object.keys(totals[s]).forEach((k) => userKeys.add(k)));

    const sortedKeys = Array.from(userKeys).sort((a, b) => {
      if (a === myKey) return -1;
      if (b === myKey) return 1;
      return a.localeCompare(b);
    });

    scoreList.innerHTML = "";
    sortedKeys.forEach((key) => {
      const isMine = key === myKey;
      const displayName = isMine ? myName : key;
      const counts = SUBJECTS.map((s) => totals[s][key] || 0);
      const total = counts.reduce((a, b) => a + b, 0);

      const card = document.createElement("div");
      card.className = "score-card " + (isMine ? "mine" : "theirs");
      card.innerHTML = `
        <p class="score-name">${escapeHtml(isMine ? "You" : displayName)}</p>
        <p class="score-count">${total}</p>
        <div class="subject-rows">
          ${SUBJECTS.map((s, i) => `
            <div class="subject-row ${s}">
              <span class="subject-label">${SUBJECT_LABELS[s]}</span>
              <span class="subject-count">${counts[i]}</span>
              ${isMine ? `<span class="subject-actions">
                <button class="btn tiny add-q" data-subject="${s}">+1</button>
                <button class="btn tiny undo-q" data-subject="${s}">−1</button>
              </span>` : ""}
            </div>`).join("")}
        </div>
      `;
      scoreList.appendChild(card);

      if (isMine) {
        card.querySelectorAll(".add-q").forEach((btn) => {
          btn.addEventListener("click", () => {
            const today = dayKey();
            db.ref(`scores/${today}/${btn.dataset.subject}/${myKey}`).transaction((c) => (c || 0) + 1);
          });
        });
        card.querySelectorAll(".undo-q").forEach((btn) => {
          btn.addEventListener("click", () => {
            const today = dayKey();
            db.ref(`scores/${today}/${btn.dataset.subject}/${myKey}`).transaction((c) => Math.max(0, (c || 0) - 1));
          });
        });
      }
    });
  });
}

/* ==========================================================
   ANALYSIS — day-by-day bar charts, filterable by Week / Month,
   one color per person (matches the reference layout).
   ========================================================== */
const WEEK_OPTIONS = ["This week", "Last week", "2nd last", "3rd last", "4th last"];
const MONTH_OPTIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceCeil(value) {
  if (value <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * pow;
}

// Monday-start week. weeksBack=0 is the current week.
function daysForWeek(weeksBack) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow - weeksBack * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({ key: dayKey(d), label: String(d.getDate()).padStart(2, "0") });
  }
  return days;
}

// All days in the given month (0-11) of the current year,
// or last year if that month hasn't happened yet this year.
function daysForMonth(monthIndex) {
  const now = new Date();
  let year = now.getFullYear();
  if (monthIndex > now.getMonth()) year -= 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    days.push({ key: dayKey(d), label: String(day).padStart(2, "0") });
  }
  return days;
}

function createDayChartSection(sectionId, fetchValuesForDays) {
  const section = document.getElementById(sectionId);
  const weekPillRow = section.querySelector('[data-pills="week"]');
  const monthPillRow = section.querySelector('[data-pills="month"]');
  const yaxis = section.querySelector(".daychart-yaxis");
  const gridlines = section.querySelector(".daychart-gridlines");
  const barsEl = section.querySelector(".daychart-bars");
  const xaxis = section.querySelector(".daychart-xaxis");

  let state = { type: "week", index: 0 };

  weekPillRow.innerHTML = WEEK_OPTIONS.map((label, i) =>
    `<button class="pill" data-week="${i}">${label}</button>`).join("");
  monthPillRow.innerHTML = MONTH_OPTIONS.map((label, i) =>
    `<button class="pill" data-month="${i}">${label}</button>`).join("");

  function setActivePills() {
    weekPillRow.querySelectorAll(".pill").forEach((p) => {
      p.classList.toggle("active", state.type === "week" && Number(p.dataset.week) === state.index);
    });
    monthPillRow.querySelectorAll(".pill").forEach((p) => {
      p.classList.toggle("active", state.type === "month" && Number(p.dataset.month) === state.index);
    });
  }

  weekPillRow.querySelectorAll(".pill").forEach((p) => {
    p.addEventListener("click", () => { state = { type: "week", index: Number(p.dataset.week) }; render(); });
  });
  monthPillRow.querySelectorAll(".pill").forEach((p) => {
    p.addEventListener("click", () => { state = { type: "month", index: Number(p.dataset.month) }; render(); });
  });

  async function render() {
    setActivePills();
    const days = state.type === "week" ? daysForWeek(state.index) : daysForMonth(state.index);
    const valuesByDay = await fetchValuesForDays(days.map((d) => d.key)); // { dayKey: { userKey: value } }

    const allValues = days.flatMap((d) => Object.values(valuesByDay[d.key] || {}));
    const max = niceCeil(Math.max(1, ...allValues, 0));
    const tickCount = 5;

    yaxis.innerHTML = "";
    gridlines.innerHTML = "";
    for (let i = tickCount; i >= 0; i--) {
      const val = Math.round((max * i) / tickCount);
      const tick = document.createElement("span");
      tick.textContent = val;
      yaxis.appendChild(tick);
      gridlines.appendChild(document.createElement("span"));
    }

    const barWidth = days.length > 14 ? "18px" : "30px";

    barsEl.innerHTML = "";
    xaxis.innerHTML = "";
    days.forEach((d) => {
      const dayVals = valuesByDay[d.key] || {};
      const group = document.createElement("div");
      group.className = "day-group";
      group.style.width = barWidth;
      currentUsers.forEach((u, ui) => {
        const val = dayVals[u] || 0;
        const bar = document.createElement("div");
        bar.className = "day-bar";
        bar.style.background = colorForUser(ui);
        bar.style.height = `${Math.min(100, (val / max) * 100)}%`;
        bar.title = `${u === myKey ? "You" : u}: ${val}`;
        group.appendChild(bar);
      });
      barsEl.appendChild(group);

      const label = document.createElement("span");
      label.textContent = d.label;
      label.style.width = barWidth;
      xaxis.appendChild(label);
    });
  }

  render();
  return { render };
}

let currentUsers = [];
let timeChartSection = null;
let questionsChartSection = null;

async function discoverUsers() {
  const userKeys = new Set([myKey]);
  const [recentMinutes, allScores] = await Promise.all([
    db.ref("studyMinutes").limitToLast(14).once("value"),
    db.ref("scores").once("value"),
  ]);
  (recentMinutes.val() ? Object.values(recentMinutes.val()) : []).forEach((dayNode) => {
    Object.keys(dayNode || {}).forEach((k) => userKeys.add(k));
  });
  const scoreTotals = sumScoresAcrossDays(allScores.val() || {});
  SUBJECTS.forEach((s) => Object.keys(scoreTotals[s]).forEach((k) => userKeys.add(k)));

  return Array.from(userKeys).sort((a, b) => {
    if (a === myKey) return -1;
    if (b === myKey) return 1;
    return a.localeCompare(b);
  });
}

function renderLegend(users) {
  const legend = document.getElementById("userLegend");
  legend.innerHTML = users.map((u, i) => {
    const label = u === myKey ? "You" : u;
    return `<span class="legend-item"><span class="legend-dot" style="background:${colorForUser(i)}"></span>${escapeHtml(label)}</span>`;
  }).join("");
}

async function fetchMinutesForDays(dayKeys) {
  const reads = await Promise.all(dayKeys.map((k) => db.ref(`studyMinutes/${k}`).once("value")));
  const result = {};
  dayKeys.forEach((k, i) => { result[k] = reads[i].val() || {}; });
  return result;
}

async function fetchQuestionsForDays(dayKeys) {
  const reads = await Promise.all(dayKeys.map((k) => db.ref(`scores/${k}`).once("value")));
  const result = {};
  dayKeys.forEach((k, i) => {
    const dayNode = reads[i].val() || {};
    const perUser = {};
    SUBJECTS.forEach((s) => {
      Object.entries(dayNode[s] || {}).forEach(([user, count]) => {
        perUser[user] = (perUser[user] || 0) + count;
      });
    });
    result[k] = perUser;
  });
  return result;
}

async function loadAnalysis() {
  currentUsers = await discoverUsers();
  renderLegend(currentUsers);
  if (!timeChartSection) {
    timeChartSection = createDayChartSection("section-time", fetchMinutesForDays);
    questionsChartSection = createDayChartSection("section-questions", fetchQuestionsForDays);
  } else {
    timeChartSection.render();
    questionsChartSection.render();
  }
}
