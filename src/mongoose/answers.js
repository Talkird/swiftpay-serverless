import mongoose from "mongoose";
const { Schema } = mongoose;

const answerSchema = new Schema({
  body: String,
  date: { type: Date, default: Date.now },
});

export default mongoose.model("Answer", answerSchema);
