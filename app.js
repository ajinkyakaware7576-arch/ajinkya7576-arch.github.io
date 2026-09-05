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
    try { initChat(); } catch (err) { console.error("Chat init failed:", err); }
    try { initScoreboard(); } catch (err) { console.error("Scoreboard init failed:", err); }
    try { initTimerDayWatch(); } catch (err) { console.error("Timer init failed:", err); }
  } else {
    // name changed after app already running — reload everything under the new identity
    try { initScoreboard(); } catch (err) { console.error("Scoreboard init failed:", err); }
    try {
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
      running = false;
      baselineSeconds = 0;
      runStartAt = null;
      initTimerDayWatch();
    } catch (err) { console.error("Timer reload failed:", err); }
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
   TIMER — persistent daily total (not a per-session stopwatch).
   The clock shows today's accumulated study time; Start resumes
   counting from wherever it's frozen, Stop freezes it again.
   Every 20 minutes of active running, a tap-5-times check-in
   confirms someone's still there; missing it ends the session.
   ========================================================== */
const CHECK_INTERVAL_SECONDS = 1200; // 20 minutes
const CHECK_WINDOW_SECONDS = 60;
const TAPS_REQUIRED = 5;

let running = false;
let baselineSeconds = 0;   // frozen accumulated seconds for today
let runStartAt = null;     // client timestamp (ms) when the current run began
let tickHandle = null;
let secondsSinceCheck = 0; // toward next 20-min check-in
let checkActive = false;
let checkCountdownHandle = null;
let tapCount = 0;
let currentDay = dayKey();
let friendKey = null;
let friendTickHandle = null;

const fcHours = document.getElementById("fcHours");
const fcMinutes = document.getElementById("fcMinutes");
const fcSeconds = document.getElementById("fcSeconds");
const timerStateEl = document.getElementById("timerState");
const startStopBtn = document.getElementById("startStopBtn");
const sessionNote = document.getElementById("sessionNote");
const friendClockLabel = document.getElementById("friendClockLabel");
const friendClockTime = document.getElementById("friendClockTime");

function formatUnit(n) { return String(Math.max(0, Math.floor(n))).padStart(2, "0"); }

function renderClockInto(totalSec, hEl, mEl, sEl) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  hEl.textContent = formatUnit(h);
  mEl.textContent = formatUnit(m);
  sEl.textContent = formatUnit(s);
}

function computeMyDisplaySeconds() {
  if (running && runStartAt) return baselineSeconds + (Date.now() - runStartAt) / 1000;
  return baselineSeconds;
}

function renderMyClock() {
  renderClockInto(computeMyDisplaySeconds(), fcHours, fcMinutes, fcSeconds);
}

function persistMyState(isRunning, seconds) {
  const day = dayKey();
  db.ref(`dailyTimer/${day}/${myKey}`).set({
    totalSeconds: Math.round(seconds),
    running: isRunning,
    startedAt: isRunning ? Date.now() : null,
  });
}

function tick() {
  if (checkActive) return;
  secondsSinceCheck++;
  renderMyClock();

  if (secondsSinceCheck >= CHECK_INTERVAL_SECONDS) {
    secondsSinceCheck = 0;
    triggerCheck();
  }
}

// separate, simpler once-a-minute persistence heartbeat
setInterval(() => {
  if (running && !checkActive && myKey) {
    baselineSeconds = computeMyDisplaySeconds();
    runStartAt = Date.now();
    persistMyState(true, baselineSeconds);
  }
}, 60000);

function startTimer() {
  running = true;
  runStartAt = Date.now();
  startStopBtn.textContent = "Stop";
  timerStateEl.textContent = "studying";
  sessionNote.textContent = "";
  persistMyState(true, baselineSeconds);
  if (!tickHandle) tickHandle = setInterval(tick, 1000);
}

