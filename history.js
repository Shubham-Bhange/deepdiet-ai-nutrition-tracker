// ======================================================
// DeepDiet - History Page (Backend Based)
// ======================================================

requireAuth();
renderUserInfo();
applyI18n();

// Language selector
const langSelect = document.getElementById("langSelect");
if (langSelect) {
  langSelect.value = getLang();
  langSelect.addEventListener("change", () => setLang(langSelect.value));
}

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutUser();
    showToast("Logged out", "info");
    setTimeout(() => window.location.href = "login.html", 600);
  });
}

// Elements
const tbody = document.getElementById("historyTable");
const searchInput = document.getElementById("searchInput");
const filterScore = document.getElementById("filterScore");

let history = [];

// ================= LOAD FROM BACKEND =================

document.addEventListener("DOMContentLoaded", loadHistory);

async function loadHistory() {
  try {

    const res = await authFetch(`${API_BASE}/api/history`);

    if (!res || !res.ok) {
      showToast("Failed to load history", "error");
      return;
    }

    history = await res.json();
    render(history);

  } catch (err) {
    console.error(err);
    showToast("Error loading history", "error");
  }
}

// ================= RENDER =================

function render(list) {

  if (!tbody) return;

  tbody.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No scans found</td></tr>`;
    return;
  }

  list.forEach((s) => {

    const dt = s.timestamp
      ? new Date(s.timestamp).toLocaleString()
      : "--";

    const meal = s.meal_name || "Meal";
    const cal = s.totals?.calories ?? "--";
    const score = s.health_score ?? "--";

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    tr.innerHTML = `
      <td>${dt}</td>
      <td><b>${meal}</b></td>
      <td>${cal}</td>
      <td>${score}</td>
    `;

    // Click row → open result
    tr.addEventListener("click", () => {
      localStorage.setItem("deepdiet_current_scan", String(s.id));
      window.location.href = "result.html";
    });

    tbody.appendChild(tr);
  });
}

// ================= FILTERS =================

function applyFilters() {

  const q = (searchInput?.value || "").trim().toLowerCase();
  const scoreMin = filterScore?.value || "all";

  let filtered = [...history];

  // Search by meal name
  if (q.length > 0) {
    filtered = filtered.filter((s) =>
      String(s.meal_name || "").toLowerCase().includes(q)
    );
  }

  // Filter by minimum score
  if (scoreMin !== "all") {
    const min = Number(scoreMin);
    filtered = filtered.filter((s) =>
      Number(s.health_score || 0) >= min
    );
  }

  render(filtered);
}

// Attach listeners
if (searchInput) {
  searchInput.addEventListener("input", applyFilters);
}
if (filterScore) {
  filterScore.addEventListener("change", applyFilters);
}