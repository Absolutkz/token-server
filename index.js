const express = require("express");
const crypto = require("crypto");
const path = require("path");
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const MONGODB_URI = process.env.MONGODB_URI;
const OTP_SECRET = process.env.OTP_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!MONGODB_URI) {
  console.error("Ошибка: переменная MONGODB_URI не задана.");
  process.exit(1);
}

if (!OTP_SECRET || OTP_SECRET.length < 32) {
  console.error("Ошибка: OTP_SECRET должен содержать не менее 32 символов.");
  process.exit(1);
}

if (!ADMIN_KEY || ADMIN_KEY.length < 24) {
  console.error("Ошибка: ADMIN_KEY должен содержать не менее 24 символов.");
  process.exit(1);
}

const AGENTS = new Set([
  "lawyer",
  "zheka",
  "bankshield",
  "herbs",
  "rf_procedure_navigator",
  "kz_procedure_navigator",
  "egregorial_manager",
]);

const PLAN_DURATIONS = {
  day: 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  halfyear: 182 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let tokensCollection;
let mailTransporter;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname)));

function normalizeToken(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeAgent(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return (
    Boolean(email) &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function generateToken() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateSessionKey() {
  return crypto.randomBytes(32).toString("base64url");
}

function createHmac(value) {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(value)
    .digest("hex");
}

function createOtpHash(token, agent, email, code) {
  return createHmac(`otp:${token}:${agent}:${email}:${code}`);
}

function createSessionHash(token, agent, sessionKey) {
  return createHmac(`session:${token}:${agent}:${sessionKey}`);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function maskToken(token) {
  if (!token) {
    return "";
  }

  if (token.length <= 4) {
    return "****";
  }

  return `${token.slice(0, 2)}****${token.slice(-2)}`;
}

function maskEmail(email) {
  const [localPart, domain] = String(email || "").split("@");

  if (!localPart || !domain) {
    return "***";
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requireAdmin(req, res, next) {
  const providedKey = req.get("x-admin-key") || "";

  if (!safeEqual(providedKey, ADMIN_KEY)) {
    return res.status(401).json({
      success: false,
      message: "Admin authorization required",
    });
  }

  return next();
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    throw new Error(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и SMTP_FROM должны быть заданы"
    );
  }

  if (!mailTransporter) {
    const secure =
      process.env.SMTP_SECURE === "true" ||
      (!process.env.SMTP_SECURE && port === 465);

    mailTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  return mailTransporter;
}

async function sendOtpEmail(email, code, agent) {
  if (process.env.OTP_DEBUG === "true") {
    console.log(
      `🧪 OTP_DEBUG CODE: ${code}, email: ${maskEmail(email)}, agent: ${agent}`
    );

    return;
  }

  const transporter = getMailTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Код подтверждения доступа",
    text:
      `Код подтверждения: ${code}\n\n` +
      `Агент: ${agent}\n` +
      "Код действует 10 минут.\n\n" +
      "Если вы не запрашивали код, проигнорируйте это письмо.",
    html:
      '<div style="font-family:Arial,sans-serif;max-width:560px">' +
      "<h2>Подтверждение доступа</h2>" +
      "<p>Ваш одноразовый код:</p>" +
      `<p style="font-size:30px;font-weight:bold;letter-spacing:6px">${escapeHtml(
        code
      )}</p>` +
      `<p>Агент: <strong>${escapeHtml(agent)}</strong></p>` +
      "<p>Код действует 10 минут.</p>" +
      "<p>Если вы не запрашивали код, проигнорируйте это письмо.</p>" +
      "</div>",
  });
}

async function connectDB() {
  try {
    await client.connect();

    const db = client.db("token-server");
    tokensCollection = db.collection("tokens");

    await tokensCollection.createIndex({
      status: 1,
      expiresAt: 1,
    });

    await tokensCollection.createIndex({
      agent: 1,
      ownerEmail: 1,
    });

    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

async function findActiveToken(token, agent) {
  return tokensCollection.findOne({
    token,
    agent,
    status: "active",
    expiresAt: { $gt: Date.now() },
  });
}

async function createUniqueToken(agent) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = generateToken();

    const existing = await tokensCollection.findOne({
      token,
      agent,
    });

    if (!existing) {
      return token;
    }
  }

  throw new Error("Unable to generate unique token");
}

app.get("/health", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });

    return res.json({
      success: true,
      service: "token-server",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: "Database unavailable",
    });
  }
});