function stopTimer(note) {
  baselineSeconds = computeMyDisplaySeconds();
  running = false;
  runStartAt = null;
  clearInterval(tickHandle);
  tickHandle = null;
  secondsSinceCheck = 0;
  startStopBtn.textContent = "Start";
  timerStateEl.textContent = "ready";
  sessionNote.textContent = note || "";
  persistMyState(false, baselineSeconds);
  renderMyClock();
}

startStopBtn.addEventListener("click", () => {
  if (running) stopTimer("Session ended — saved to today's total."); else startTimer();
});

/* ---- 20-minute tap check-in ---- */
const checkModal = document.getElementById("checkModal");
const checkCountdownEl = document.getElementById("checkCountdown");
const tapBtn = document.getElementById("tapBtn");
const tapCountEl = document.getElementById("tapCount");

function triggerCheck() {
  checkActive = true;
  // freeze the visible baseline right now; the check-in window itself doesn't count
  baselineSeconds = computeMyDisplaySeconds();
  runStartAt = null;
  tapCount = 0;
  tapCountEl.textContent = "0";
  timerStateEl.textContent = "confirm you're here!";

  let remaining = CHECK_WINDOW_SECONDS;
  checkCountdownEl.textContent = remaining;
  checkModal.classList.remove("hidden");

  checkCountdownHandle = setInterval(() => {
    remaining -= 1;
    checkCountdownEl.textContent = Math.max(remaining, 0);
    if (remaining <= 0) {
      clearInterval(checkCountdownHandle);
      checkModal.classList.add("hidden");
      checkActive = false;
      running = false;
      clearInterval(tickHandle);
      tickHandle = null;
      startStopBtn.textContent = "Start";
      timerStateEl.textContent = "ready";
      sessionNote.textContent = `Session ended — no confirmation in time. Saved ${formatMinutes(Math.round(baselineSeconds / 60))} for today.`;
      persistMyState(false, baselineSeconds);
      renderMyClock();
    }
  }, 1000);
}

tapBtn.addEventListener("click", () => {
  if (!checkActive) return;
  tapCount++;
  tapCountEl.textContent = String(tapCount);
  if (tapCount >= TAPS_REQUIRED) {
    clearInterval(checkCountdownHandle);
    checkModal.classList.add("hidden");
    checkActive = false;
    runStartAt = Date.now();
    secondsSinceCheck = 0;
    timerStateEl.textContent = "studying";
    persistMyState(true, baselineSeconds);
  }
});

renderMyClock();

/* ---- friend's live clock ---- */
function renderFriendClock(data) {
  if (!data) {
    friendClockLabel.textContent = "Waiting for your study partner…";
    friendClockLabel.classList.remove("live");
    friendClockTime.textContent = "00:00:00";
    if (friendTickHandle) { clearInterval(friendTickHandle); friendTickHandle = null; }
    return;
  }
  const base = data.totalSeconds || 0;
  const isRunning = !!data.running && !!data.startedAt;

  function paint() {
    const secs = isRunning ? base + (Date.now() - data.startedAt) / 1000 : base;
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    const ss = Math.floor(secs % 60);
    friendClockTime.textContent = `${formatUnit(hh)}:${formatUnit(mm)}:${formatUnit(ss)}`;
  }

  friendClockLabel.textContent = friendKey ? (isRunning ? `${friendKey} is studying now` : `${friendKey} — today's total`) : "Study partner";
  friendClockLabel.classList.toggle("live", isRunning);

  if (friendTickHandle) { clearInterval(friendTickHandle); friendTickHandle = null; }
  paint();
  if (isRunning) friendTickHandle = setInterval(paint, 1000);
}

async function initFriendClock() {
  const users = await discoverUsers();
  friendKey = users.find((u) => u !== myKey) || null;
  const day = dayKey();
  if (!friendKey) { renderFriendClock(null); return; }
  db.ref(`dailyTimer/${day}/${friendKey}`).off();
  db.ref(`dailyTimer/${day}/${friendKey}`).on("value", (snapshot) => renderFriendClock(snapshot.val()));
}

