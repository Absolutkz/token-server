const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

const tokensPath = path.join(__dirname, "tokens.json");

function loadTokens() {
  if (!fs.existsSync(tokensPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
  } catch {
    return [];
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
}

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

app.get("/check-token", (req, res) => {
  const { token } = req.query;
  const tokens = loadTokens();
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

app.get("/generate-token", (req, res) => {
  const { plan } = req.query;

  const durationMap = {
    day: 1,
    monthly: 30,
    halfyear: 180,
    yearly: 365,
  };

  if (!durationMap[plan]) {
    return res.status(400).json({ success: false, message: "Неверный тарифный план" });
  }

  const expiresAt = new Date(Date.now() + durationMap[plan] * 24 * 60 * 60 * 1000);
  const token = generateToken();

  const tokens = loadTokens();
  tokens.push({ token, plan, expiresAt, usedBy: null });
  saveTokens(tokens);

  res.json({
    success: true,
    token,
    plan,
    expiresAt,
  });
});

app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token?plan=... или /check-token?token=...");
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
