const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // Для обработки JSON-запросов

// 📁 Статическая папка — текущая директория
app.use(express.static(path.join(__dirname)));

const tokens = [];

const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // Пример: 5F8A1C
}

// 🔐 Генерация токена
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

  if (new Date() > new Date(found.expiresAt)) {
    return res.status(401).json({ valid: false, message: "Token expired" });
  }

  res.json({ valid: true, plan: found.plan, expiresAt: found.expiresAt });
});

// 📋 Получение списка токенов (с фильтром)
app.get("/tokens", (req, res) => {
  const filter = req.query.filter || "all";
  const now = new Date();

  const filtered = tokens.filter((t) => {
    const expired = now > new Date(t.expiresAt);
    if (filter === "active") return !expired;
    if (filter === "expired") return expired;
    return true;
  });

  res.json(filtered);
});

// ❌ Удаление токена
app.delete("/tokens/:token", (req, res) => {
  const { token } = req.params;
  const index = tokens.findIndex((t) => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  res.json({ success: true, message: `Token ${token} удалён.` });
});

// 🌐 Панель управления (HTML)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// 🏠 Главная
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token, /check-token, /tokens, /tokens/:token");
});

// ▶️ Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
