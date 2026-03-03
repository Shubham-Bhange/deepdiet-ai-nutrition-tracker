// ======================================================
// DeepDiet - Result Page (Backend + Chatbot Support)
// ======================================================

requireAuth();
renderUserInfo();
applyI18n();

const token = localStorage.getItem("token");
const currentScanId = localStorage.getItem("deepdiet_current_scan");

let currentScan = null;   // Global for chatbot use

if (!currentScanId) {
  showToast("No scan found.", "error");
  setTimeout(() => window.location.href = "index.html", 800);
}

async function loadResult() {
  try {

    const res = await fetch(`${API_BASE}/api/history`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Failed to load history");

    const history = await res.json();
    currentScan = history.find(s => s.id === currentScanId);

    if (!currentScan) {
      showToast("Scan not found.", "error");
      return;
    }

    renderResult(currentScan);

  } catch (err) {
    console.error(err);
    showToast("Failed to load result.", "error");
  }
}

function renderResult(scan) {

  // KPI
  document.getElementById("calories").textContent =
    scan.totals?.calories || 0;

  document.getElementById("protein").textContent =
    scan.totals?.protein_g || 0;

  document.getElementById("carbs").textContent =
    scan.totals?.carbs_g || 0;

  document.getElementById("fat").textContent =
    scan.totals?.fat_g || 0;

  // Items table
  const tbody = document.getElementById("itemsTable");
  tbody.innerHTML = "";

  (scan.items || []).forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.name}</td>
        <td>${item.portion_text}</td>
        <td>${item.calories}</td>
      </tr>
    `;
  });

  // Dish panel
  if (scan.dish_level) {
    const panel = document.getElementById("dishPanel");
    panel.style.display = "block";

    document.getElementById("dishNameBadge").textContent =
      "Dish: " + (scan.meal_name || "--");

    document.getElementById("portionBadge").textContent =
      "Portion: " + (scan.dish_meta?.portion_label || "--");

    document.getElementById("gramsBadge").textContent =
      "Estimated: " + (scan.dish_meta?.estimated_grams || "--") + " g";

    document.getElementById("confidenceBadge").textContent =
      "Confidence: " + (scan.dish_meta?.confidence || "--");

    document.getElementById("dishNotes").textContent =
      scan.dish_meta?.notes || "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadResult();
});


// ======================================================
// CHATBOT LOGIC
// ======================================================

const chatbotToggle = document.getElementById("chatbotToggle");
const chatbotBox = document.getElementById("chatbotBox");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatMessages = document.getElementById("chatMessages");

chatbotToggle.addEventListener("click", () => {
  chatbotBox.style.display =
    chatbotBox.style.display === "flex" ? "none" : "flex";
});

chatSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {

  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage("You", message);
  chatInput.value = "";

  try {

    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        message,
        context: currentScan   // 👈 IMPORTANT
      })
    });

    if (!res.ok) throw new Error("Chat failed");

    const data = await res.json();
    appendMessage("AI", data.reply);

  } catch (err) {
    console.error(err);
    appendMessage("AI", "Sorry, something went wrong.");
  }
}

function appendMessage(sender, text) {
  const div = document.createElement("div");
  div.style.marginBottom = "8px";
  div.innerHTML = `<b>${sender}:</b> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}