// ======================================================
// DeepDiet - Scan Page Logic (Backend Based)
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

// ================= TOKEN =================
function getToken() {
  return localStorage.getItem("token");
}

// ================= UI ELEMENTS =================
const dz = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const preview = document.getElementById("preview");
const scanBtn = document.getElementById("scanBtn");
const resetBtn = document.getElementById("resetBtn");
const loader = document.getElementById("loader");

let currentFile = null;

// ================= FILE HANDLING =================
function setFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please upload an image file.", "error");
    return;
  }

  currentFile = file;
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";

  scanBtn.disabled = false;
  resetBtn.disabled = false;
}

browseBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  setFile(e.target.files[0]);
});

dz.addEventListener("dragover", (e) => {
  e.preventDefault();
  dz.classList.add("dragover");
});

dz.addEventListener("dragleave", () => {
  dz.classList.remove("dragover");
});

dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("dragover");
  setFile(e.dataTransfer.files[0]);
});

resetBtn.addEventListener("click", () => {
  currentFile = null;
  preview.style.display = "none";
  preview.src = "";
  fileInput.value = "";
  scanBtn.disabled = true;
  resetBtn.disabled = true;
  loader.style.display = "none";
});

// ================= GEMINI SCAN =================
async function geminiDishScan(file) {

  const token = getToken();

  if (!token) {
    showToast("Session expired. Please login again.", "error");
    window.location.href = "login.html";
    return;
  }

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/dish-scan`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`
    },
    body: form
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    showToast("Session expired. Please login again.", "error");
    window.location.href = "login.html";
    return;
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Backend error:", errorText);
    throw new Error(errorText || "Backend error");
  }

  return await res.json();
}

// ================= SCAN BUTTON =================
scanBtn.addEventListener("click", async () => {

  if (!currentFile) {
    showToast("Upload image first", "error");
    return;
  }

  loader.style.display = "block";
  scanBtn.disabled = true;

  try {

    const dish = await geminiDishScan(currentFile);

if (!dish || !dish.id) {
  showToast("Invalid scan response.", "error");
  return;
}

// ✅ USER-WISE KEY (VERY IMPORTANT)
const HISTORY_KEY = userKey("deepdiet_history");
const CURRENT_KEY = userKey("deepdiet_current_scan");

// Load old history
let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

// Add new scan at top
history.unshift(dish);

// Save updated history
localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

// Save current scan ID (for result page)
localStorage.setItem(CURRENT_KEY, String(dish.id));

showToast("Scan successful ✅", "success");

setTimeout(() => {
  window.location.href = "result.html";
}, 500);

  } catch (err) {
    console.error(err);
    showToast("Scan failed. Try again.", "error");
  } finally {
    loader.style.display = "none";
    scanBtn.disabled = false;
  }
});