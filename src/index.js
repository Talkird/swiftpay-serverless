const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");
// Load environment variables from .env file (if present)
const { GoogleGenerativeAI } = require("@google/generative-ai");

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

// CORS middleware - allow only SwiftPay frontend
const allowedOrigin =
  "http://swiftpay-frontend-app.s3-website-us-east-1.amazonaws.com";

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === allowedOrigin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/analyze", async (req, res) => {
  const { terraformPlanJSON } = req.body;

  const prompt = `
    Analiza este reporte de costos de infraestructura de SwiftPay:
    ${JSON.stringify(terraformPlanJSON)}
    
    Genera un resumen breve en español:
    1. ¿Cuánto cambia el costo mensual?
    2. ¿Es una subida o bajada significativa?
    3. ¿Sugieres alguna optimización para ahorrar?`;

  try {
    console.log("Starting analysis request with Gemini...");
    //flash
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();
    console.log("Gemini response received:", analysisText);

    await connectDB();

    const answer = new Answer({ body: analysisText });
    await answer.save();

    res.json({ analysis: analysisText });
  } catch (error) {
    console.error("Error in /analyze endpoint:", error);
    console.error("Error code:", error.code);
    console.error("Error name:", error.name);

    try {
      await connectDB();
      const answer = new Answer({ body: JSON.stringify(terraformPlanJSON) });
      await answer.save();
      console.log("Terraform plan saved to MongoDB");
    } catch (dbError) {
      console.error("Failed to save Terraform plan to MongoDB:", dbError);
    }

    res.json({
      analysis: terraformPlanJSON,
      note: "Saved Terraform plan (Gemini temporarily unavailable)",
    });
  }
});

app.get("/responses", async (req, res) => {
  try {
    console.log("Fetching all responses from MongoDB...");
    await connectDB();

    const answers = await Answer.find().sort({ date: -1 });
    console.log(`Found ${answers.length} responses`);

    res.json({
      count: answers.length,
      responses: answers,
    });
  } catch (error) {
    console.error("Error fetching responses:", error);
    res.status(500).json({ error: error.message });
  }
});

exports.handler = serverless(app);
