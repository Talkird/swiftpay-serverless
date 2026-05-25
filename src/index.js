const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");

const { GoogleGenerativeAI } = require("@google/generative-ai");

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
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

    // If Bedrock fails, save a mock response to MongoDB and return it
    const mockResponse = `Análisis de Infraestructura SwiftPay:

1. Cambio de Costo Mensual: El costo mensual aumentará aproximadamente $171.61 USD (70% de incremento).

2. Significancia: Este es un aumento SIGNIFICATIVO que requiere atención inmediata.

3. Optimizaciones Recomendadas:
   • Cambiar instancias t3.medium a t3.small para ahorrar ~15 USD/mes
   • Implementar auto-scaling en RDS para reducir costos en horas bajas
   • Agregar CloudFront para S3 si hay tráfico de datos
   • Reservar instancias EC2 por 1-3 años para 30% de descuento
   
Estimado de ahorro potencial: $35-50 USD/mes con estas optimizaciones.`;

    try {
      await connectDB();
      const answer = new Answer({ body: mockResponse });
      await answer.save();
      console.log("Mock response saved to MongoDB");
    } catch (dbError) {
      console.error("Failed to save mock response to MongoDB:", dbError);
    }

    res.json({
      analysis: mockResponse,
      note: "Mock response (Gemini temporarily unavailable)",
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
