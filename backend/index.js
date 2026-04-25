require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "https://quickaishort.online"],
    credentials: true,
  })
);
app.use(express.json());

// Database Connection
// Database Connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.warn("⚠️ MONGODB_URI not set in .env");
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    // Retry logic: Try again in 5 seconds
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// Global Error Handler for Uncaught Exceptions
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

// Routes
app.get("/", (req, res) => {
  res.json({ status: "active", service: "QuickAI Shorts Backend" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Import other routes here
// const authRoutes = require('./routes/auth');
// app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
