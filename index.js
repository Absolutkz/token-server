const express = require("express");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // для обработки JSON в DELETE и будущем POST

// Временное хранилище токенов в памяти
const tokens = [];

// План подписок и продолжительность
const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

// Генерация случайного токена
function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // Например: 5F8A1C
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

// 🔍 Проверка токена
app.get("/check-token", (req, res) => {
  const { token } = req.query;

  const found = tokens.find((t) => t.token === token);

  if (!found) {
    return res.status(401).json({ valid: false, message: "Token not found or expired" });
  }

  const now = new Date();
  const expires = new Date(found.expiresAt);

  if (now > expires) {
    return res.status(401).json({ valid: false, message: "Token expired" });
  }

  res.json({ valid: true, plan: found.plan, expiresAt: found.expiresAt });
});

// 📋 Получить список всех активных токенов
app.get("/tokens", (req, res) => {
  res.json(tokens);
});

// ❌ Удалить токен по значению
app.delete("/tokens/:token", (req, res) => {
  const { token } = req.params;
  const index = tokens.findIndex((t) => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  res.json({ success: true, message: `Token ${token} удалён.` });
});

// 🏠 Главная страница
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token, /check-token, /tokens, /tokens/:token");
});

// ▶️ Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});

