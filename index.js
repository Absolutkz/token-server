const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Токены хранятся в памяти (временное хранилище)
const tokens = [];

// Генерация случайного токена
function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase(); // Например: 5F8A1C
}

// План подписок и продолжительность в днях
const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

// Эндпоинт для генерации токена
app.get("/generate-token", (req, res) => {
  const { plan } = req.query;

  if (!durationMap[plan]) {
    return res.status(400).json({ success: false, message: "Неверный тарифный план" });
  }

  const expiresAt = new Date(Date.now() + durationMap[plan] * 24 * 60 * 60 * 1000);
  const token = generateToken();

  tokens.push({ token, plan, expiresAt });

  res.json({
    success: true,
    token,
    plan,
    expiresAt,
  });
});

// Эндпоинт для проверки токена
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

  res.json({
    valid: true,
    plan: found.plan,
    expiresAt: found.expiresAt,
  });
});

// Главная страница
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token?plan=... или /check-token?token=...");
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
