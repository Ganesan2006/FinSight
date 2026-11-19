require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const PORT = process.env.API_PORT || 4000;
// Bind to all host interfaces so the LAN address configured in the Expo app can reach it.
const API_HOST = process.env.API_HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "";
if (JWT_SECRET.length < 32 || JWT_SECRET === "change-me-in-production") {
  throw new Error("Set JWT_SECRET to a private random value of at least 32 characters in backend/.env.");
}

const SMS_SERVICE_URL = (process.env.SMS_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

module.exports = { PORT, API_HOST, JWT_SECRET, SMS_SERVICE_URL };
