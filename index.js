const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Для DELETE и POST JSON-запросов
app.use(express.static(__dirname)); // Для доступа к tokens-admin.html и др.

// 🔐 Временное хранилище токенов (в памяти)
const tokens = [];

// 📆 Длительность по планам (в днях)
const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

// 🔑 Генерация токена
function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // Пример: 5F8A1C
}

// 📥 /generate-token?plan=...
app.get("/generate-token", (req, res) => {
  const { plan } = req.query;

  if (!durationMap[plan]) {
    return res.status(400).json({ success: false, message: "Неверный тарифный план" });
  }

  const expiresAt = new Date(Date.now() + durationMap[plan] * 24 * 60 * 60 * 1000);
  const token = generateToken();

  tokens.push({ token, plan, expiresAt });
  res.json({ success: true, token, plan, expiresAt });
});

// ✅ /check-token?token=...
app.get("/check-token", (req, res) => {
  const { token } = req.query;
  const found = tokens.find((t) => t.token === token);

  if (!found) {
    return res.status(401).json({ valid: false, message: "Token not found or expired" });
  }

  const now = new Date();
  if (now > new Date(found.expiresAt)) {
    return res.status(401).json({ valid: false, message: "Token expired" });
  }

  res.json({
    valid: true,
    plan: found.plan,
    expiresAt: found.expiresAt,
  });
});

// 📋 /tokens?filter=all|active|expired
app.get("/tokens", (req, res) => {
  const { filter } = req.query;
  const now = new Date();
  let filtered = tokens;

  if (filter === "active") {
    filtered = tokens.filter(t => new Date(t.expiresAt) > now);
  } else if (filter === "expired") {
    filtered = tokens.filter(t => new Date(t.expiresAt) <= now);
  }

  res.json(filtered);
});

// ❌ /tokens/:token (DELETE)
app.delete("/tokens/:token", (req, res) => {
  const { token } = req.params;
  const index = tokens.findIndex(t => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  res.json({ success: true, message: `Token ${token} удалён.` });
});

// 🖥️ /admin → откроет HTML-файл
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// 🏠 Корень
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token, /check-token, /tokens, /tokens/:token");
});

// ▶️ Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});


