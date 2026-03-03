// ======================================================
// DeepDiet - Weekly Report (Backend Based)
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

// ================= GOAL =================
const GOAL_KEY = "deepdiet_goal";
const goal = Number(localStorage.getItem(GOAL_KEY) || 0);

let history = [];

document.addEventListener("DOMContentLoaded", loadWeekly);

async function loadWeekly() {
  try {
    const res = await authFetch(`${API_BASE}/api/history`);
    if (!res || !res.ok) {
      showToast("Failed to load weekly data", "error");
      return;
    }

    history = await res.json();
    renderWeekly(history);

  } catch (err) {
    console.error(err);
    showToast("Error loading weekly report", "error");
  }
}

// ======================================================
// RENDER WEEKLY
// ======================================================

function renderWeekly(history) {

  const now = new Date();
  const last7Start = new Date();
  last7Start.setDate(now.getDate() - 6);

  const prev7Start = new Date();
  prev7Start.setDate(now.getDate() - 13);

  const prev7End = new Date();
  prev7End.setDate(now.getDate() - 7);

  const last7 = history.filter(s => {
    const d = new Date(s.timestamp);
    return d >= last7Start && d <= now;
  });

  const prev7 = history.filter(s => {
    const d = new Date(s.timestamp);
    return d >= prev7Start && d <= prev7End;
  });

  const sum = arr => arr.reduce((a,b)=>a+b,0);

  const cal7 = sum(last7.map(s => Number(s.totals?.calories || 0)));
  const avg7 = Math.round(cal7 / 7);
  const score7 = last7.length
    ? Math.round(sum(last7.map(s => Number(s.health_score || 0))) / last7.length)
    : 0;

  document.getElementById("wkCal").textContent = cal7;
  document.getElementById("wkAvg").textContent = avg7;
  document.getElementById("wkScore").textContent = score7;
  document.getElementById("wkScans").textContent = last7.length;

  // Comparison
  const calPrev = sum(prev7.map(s => Number(s.totals?.calories || 0)));
  const avgPrev = prev7.length ? Math.round(calPrev / 7) : 0;

  let compareMsg = "No previous week data";
  if (avgPrev > 0) {
    const diff = avg7 - avgPrev;
    const pct = Math.round((diff / avgPrev) * 100);
    compareMsg = diff < 0
      ? `Improved ✅ ${Math.abs(pct)}% less calories`
      : `Increased ⚠️ ${pct}% calories`;
  }
  document.getElementById("compareBadge").textContent = compareMsg;

  renderCharts(last7);
  renderBestWorst(last7);
  renderTopFoods(last7);
  renderMacros(last7);
  renderSuggestions(last7, avg7, score7);
}

// ======================================================
// CHARTS
// ======================================================

function renderCharts(last7) {

  const sum = arr => arr.reduce((a,b)=>a+b,0);

  function dateKey(d) {
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }

  const now = new Date();
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    days.push(d);
  }

  const labels = days.map(d => d.toLocaleDateString());

  const dayCalories = days.map(d => {
    const key = dateKey(d);
    const scans = last7.filter(s =>
      dateKey(new Date(s.timestamp)) === key
    );
    return sum(scans.map(s => Number(s.totals?.calories || 0)));
  });

  const dayScores = days.map(d => {
    const key = dateKey(d);
    const scans = last7.filter(s =>
      dateKey(new Date(s.timestamp)) === key
    );
    if (!scans.length) return 0;
    return Math.round(sum(scans.map(s => Number(s.health_score || 0))) / scans.length);
  });

  new Chart(document.getElementById("wkCalChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Calories", data: dayCalories }]
    }
  });

  new Chart(document.getElementById("wkScoreChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Health Score", data: dayScores }]
    }
  });
}

// ======================================================
// BEST / WORST
// ======================================================

function renderBestWorst(last7) {

  let best = null, worst = null;

  last7.forEach(s => {
    if (!best || Number(s.health_score || 0) > Number(best.health_score || 0))
      best = s;
    if (!worst || Number(s.health_score || 0) < Number(worst.health_score || 0))
      worst = s;
  });

  document.getElementById("bestMeal").textContent =
    best ? `${best.meal_name} (Score ${best.health_score})` : "--";

  document.getElementById("worstMeal").textContent =
    worst ? `${worst.meal_name} (Score ${worst.health_score})` : "--";
}

// ======================================================
// TOP FOODS
// ======================================================

function renderTopFoods(last7) {

  const foodCount = {};

  last7.forEach(s => {
    (s.items || []).forEach(it => {
      const name = String(it.name || "Unknown");
      foodCount[name] = (foodCount[name] || 0) + 1;
    });
  });

  const topFoods = Object.entries(foodCount)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);

  const table = document.getElementById("topFoodsTable");
  table.innerHTML = "";

  if (!topFoods.length) {
    table.innerHTML = `<tr><td colspan="2">No data</td></tr>`;
    return;
  }

  topFoods.forEach(([food, count]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${food}</td><td>${count}</td>`;
    table.appendChild(tr);
  });
}

// ======================================================
// MACROS
// ======================================================

function renderMacros(last7) {

  const sum = arr => arr.reduce((a,b)=>a+b,0);

  const protein = sum(last7.map(s => Number(s.totals?.protein_g || 0)));
  const carbs   = sum(last7.map(s => Number(s.totals?.carbs_g || 0)));
  const fat     = sum(last7.map(s => Number(s.totals?.fat_g || 0)));

  new Chart(document.getElementById("macroChart"), {
    type: "pie",
    data: {
      labels: ["Protein", "Carbs", "Fat"],
      datasets: [{ data: [protein, carbs, fat] }]
    }
  });
}

// ======================================================
// SMART SUGGESTIONS
// ======================================================

function renderSuggestions(last7, avg7, score7) {

  const suggestions = [];

  if (goal > 0 && avg7 > goal)
    suggestions.push("Reduce daily calories slightly.");

  if (score7 < 55)
    suggestions.push("Improve meal quality: add vegetables & protein.");

  if (!last7.length)
    suggestions.push("Start scanning daily to track progress.");

  const ul = document.getElementById("suggestionsList");
  ul.innerHTML = "";

  (suggestions.length ? suggestions : ["Keep tracking! You're doing great ✅"])
    .forEach(txt => {
      const li = document.createElement("li");
      li.textContent = txt;
      ul.appendChild(li);
    });
}