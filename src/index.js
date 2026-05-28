const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");

// Usando token alejo

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

app.post("/analyze", async (req, res) => {
  const infracostJSON = req.body;
  const prNumber = req.headers["x-pr-number"];
  const author = req.headers["x-author"];
  const branch = req.headers["x-branch"];

  try {
    console.log("=== POST /analyze request received ===");
    console.log("API Key configured:", !!process.env["GEMINI_API_KEY"]);
    console.log("PR Number:", prNumber);
    console.log("Author:", author);
    console.log("Branch:", branch);
    console.log("Request payload size:", JSON.stringify(infracostJSON).length);

    const prompt = `
    Analiza este reporte Infracost de cambios propuestos en la infraestructura de SwiftPay para el PR #${prNumber}:
    ${JSON.stringify(infracostJSON)}
    
    Tu tarea es realizar un análisis para ayudar a tomar una decisión técnica y financiera sobre este cambio de infraestructura

    Si es necesario, sugiere alternativas o ajustes en los tipos de instancias/servicios que podrían reducir el costo sin sacrificar el rendimiento esperado
    Proporciona un análisis breve en español PRE-CONFIRMACIÓN (antes de aplicar terraform apply)
    Genera un informe técnico conciso en formato **Markdown** siguiendo estrictamente esta estructura:

    1. Resumen Financiero
    - Costo de infraestructura: [$X.XX]
    - Principales conductores de costo: (Identifica los 3 recursos que más influyen en el costo total y su justificación técnica).

    2. Evaluación de Riesgos y Seguridad (SecOps)
    - Análisis de riesgos: (¿Detectas configuraciones críticas, recursos públicos innecesarios o brechas de seguridad?).
    - Cumplimiento de políticas: (¿Se identifican fallos en etiquetado o reglas de cumplimiento según el reporte?).

    3. Análisis DevOps
    - Advertencias técnicas: (¿Existen configuraciones en el plan que puedan bloquear el 'terraform apply'?).
    - Oportunidades de optimización: (¿Existen alternativas de servicios/instancias más eficientes sin sacrificar el rendimiento?).

    4. Veredicto y Plan de Acción
    - [APROBAR / RECHAZAR / SOLICITAR CAMBIOS]
    - Lista de acciones prioritarias: (Bloqueantes vs Sugerencias de optimización).
    `;

    console.log("Sending request to Google Gemini API...");
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const geminiResponse = await model.generateContent(prompt);

    console.log("Gemini response received successfully");
    console.log(
      "Response finish reason:",
      geminiResponse.response.candidates?.[0]?.finishReason,
    );
    console.log("Content type:", typeof geminiResponse.response.text());
    console.log("Token usage info:", geminiResponse.response.usageMetadata);

    const analysisText = geminiResponse.response.text();
    console.log("Analysis text extracted, length:", analysisText.length);

    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("MongoDB connected");

    const answer = new Answer({
      body: analysisText,
      prNumber,
      author,
      branch,
    });
    await answer.save();
    console.log("Analysis saved to MongoDB");

    console.log("=== Request completed successfully ===");
    res.json({ analysis: analysisText });
  } catch (error) {
    console.error("=== ERROR in /analyze endpoint ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error status:", error.status);
    console.error("Full error:", JSON.stringify(error, null, 2));

    try {
      console.log("Attempting to save error fallback to MongoDB...");
      await connectDB();
      const answer = new Answer({
        body: JSON.stringify(infracostJSON),
        prNumber,
        author,
        branch,
      });
      await answer.save();
      console.log("Infracost JSON saved to MongoDB as fallback");
    } catch (dbError) {
      console.error("Failed to save to MongoDB:", dbError.message);
    }

    res.json({
      analysis: infracostJSON,
      note: "Saved Infracost analysis (AI temporarily unavailable)",
    });
  }
});

app.get("/responses", async (req, res) => {
  try {
    console.log("=== GET /responses request received ===");
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("MongoDB connected");

    const answers = await Answer.find().sort({ date: -1 });
    console.log(`Found ${answers.length} responses in MongoDB`);

    res.json({
      count: answers.length,
      responses: answers,
    });
    console.log("=== GET request completed successfully ===");
  } catch (error) {
    console.error("=== ERROR in GET /responses ===");
    console.error("Error message:", error.message);
    console.error("Full error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/updatePullRequestStatus", async (req, res) => {
  try {
    const { prNumber, status } = req.body;

    await connectDB();

    const answer = await Answer.findOneAndUpdate(
      { prNumber: String(prNumber) },
      { pullRequestState: status },
      { new: true },
    );

    if (!answer) return res.status(404).json({ error: "Not found" });

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

exports.handler = serverless(app);
