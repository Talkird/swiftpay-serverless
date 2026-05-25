const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error(
        "MONGODB_URI environment variable is not set. Set it via GitHub Secrets.",
      );
    }

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ MongoDB connected successfully");
    return mongoose;
  } catch (error) {
    console.error("✗ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.log("✗ MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("✗ MongoDB error:", error.message);
});

module.exports = connectDB;
