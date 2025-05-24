const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB config
const uri = "mongodb+srv://absolutkz:yhDC0BBrNRiV367C@cluster0.rnoqlpq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
let tokensCollection;

// Стартуем соединение с БД один раз при запуске
async function startMongo() {
  await client.connect();
  const db = client.db("tokenServerDB"); // любое название вашей БД
  tokensCollection = db.collection("tokens");
  console.log("✅ Подключение к MongoDB Atlas успешно!");
}
startMongo().catch(console.dir);

// Для обработки JSON-запросов
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Для генерации срока действия токена
const durationMap = {
  day: 1,
  monthly: 30,
  halfyear: 180,
  yearly: 365,
};

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// Генерация токена и запись в БД
app.get("/generate-token", async (req, res) => {
  const { plan } = req.query;
  if (!durationMap[plan]) {
    return res.status(400).json({ success: false, message: "Неверный тарифный план" });
  }
  const expiresAt = new Date(Date.now() + durationMap[plan] * 24 * 60 * 60 * 1000);
  const token = generateToken();

  await tokensCollection.insertOne({ token, plan, expiresAt });
  res.json({ success: true, token, plan, expiresAt });
});

// Проверка токена
app.get("/check-token", async (req, res) => {
  const { token } = req.query;
  const found = await tokensCollection.findOne({ token });
  if (!found) {
    return res.status(401).json({ valid: false, message: "Token not found" });
  }
  if (new Date() > new Date(found.expiresAt)) {
    return res.status(401).json({ valid: false, message: "Token expired" });
  }
  res.json({ valid: true, plan: found.plan, expiresAt: found.expiresAt });
});

// Получение всех токенов с фильтром
app.get("/tokens", async (req, res) => {
  const filter = req.query.filter || "all";
  const now = new Date();
  const allTokens = await tokensCollection.find({}).toArray();
  const filtered = allTokens.filter((t) => {
    const expired = now > new Date(t.expiresAt);
    if (filter === "active") return !expired;
    if (filter === "expired") return expired;
    return true;
  });
  res.json(filtered);
});

// Удаление токена
app.delete("/tokens/:token", async (req, res) => {
  const { token } = req.params;
  const result = await tokensCollection.deleteOne({ token });
  if (result.deletedCount === 0) {
    return res.status(404).json({ success: false, message: "Token not found" });
  }
  res.json({ success: true, message: `Token ${token} удалён.` });
});

// Панель управления
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// Главная страница
app.get("/", (req, res) => {
  res.send("🔑 Сервер токенов работает. Используйте /generate-token, /check-token, /tokens, /tokens/:token");
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
