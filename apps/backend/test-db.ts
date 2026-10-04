import mongoose from "mongoose";

console.log("1. Starting connection test...");

try {
  await mongoose.connect("mongodb://127.0.0.1:27017/codeAgg", {
    serverSelectionTimeoutMS: 3000, // Fail fast after 3s if unreachable
  });
  console.log("2. SUCCESS: Connected to Docker MongoDB!");
  await mongoose.disconnect();
} catch (err) {
  console.error("2. ERROR: Failed to connect:", err);
}