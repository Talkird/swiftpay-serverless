const mongoose = require("mongoose");
const { Schema } = mongoose;

const answerSchema = new Schema({
  body: String,
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Answer", answerSchema);