app.post("/generate-token", requireAdmin, async (req, res) => {
  try {
    const plan =
      typeof req.body?.plan === "string" ? req.body.plan.trim() : "day";

    const agent = normalizeAgent(req.body?.agent || "lawyer");
    const ownerEmail = normalizeEmail(req.body?.ownerEmail);

    if (!AGENTS.has(agent)) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent",
      });
    }

    if (!PLAN_DURATIONS[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan",
      });
    }

    if (!isValidEmail(ownerEmail)) {
      return res.status(400).json({
        success: false,
        message: "Valid ownerEmail is required",
      });
    }

    const token = await createUniqueToken(agent);
    const now = Date.now();
    const expiresAt = now + PLAN_DURATIONS[plan];

    await tokensCollection.insertOne({
      token,
      plan,
      agent,
      ownerEmail,
      emailVerified: false,
      expiresAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    console.log(
      `🔑 Создан токен ${maskToken(token)} для ${agent}, владелец ${maskEmail(
        ownerEmail
      )}`
    );

    return res.json({
      success: true,
      token,
      plan,
      agent,
      ownerEmail,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error("❌ Ошибка генерации токена:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/request-code", async (req, res) => {
  try {
    const token = normalizeToken(req.body?.token);
    const agent = normalizeAgent(req.body?.agent);
    const email = normalizeEmail(req.body?.email);

    if (!token || !AGENTS.has(agent) || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Token, agent and valid email are required",
      });
    }

    const found = await findActiveToken(token, agent);

    if (!found) {
      return res.status(401).json({
        success: false,
        message: "Token not found or expired",
      });
    }

    if (!found.ownerEmail) {
      return res.status(403).json({
        success: false,
        message: "Token owner is not assigned",
      });
    }

    if (normalizeEmail(found.ownerEmail) !== email) {
      return res.status(403).json({
        success: false,
        message: "Email does not match token owner",
      });
    }

    const now = Date.now();
    const lastSentAt = Number(found.otpLastSentAt || 0);
    const elapsed = now - lastSentAt;

    if (lastSentAt && elapsed < OTP_COOLDOWN_MS) {
      return res.status(429).json({
        success: false,
        message: "Code was requested too recently",
        retryAfterSeconds: Math.ceil(
          (OTP_COOLDOWN_MS - elapsed) / 1000
        ),
      });
    }

    const code = generateOtpCode();
    const otpHash = createOtpHash(token, agent, email, code);
    const otpExpiresAt = now + OTP_TTL_MS;

    await tokensCollection.updateOne(
      {
        _id: found._id,
        status: "active",
      },
      {
        $set: {
          otpHash,
          otpEmail: email,
          otpExpiresAt,
          otpAttempts: 0,
          otpLastSentAt: now,
          updatedAt: now,
        },
      }
    );

    try {
      await sendOtpEmail(email, code, agent);
    } catch (mailError) {
      console.error("❌ Ошибка отправки письма:", mailError);

      await tokensCollection.updateOne(
        { _id: found._id },
        {
          $unset: {
            otpHash: "",
            otpEmail: "",
            otpExpiresAt: "",
            otpAttempts: "",
          },
          $set: {
            updatedAt: Date.now(),
          },
        }
      );

      return res.status(503).json({
        success: false,
        message: "Unable to send verification code",
      });
    }

    console.log(
      `📧 Код отправлен владельцу ${maskEmail(email)} для агента ${agent}`
    );

    return res.json({
      success: true,
      message: "Verification code sent",
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    });
  } catch (error) {
    console.error("❌ Ошибка запроса кода:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/confirm-code", async (req, res) => {
  try {
    const token = normalizeToken(req.body?.token);
    const agent = normalizeAgent(req.body?.agent);
    const email = normalizeEmail(req.body?.email);
    const code =
      typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (
      !token ||
      !AGENTS.has(agent) ||
      !isValidEmail(email) ||
      !/^\d{6}$/.test(code)
    ) {
      return res.status(400).json({
        valid: false,
        message: "Token, agent, email and six-digit code are required",
      });
    }

    const found = await findActiveToken(token, agent);

    if (!found) {
      return res.status(401).json({
        valid: false,
        message: "Token not found or expired",
      });
    }

    if (normalizeEmail(found.ownerEmail) !== email) {
      return res.status(403).json({
        valid: false,
        message: "Email does not match token owner",
      });
    }

    if (!found.otpHash || !found.otpEmail || !found.otpExpiresAt) {
      return res.status(401).json({
        valid: false,
        message: "Verification code was not requested",
      });
    }

    if (normalizeEmail(found.otpEmail) !== email) {
      return res.status(401).json({
        valid: false,
        message: "Verification code is invalid",
      });
    }

    if (Number(found.otpExpiresAt) <= Date.now()) {
      return res.status(401).json({
        valid: false,
        message: "Verification code expired",
      });
    }

    if (Number(found.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        valid: false,
        message: "Too many verification attempts",
      });
    }

    await tokensCollection.updateOne(
      { _id: found._id },
      {
        $inc: {
          otpAttempts: 1,
        },
        $set: {
          updatedAt: Date.now(),
        },
      }
    );

    const expectedHash = createOtpHash(token, agent, email, code);

    if (!safeEqual(found.otpHash, expectedHash)) {
      return res.status(401).json({
        valid: false,
        message: "Verification code is invalid",
      });
    }

    const sessionKey = generateSessionKey();
    const sessionHash = createSessionHash(token, agent, sessionKey);
    const now = Date.now();

    const sessionExpiresAt = Math.min(
      now + SESSION_TTL_MS,
      Number(found.expiresAt)
    );

    await tokensCollection.updateOne(
      { _id: found._id },
      {
        $set: {
          ownerEmail: email,
          emailVerified: true,
          verifiedAt: now,
          sessionHash,
          sessionExpiresAt,
          updatedAt: now,
        },
        $unset: {
          otpHash: "",
          otpEmail: "",
          otpExpiresAt: "",
          otpAttempts: "",
        },
      }
    );

    console.log(
      `✅ Почта подтверждена для ${maskToken(token)}, агент ${agent}`
    );

    return res.json({
      valid: true,
      sessionKey,
      plan: found.plan,
      agent: found.agent,
      ownerEmail: email,
      expiresAt: new Date(found.expiresAt).toISOString(),
      sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
      message: "Access confirmed",
    });
  } catch (error) {
    console.error("❌ Ошибка подтверждения кода:", error);

    return res.status(500).json({
      valid: false,
      message: "Internal server error",
    });
  }
});

app.post("/check-token", async (req, res) => {
  try {
    const token = normalizeToken(req.body?.token);
    const agent = normalizeAgent(req.body?.agent);
    const sessionKey =
      typeof req.body?.sessionKey === "string"
        ? req.body.sessionKey.trim()
        : "";

    if (!token || !AGENTS.has(agent) || !sessionKey) {
      return res.status(400).json({
        valid: false,
        message: "Token, agent and sessionKey are required",
      });
    }

    const found = await findActiveToken(token, agent);

    if (
      !found ||
      !found.emailVerified ||
      !found.sessionHash ||
      !found.sessionExpiresAt
    ) {
      return res.status(401).json({
        valid: false,
        message: "Access session not found",
      });
    }

    if (Number(found.sessionExpiresAt) <= Date.now()) {
      return res.status(401).json({
        valid: false,
        message: "Access session expired",
      });
    }

    const expectedSessionHash = createSessionHash(
      token,
      agent,
      sessionKey
    );

    if (!safeEqual(found.sessionHash, expectedSessionHash)) {
      return res.status(401).json({
        valid: false,
        message: "Access session is invalid",
      });
    }

    return res.json({
      valid: true,
      plan: found.plan,
      agent: found.agent,
      ownerEmail: found.ownerEmail,
      expiresAt: new Date(found.expiresAt).toISOString(),
      sessionExpiresAt: new Date(
        found.sessionExpiresAt
      ).toISOString(),
      message: "Token and session are valid",
    });
  } catch (error) {
    console.error("❌ Ошибка проверки сессии:", error);

    return res.status(500).json({
      valid: false,
      message: "Internal server error",
    });
  }
});

app.get("/check-token", (req, res) => {
  return res.status(405).json({
    valid: false,
    message:
      "Email verification is required. Use request-code and confirm-code.",
  });
});

app.get("/tokens", requireAdmin, async (req, res) => {
  try {
    const filter =
      typeof req.query.filter === "string"
        ? req.query.filter.trim()
        : "";

    const agent = normalizeAgent(req.query.agent);
    const query = {};

    if (agent) {
      if (!AGENTS.has(agent)) {
        return res.status(400).json({
          success: false,
          message: "Invalid agent",
        });
      }

      query.agent = agent;
    }

    if (filter === "active") {
      query.status = "active";
      query.expiresAt = { $gt: Date.now() };
    } else if (filter === "expired") {
      query.$or = [
        { status: { $ne: "active" } },
        { expiresAt: { $lte: Date.now() } },
      ];
    }

    const tokens = await tokensCollection
      .find(query, {
        projection: {
          otpHash: 0,
          sessionHash: 0,
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json(tokens);
  } catch (error) {
    console.error("❌ Ошибка получения токенов:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.put("/tokens/:token/owner", requireAdmin, async (req, res) => {
  try {
    const token = normalizeToken(req.params.token);
    const agent = normalizeAgent(req.body?.agent);
    const ownerEmail = normalizeEmail(req.body?.ownerEmail);

    if (!token || !AGENTS.has(agent) || !isValidEmail(ownerEmail)) {
      return res.status(400).json({
        success: false,
        message: "Token, agent and valid ownerEmail are required",
      });
    }

    const result = await tokensCollection.updateOne(
      {
        token,
        agent,
      },
      {
        $set: {
          ownerEmail,
          emailVerified: false,
          updatedAt: Date.now(),
        },
        $unset: {
          verifiedAt: "",
          otpHash: "",
          otpEmail: "",
          otpExpiresAt: "",
          otpAttempts: "",
          sessionHash: "",
          sessionExpiresAt: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    return res.json({
      success: true,
      token,
      agent,
      ownerEmail,
      message: "Token owner updated",
    });
  } catch (error) {
    console.error("❌ Ошибка назначения владельца:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.delete("/tokens/:token/owner", requireAdmin, async (req, res) => {
  try {
    const token = normalizeToken(req.params.token);
    const agent = normalizeAgent(req.body?.agent);

    if (!token || !AGENTS.has(agent)) {
      return res.status(400).json({
        success: false,
        message: "Token and agent are required",
      });
    }

    const result = await tokensCollection.updateOne(
      {
        token,
        agent,
      },
      {
        $set: {
          emailVerified: false,
          updatedAt: Date.now(),
        },
        $unset: {
          ownerEmail: "",
          verifiedAt: "",
          otpHash: "",
          otpEmail: "",
          otpExpiresAt: "",
          otpAttempts: "",
          sessionHash: "",
          sessionExpiresAt: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    return res.json({
      success: true,
      message: "Token owner removed",
    });
  } catch (error) {
    console.error("❌ Ошибка сброса владельца:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.delete("/tokens/:token", requireAdmin, async (req, res) => {
  try {
    const token = normalizeToken(req.params.token);
    const agent = normalizeAgent(req.body?.agent);

    const query = { token };

    if (agent) {
      if (!AGENTS.has(agent)) {
        return res.status(400).json({
          success: false,
          message: "Invalid agent",
        });
      }

      query.agent = agent;
    }

    const result = await tokensCollection.updateMany(
      query,
      {
        $set: {
          status: "inactive",
          updatedAt: Date.now(),
        },
        $unset: {
          otpHash: "",
          otpEmail: "",
          otpExpiresAt: "",
          otpAttempts: "",
          sessionHash: "",
          sessionExpiresAt: "",
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    return res.json({
      success: true,
      message: "Token marked as inactive",
    });
  } catch (error) {
    console.error("❌ Ошибка деактивации токена:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "tokens-admin.html"));
});

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
