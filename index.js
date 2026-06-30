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
    console.log("✅ Connected to MongoDB");
  } catch (e) {
    console.error("❌ MongoDB connection error:", e);
    console.error("Message:", e?.message);
    console.error("Stack:", e?.stack);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// 1. Генерация токена
app.post("/generate-token", async (req, res) => {
  try {
    const { plan = "day", agent = "lawyer" } = req.body;

   if (!["lawyer", "zheka", "bankshield", "herbs", "rf_procedure_navigator", "kz_procedure_navigator", "egregorial_manager"].includes(agent)) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent",
      });
    }

    let expiresIn = 24 * 60 * 60 * 1000; // 1 day
    if (plan === "monthly") expiresIn = 30 * 24 * 60 * 60 * 1000;
    if (plan === "halfyear") expiresIn = 182 * 24 * 60 * 60 * 1000;
    if (plan === "yearly") expiresIn = 365 * 24 * 60 * 60 * 1000;

    const token = generateToken();
    const expiresAt = Date.now() + expiresIn;

    const tokenData = {
      token,
      plan,
      agent,
      expiresAt,
      status: "active",
    };

    await tokensCollection.insertOne(tokenData);

    console.log(`🔑 Новый токен создан: ${token}, агент: ${agent}, план: ${plan}`);

    return res.json({
      success: true,
      token,
      plan,
      agent,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (err) {
    console.error("❌ Ошибка генерации токена:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// 2. Проверка токена
app.get("/check-token", async (req, res) => {
  try {
    const rawToken = req.query.token;
    const rawAgent = req.query.agent;

    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    const agent =
      typeof rawAgent === "string" && rawAgent.trim()
        ? rawAgent.trim()
        : "bankshield";

    console.log(`🔍 Проверка токена для агента: ${agent}`);

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: "Token is required",
      });
    }

    if (!["lawyer", "zheka", "bankshield", "herbs", "rf_procedure_navigator", "kz_procedure_navigator", "egregorial_manager"].includes(agent)) {
      return res.status(400).json({
        valid: false,
        message: "Invalid agent",
      });
    }

    const found = await tokensCollection.findOne({
      token,
      agent,
      status: "active",
      expiresAt: { $gt: Date.now() },
    });

    console.log("📋 Результат поиска:", found);

    if (!found) {
      return res.status(401).json({
        valid: false,
        message: "Token not found or expired",
      });
    }

    return res.json({
      valid: true,
      plan: found.plan,
      agent: found.agent,
      expiresAt: new Date(found.expiresAt).toISOString(),
      message: "Token is valid",
    });
  } catch (err) {
    console.error("❌ Ошибка при проверке токена:", err);
    return res.status(500).json({
      valid: false,
      message: "Internal server error",
    });
  }
});

// 3. Список токенов
app.get("/tokens", async (req, res) => {
  try {
    const { filter, agent } = req.query;
    let query = {};

    if (agent) {
      query.agent = agent;
    }

    if (filter === "active") {
      query.status = "active";
      query.expiresAt = { $gt: Date.now() };
    } else if (filter === "expired") {
      query.$or = [
        { status: { $ne: "active" } },
        { expiresAt: { $lt: Date.now() } },
      ];
    }

    const tokens = await tokensCollection.find(query).toArray();
    return res.json(tokens);
  } catch (err) {
    console.error("❌ Ошибка при получении токенов:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// 4. Удаление токена
app.delete("/tokens/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const result = await tokensCollection.updateOne(
      { token },
      { $set: { status: "inactive" } }
    );

    if (result.matchedCount === 1) {
      return res.json({
        success: true,
        message: "Token marked as inactive",
      });
    }

    return res.status(404).json({
      success: false,
      message: "Token not found",
    });
  } catch (err) {
    console.error("❌ Ошибка при удалении токена:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// 5. Админ-панель
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

// Запуск сервера
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
