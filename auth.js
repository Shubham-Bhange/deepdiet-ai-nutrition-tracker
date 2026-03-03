// =====================================================
// DeepDiet - JWT Authentication System
// =====================================================

const API_BASE = "https://deepdiet-backend.onrender.com";
const cors = require("cors");
// ================= TOKEN =================
app.use(cors({
  origin: "https://deepdiet.onrender.com",
}));
function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("fullName");
}

// ================= AUTH CHECK =================

function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
  }
}

// ================= LOGOUT =================

function logoutUser() {
  clearSession();
  window.location.href = "login.html";
}

// ================= USER INFO DISPLAY =================

function renderUserInfo() {
  const el = document.getElementById("userInfo");
  if (!el) return;

  const name = localStorage.getItem("fullName");
  el.textContent = name ? name : "User";
}

// ================= AUTH FETCH WRAPPER =================
// Use this instead of normal fetch for protected APIs

async function authFetch(url, options = {}) {

  const token = getToken();

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  options.headers = {
    ...(options.headers || {}),
    "Authorization": `Bearer ${token}`
  };

  const response = await fetch(url, options);

  // Handle expired / invalid token
  if (response.status === 401) {
    clearSession();
    alert("Session expired. Please login again.");
    window.location.href = "login.html";
    return;
  }

  return response;
}