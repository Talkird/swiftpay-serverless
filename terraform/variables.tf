variable "region" {
  description = "Región de AWS"
  type        = string
  default     = "us-east-1"
}

variable "lambda_function_name" {
  description = "Nombre de la función Lambda"
  type        = string
  default     = "swiftpay-ai-analyzer"
}

variable "bucket_name" {
  description = "Bucket S3 para el frontend"
  type        = string
  default     = "swiftpay-frontend-app"
}