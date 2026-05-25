const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");
// Load environment variables from .env file (if present)
const { GoogleGenerativeAI } = require("@google/generative-ai");

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Function to call Infracost API
async function getInfracostAnalysis(terraformPlanJSON) {
  if (!process.env.INFRACOST_API_KEY) {
    console.log(
      "Infracost API key not configured, skipping Infracost analysis",
    );
    return null;
  }

  try {
    console.log("Calling Infracost API...");
    const infracostResponse = await fetch(
      "https://api.infracost.io/v1/estimate?currency=USD",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.INFRACOST_API_KEY,
        },
        body: JSON.stringify({
          terraform: {
            planJson: JSON.stringify(terraformPlanJSON),
          },
        }),
      },
    );

    if (!infracostResponse.ok) {
      throw new Error(
        `Infracost API returned ${infracostResponse.status}: ${infracostResponse.statusText}`,
      );
    }

    const infracostData = await infracostResponse.json();
    console.log("Infracost analysis received");
    return infracostData;
  } catch (error) {
    console.error("Error calling Infracost API:", error.message);
    return null;
  }
}

app.post("/analyze", async (req, res) => {
  const { terraformPlanJSON } = req.body;
  let infracostData = null;

  try {
    console.log("Starting analysis request...");

    // First, get Infracost analysis
    infracostData = await getInfracostAnalysis(terraformPlanJSON);

    // Prepare the prompt with Infracost data if available
    let prompt = `
    Analiza este reporte de costos de infraestructura de SwiftPay:
    ${JSON.stringify(terraformPlanJSON)}`;

    if (infracostData) {
      prompt += `
    
Análisis detallado de costos de Infracost:
${JSON.stringify(infracostData)}`;
    }

    prompt += `
    
    Genera un resumen breve en español:
    1. ¿Cuánto cambia el costo mensual?
    2. ¿Es una subida o bajada significativa?
    3. ¿Sugieres alguna optimización para ahorrar?`;

    console.log("Starting Gemini analysis...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();
    console.log("Gemini response received");

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
      const dataToSave = infracostData || terraformPlanJSON;
      const answer = new Answer({ body: JSON.stringify(dataToSave) });
      await answer.save();
      console.log("Infracost analysis saved to MongoDB");
    } catch (dbError) {
      console.error("Failed to save to MongoDB:", dbError);
    }

    res.json({
      analysis: infracostData || terraformPlanJSON,
      note: "Saved Infracost analysis (Gemini temporarily unavailable)",
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
