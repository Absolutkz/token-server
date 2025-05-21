const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Для обработки JSON-запросов

// 🔐 Временное хранилище токенов в памяти
const tokens = [];

// 🔢 Планы подписки и продолжительность (в днях)
const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

// 🔑 Генерация случайного токена
function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // Пример: 5F8A1C
}

// 📦 Генерация токена
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

// ✅ Проверка токена
app.get("/check-token", (req, res) => {
  const { token } = req.query;
  const found = tokens.find((t) => t.token === token);

  if (!found) {
    return res.status(401).json({ valid: false, message: "Token not found" });
  }

  const now = new Date();
  if (now > new Date(found.expiresAt)) {
    return res.status(401).json({ valid: false, message: "Token expired" });
  }

  res.json({ valid: true, plan: found.plan, expiresAt: found.expiresAt });
});

// 📋 Список токенов (с фильтрацией)
app.get("/tokens", (req, res) => {
  const filter = req.query.filter || "all";
  const now = new Date();

  const filteredTokens = tokens.filter((t) => {
    const expired = now > new Date(t.expiresAt);
    if (filter === "active") return !expired;
    if (filter === "expired") return expired;
    return true;
  });

  res.json(filteredTokens);
});

// 🗑 Удаление токена
app.delete("/tokens/:token", (req, res) => {
  const { token } = req.params;
  const index = tokens.findIndex((t) => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  res.json({ success: true, message: `Token ${token} удалён.` });
});

// 🌐 Статическая страница управления (/admin)
app.use("/admin", express.static(path.join(__dirname)));

// 🏠 Главная страница
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token, /check-token, /tokens, /tokens/:token");
});

// ▶️ Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
