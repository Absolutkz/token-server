const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const TOKENS_FILE = path.join(__dirname, "tokens.json");

app.use(express.json());

// 📁 Статическая папка — текущая директория
app.use(express.static(path.join(__dirname)));

// ===== Логика работы с токенами через файл =====

// Загрузка токенов из файла
function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

// Сохранение токенов в файл
function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// Используем рабочий массив, который всегда актуален
let tokens = loadTokens();

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
  saveTokens(tokens); // <--- Сохраняем токены в файл

  res.json({ success: true, token, plan, expiresAt });
});

// ✅ Проверка токена
app.get("/check-token", (req, res) => {
  // Перед каждой проверкой перечитываем токены из файла
  tokens = loadTokens();

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
  tokens = loadTokens();
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
  tokens = loadTokens();
  const { token } = req.params;
  const index = tokens.findIndex((t) => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  saveTokens(tokens);

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
