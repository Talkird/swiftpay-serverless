const mongoose = require("mongoose");
const { Schema } = mongoose;

const answerSchema = new Schema({
  body: String,
  prNumber: String,
  author: String,
  branch: String,
  pullRequestState: {
    type: String,
    enum: ["open", "closed", "merged"],
    default: "open",
  },

  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Answer", answerSchema);
