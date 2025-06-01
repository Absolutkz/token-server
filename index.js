require('dotenv').config();
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Ошибка: переменная среды MONGODB_URI не задана!");
  process.exit(1);
}
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let tokensCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("token-server");
    tokensCollection = db.collection("tokens");
    console.log("✅ Подключено к MongoDB");
  } catch (e) {
    console.error("❌ Ошибка подключения к MongoDB:", e);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// --- API ---

// 1. Генерация токена (POST, JSON)
app.post("/generate-token", async (req, res) => {
  try {
    const { plan = "day", agent = "lawyer" } = req.body;
    if (!["lawyer", "zheka", "bankshield"].includes(agent)) {
      return res.status(400).json({ success: false, message: "Invalid agent" });
    }

    let expiresIn = 24 * 60 * 60 * 1000; // default 1 day
    if (plan === "monthly") expiresIn = 30 * 24 * 60 * 60 * 1000;
    if (plan === "halfyear") expiresIn = 182 * 24 * 60 * 60 * 1000;
    if (plan === "yearly") expiresIn = 365 * 24 * 60 * 60 * 1000;

    const token = generateToken();
    const expiresAt = Date.now() + expiresIn;
    const tokenData = { token, plan, agent, expiresAt, status: "active" };
    await tokensCollection.insertOne(tokenData);
    res.json({ success: true, token, plan, agent, expiresAt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Проверка токена (GET)
app.get("/check-token", async (req, res) => {
  const { token, agent } = req.query;
  if (!token || !agent) {
    return res.status(400).json({ valid: false, message: "Token and agent required" });
  }
  const found = await tokensCollection.findOne({ token, agent, status: "active", expiresAt: { $gt: Date.now() } });
  if (found) {
    res.json({ valid: true, plan: found.plan, agent: found.agent, expiresAt: new Date(found.expiresAt).toISOString() });
  } else {
    res.status(401).json({ valid: false, message: "Token not found or expired" });
  }
});

// 3. Список токенов (GET)
app.get("/tokens", async (req, res) => {
  const { filter, agent } = req.query;
  let query = {};
  if (agent) query.agent = agent;
  if (filter === "active") {
    query.status = "active";
    query.expiresAt = { $gt: Date.now() };
  } else if (filter === "expired") {
    query.$or = [{ status: { $ne: "active" } }, { expiresAt: { $lt: Date.now() } }];
  }
  const tokens = await tokensCollection.find(query).toArray();
  res.json(tokens);
});

// 4. Удаление токена (DELETE)
app.delete("/tokens/:token", async (req, res) => {
  const { token } = req.params;
  const result = await tokensCollection.deleteOne({ token });
  if (result.deletedCount === 1) {
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: "Token not found" });
  }
});

// 5. Админ-панель
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// --- Запуск сервера ---
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
  });
});
