const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

//test
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
    modelId: "amazon.nova-micro-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      inferenceConfig: { max_new_tokens: 500 },
    }),
  };

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);

    const result = JSON.parse(new TextDecoder().decode(response.body));
    res.json({ analysis: result.content[0].text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.handler = serverless(app);
