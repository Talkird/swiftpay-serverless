terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# --- S3 Bucket for Lambda Deployment Package ---
data "aws_s3_bucket" "lambda_deployment" {
  bucket = "swiftpay-terraform-serverless-state"
}

resource "aws_s3_object" "lambda_zip" {
  bucket = data.aws_s3_bucket.lambda_deployment.id
  key    = "function.zip"
  source = "../function.zip"
  etag   = filemd5("../function.zip")
}

# --- Lambda Role and Permissions ---
data "aws_iam_role" "lambda_role" {
  name = "swiftpay-lambda-role"
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = data.aws_iam_role.lambda_role.name
}

resource "aws_iam_role_policy" "bedrock_policy" {
  name = "swiftpay-bedrock-policy"
  role = data.aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["bedrock:InvokeModel"]
      Effect   = "Allow"
      Resource = "arn:aws:bedrock:${var.region}::foundation-model/qwen.qwen3-coder-next"
    }]
  })
}

# --- Lambda Function ---
data "aws_lambda_function" "swiftpay_lambda" {
  function_name = var.lambda_function_name
}

resource "null_resource" "update_lambda_code" {
  triggers = {
    zip_hash = filemd5("../function.zip")
  }

  provisioner "local-exec" {
    command = "aws lambda update-function-code --function-name ${data.aws_lambda_function.swiftpay_lambda.function_name} --s3-bucket ${data.aws_s3_bucket.lambda_deployment.id} --s3-key ${aws_s3_object.lambda_zip.key} --region ${var.region}"
  }

  depends_on = [aws_s3_object.lambda_zip, null_resource.update_lambda_env]
}

resource "null_resource" "update_lambda_env" {
  triggers = {
    mongodb_uri = var.mongodb_uri
    gemini_api_key = var.gemini_api_key
  }

  provisioner "local-exec" {
    command = "aws lambda update-function-configuration --function-name ${data.aws_lambda_function.swiftpay_lambda.function_name} --environment Variables={MONGODB_URI='${var.mongodb_uri}',GEMINI_API_KEY='${var.gemini_api_key}'} --region ${var.region}"
  }

  depends_on = [aws_s3_object.lambda_zip]
}

# --- API Gateway ---
resource "aws_apigatewayv2_api" "api" {
  name          = "swiftpay-api"
  protocol_type = "HTTP"
}
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id             = aws_apigatewayv2_api.api.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  payload_format_version = "2.0"
  integration_uri    = data.aws_lambda_function.swiftpay_lambda.invoke_arn
}

resource "aws_apigatewayv2_route" "api_route_post" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /analyze"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"

  depends_on = [aws_apigatewayv2_integration.lambda_integration]
}

resource "aws_apigatewayv2_route" "api_route_get" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /responses"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"

  depends_on = [aws_apigatewayv2_integration.lambda_integration]
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = data.aws_cloudwatch_log_group.api_gateway_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integration.latency"
    })
  }
}

data "aws_cloudwatch_log_group" "api_gateway_logs" {
  name = "/aws/apigateway/swiftpay-api"
}

# --- Lambda Permission for API Gateway ---
resource "aws_lambda_permission" "apigw" {
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.swiftpay_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}