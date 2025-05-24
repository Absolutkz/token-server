const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const TOKENS_FILE = path.join(__dirname, "tokens.json");

const app = express();
const PORT = process.env.PORT || 3000;

let tokens = [];
if (fs.existsSync(TOKENS_FILE)) {
  try {
    tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  } catch (e) {
    tokens = [];
    console.error("Ошибка чтения tokens.json:", e);
  }
}

function saveTokens() {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

// ... ваш durationMap и другие функции

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ... остальной код

// 🔐 Генерация токена
app.get("/generate-token", (req, res) => {
  const { plan } = req.query;
  // ... ваша логика проверки тарифа
  const expiresAt = new Date(Date.now() + durationMap[plan] * 24 * 60 * 60 * 1000);
  const token = generateToken();

  tokens.push({ token, plan, expiresAt });
  saveTokens();

  res.json({ success: true, token, plan, expiresAt });
});

// ❌ Удаление токена
app.delete("/tokens/:token", (req, res) => {
  const { token } = req.params;
  const index = tokens.findIndex((t) => t.token === token);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }

  tokens.splice(index, 1);
  saveTokens();

  res.json({ success: true, message: `Token ${token} удалён.` });
});