function initTimerDayWatch() {
  const day = dayKey();
  db.ref(`dailyTimer/${day}/${myKey}`).once("value").then((snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    baselineSeconds = data.totalSeconds || 0;
    if (data.running && data.startedAt) {
      // resume seamlessly, "catching up" for any time passed since the last load
      running = true;
      runStartAt = data.startedAt;
      startStopBtn.textContent = "Stop";
      timerStateEl.textContent = "studying";
      tickHandle = setInterval(tick, 1000);
    }
    renderMyClock();
  });

  initFriendClock();

  // Watch for the calendar day rolling over past midnight and reset the view.
  setInterval(() => {
    const nowKey = dayKey();
    if (nowKey !== currentDay) {
      currentDay = nowKey;
      if (running) stopTimer("New day — yesterday's time was saved.");
      baselineSeconds = 0;
      renderMyClock();
      initFriendClock();
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

function createDayChartSection(sectionId, fetchersByMetric) {
  const section = document.getElementById(sectionId);
  const weekPillRow = section.querySelector('[data-pills="week"]');
  const monthPillRow = section.querySelector('[data-pills="month"]');
  const yaxis = section.querySelector(".daychart-yaxis");
  const gridlines = section.querySelector(".daychart-gridlines");
  const inner = section.querySelector(".daychart-inner");
  const barsEl = section.querySelector(".daychart-bars");
  const toggleButtons = document.querySelectorAll("#metricToggle .pill");

  let state = { type: "week", index: 0 };
  let metric = "time";

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

  toggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      metric = btn.dataset.metric;
      render();
    });
  });

  async function render() {
    setActivePills();
    const days = state.type === "week" ? daysForWeek(state.index) : daysForMonth(state.index);
    const fetchValuesForDays = metric === "time" ? fetchersByMetric.time : fetchersByMetric.questions;
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

    const barWidth = days.length > 14 ? 26 : 40;
    inner.style.width = `${days.length * (barWidth + 8)}px`;

    barsEl.innerHTML = "";
    days.forEach((d) => {
      const dayVals = valuesByDay[d.key] || {};
      const group = document.createElement("div");
      group.className = "day-group";
      group.style.width = `${barWidth}px`;

      const barsInner = document.createElement("div");
      barsInner.className = "bars-inner";
      currentUsers.forEach((u, ui) => {
        const val = dayVals[u] || 0;
        const bar = document.createElement("div");
        bar.className = "day-bar";
        bar.style.background = colorForUser(ui);
        bar.style.height = `${Math.min(100, (val / max) * 100)}%`;
        bar.title = `${u === myKey ? "You" : u}: ${val}`;
        barsInner.appendChild(bar);
      });
      group.appendChild(barsInner);

      const label = document.createElement("span");
      label.className = "day-label";
      label.textContent = d.label;
      group.appendChild(label);

      barsEl.appendChild(group);
    });
  }

  render();
  return { render };
}

let currentUsers = [];
let chartSection = null;

async function discoverUsers() {
  const userKeys = new Set([myKey]);
  const [recentMinutes, allScores] = await Promise.all([
    db.ref("dailyTimer").limitToLast(14).once("value"),
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
  const reads = await Promise.all(dayKeys.map((k) => db.ref(`dailyTimer/${k}`).once("value")));
  const result = {};
  dayKeys.forEach((k, i) => {
    const dayNode = reads[i].val() || {};
    const perUser = {};
    Object.entries(dayNode).forEach(([user, entry]) => {
      perUser[user] = Math.round((entry.totalSeconds || 0) / 60);
    });
    result[k] = perUser;
  });
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
  if (!chartSection) {
    chartSection = createDayChartSection("section-chart", {
      time: fetchMinutesForDays,
      questions: fetchQuestionsForDays,
    });
  } else {
    chartSection.render();
  }
}
