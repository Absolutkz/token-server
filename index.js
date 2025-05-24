const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB config ---
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

// --- Подключение к базе данных ---
async function connectDB() {
  try {
    await client.connect();
    const db = client.db("token-server"); // база будет создана автоматически
    tokensCollection = db.collection("tokens");
    console.log("✅ Подключено к MongoDB");
  } catch (e) {
    console.error("❌ Ошибка подключения к MongoDB:", e);
    process.exit(1);
  }
}

// --- Middlewares ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Генерация токена ---
function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// --- API ---
// 1. Генерация нового токена
app.post("/generate-token", async (req, res) => {
  const { plan = "day", expiresIn = 24 * 60 * 60 * 1000 } = req.body; // по умолчанию 1 день
  const token = generateToken();
  const expiresAt = Date.now() + expiresIn;

  const tokenData = {
    token,
    plan,
    expiresAt,
    status: "active",
  };

  await tokensCollection.insertOne(tokenData);
  res.json({ token, plan, expiresAt });
});

// 2. Проверка токена
app.get("/check-token", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, message: "Token required" });

  const found = await tokensCollection.findOne({ token, status: "active", expiresAt: { $gt: Date.now() } });
  if (found) {
    res.json({ valid: true, plan: found.plan, expiresAt: new Date(found.expiresAt).toISOString() });
  } else {
    res.status(401).json({ valid: false, message: "Token not found or expired" });
  }
});

// 3. Админ-панель (статические файлы)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// 4. Список токенов (админ)
app.get("/list-tokens", async (req, res) => {
  const tokens = await tokensCollection.find({}).toArray();
  res.json(tokens);
});

// 5. Удаление токена (админ)
app.post("/delete-token", async (req, res) => {
  const { token } = req.body;
  const result = await tokensCollection.deleteOne({ token });
  res.json({ deleted: result.deletedCount === 1 });
});

// --- Запуск сервера ---
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
  });
});
