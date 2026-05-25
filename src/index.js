const mongoose = require("mongoose");
const connectDB = require("./mongoose/db.js");
const Answer = require("./mongoose/answers.js");

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const express = require("express");
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

const client = new BedrockRuntimeClient({ region: "us-east-1" });

app.post("/analyze", async (req, res) => {
  const { terraformPlanJSON } = req.body;

  const prompt = `
    Analiza este reporte de costos de infraestructura de SwiftPay:
    ${JSON.stringify(terraformPlanJSON)}
    
    Genera un resumen breve en español:
    1. ¿Cuánto cambia el costo mensual?
    2. ¿Es una subida o bajada significativa?
    3. ¿Sugieres alguna optimización para ahorrar?`;

  const input = {
    modelId: "qwen.qwen3-coder-next",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      inferenceConfig: { max_new_tokens: 500 },
    }),
  };

  try {
    console.log("Starting analysis request...");
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    const result = JSON.parse(new TextDecoder().decode(response.body));
    console.log("Bedrock response received:", result);

    await connectDB();

    const answer = new Answer({ body: result.content[0].text });
    await answer.save();

    res.json({ analysis: result.content[0].text });
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
      note: "Mock response (Bedrock temporarily unavailable)",
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
