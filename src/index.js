const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

app.post("/analyze", async (req, res) => {
  const infracostJSON = req.body;

  try {
    const prompt = `
    Analiza este reporte de costos de infraestructura de SwiftPay:
    ${JSON.stringify(infracostJSON)}
    
    Genera un resumen breve en español:
    1. ¿Cuál es el costo mensual?
    2. ¿Sugieres alguna optimización para ahorrar?`;

    const anthropicResponse = await client.messages.create({
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      model: "claude-opus-4-7",
    });

    const analysisText = anthropicResponse.content;
    console.log("AI response received");

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
      const answer = new Answer({ body: JSON.stringify(infracostJSON) });
      await answer.save();

      console.log("Infracost analysis saved to MongoDB");
    } catch (dbError) {
      console.error("Failed to save to MongoDB:", dbError);
    }

    res.json({
      analysis: infracostJSON,
      note: "Saved Infracost analysis (AI temporarily unavailable)",
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
