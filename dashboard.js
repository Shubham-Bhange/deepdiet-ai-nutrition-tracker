// ======================================================
// DeepDiet - Dashboard (Backend Based)
// ======================================================

requireAuth();
renderUserInfo();
applyI18n();

// ================= LANGUAGE =================
const langSelect = document.getElementById("langSelect");
if (langSelect) {
  langSelect.value = getLang();
  langSelect.addEventListener("change", () => setLang(langSelect.value));
}

// ================= LOGOUT =================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutUser();
    showToast("Logged out", "info");
    setTimeout(() => window.location.href = "login.html", 600);
  });
}

// ================= KEYS =================
const GOAL_KEY = "deepdiet_goal";
const WATER_GOAL_KEY = "deepdiet_water_goal";
const WATER_DATA_KEY = "deepdiet_water_data";

// ================= ELEMENTS =================
const goalBadge = document.getElementById("goalBadge");
const todayBadge = document.getElementById("todayBadge");
const remainBadge = document.getElementById("remainBadge");
const streakBadge = document.getElementById("streakBadge");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

const goalInput = document.getElementById("goalInput");
const setGoalBtn = document.getElementById("setGoalBtn");

let history = [];

// ======================================================
// LOAD DATA FROM BACKEND
// ======================================================

document.addEventListener("DOMContentLoaded", loadDashboard);

async function loadDashboard() {
  try {
    const res = await authFetch(`${API_BASE}/api/history`);
    if (!res || !res.ok) {
      showToast("Failed to load dashboard", "error");
      return;
    }

    history = await res.json();
    renderDashboard(history);

  } catch (err) {
    console.error(err);
    showToast("Error loading dashboard", "error");
  }
}

// ======================================================
// RENDER DASHBOARD
// ======================================================

function renderDashboard(history) {

  const goal = loadGoal();
  const todayCal = calcTodayCalories(history);
  const streak = calcStreak(history);

  const remaining = goal > 0 ? Math.max(goal - todayCal, 0) : 0;
  const pct = goal > 0
    ? Math.min(Math.round((todayCal / goal) * 100), 100)
    : 0;

  goalBadge.textContent = `Goal: ${goal || "--"} kcal`;
  todayBadge.textContent = `Today: ${todayCal} kcal`;
  remainBadge.textContent = `Remaining: ${goal ? remaining : "--"} kcal`;
  streakBadge.textContent = `Streak: ${streak} days`;

  progressFill.style.width = `${pct}%`;
  progressText.textContent =
    goal ? `${pct}% of daily goal completed`
         : "Set goal to track progress";

  if (goal) goalInput.value = goal;

  renderCharts(history);
}

// ======================================================
// CALCULATIONS
// ======================================================

function loadGoal() {
  return Number(localStorage.getItem(GOAL_KEY) || 0);
}

function calcTodayCalories(history) {
  const today = new Date().toDateString();
  return history
    .filter(s => new Date(s.timestamp).toDateString() === today)
    .reduce((sum, s) => sum + (s.totals?.calories || 0), 0);
}

function calcStreak(history) {
  const dates = [...new Set(
    history.map(s =>
      new Date(s.timestamp).toDateString()
    )
  )];

  let streak = 0;
  let d = new Date();

  while (dates.includes(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// ======================================================
// CHARTS
// ======================================================

function renderCharts(history) {

  const recent = history.slice(0, 15).reverse();

  const labels = recent.map(s =>
    new Date(s.timestamp).toLocaleDateString()
  );

  const calories = recent.map(s =>
    Number(s.totals?.calories || 0)
  );

  const scores = recent.map(s =>
    Number(s.health_score || 0)
  );

  new Chart(document.getElementById("calChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Calories",
        data: calories,
        borderWidth: 2,
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });

  new Chart(document.getElementById("scoreChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Health Score",
        data: scores,
        borderWidth: 2,
        tension: 0.3
      }]
    },
    options: { responsive: true }
  });
}

// ======================================================
// SET CALORIE GOAL
// ======================================================

if (setGoalBtn) {
  setGoalBtn.addEventListener("click", () => {
    const val = Number(goalInput.value || 0);
    if (!val || val < 500)
      return showToast("Enter valid goal (>= 500)", "error");

    localStorage.setItem(GOAL_KEY, String(val));
    showToast("Goal updated ✅", "success");
    setTimeout(() => location.reload(), 700);
  });
}

// ======================================================
// WATER TRACKER (Still Local)
// ======================================================

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function loadWaterGoal() {
  return Number(localStorage.getItem(WATER_GOAL_KEY) || 0);
}

function loadWaterData() {
  const all = JSON.parse(localStorage.getItem(WATER_DATA_KEY) || "{}");
  return all[todayKey()] || 0;
}

function saveWaterData(val) {
  const all = JSON.parse(localStorage.getItem(WATER_DATA_KEY) || "{}");
  all[todayKey()] = val;
  localStorage.setItem(WATER_DATA_KEY, JSON.stringify(all));
}

function updateWaterUI() {
  const goal = loadWaterGoal();
  const today = loadWaterData();
  const remain = goal > 0 ? Math.max(goal - today, 0) : 0;

  document.getElementById("waterGoalBadge").textContent =
    `Goal: ${goal || 0} ml`;
  document.getElementById("waterTodayBadge").textContent =
    `Today: ${today} ml`;
  document.getElementById("waterRemainBadge").textContent =
    `Remaining: ${remain} ml`;
}

updateWaterUI();