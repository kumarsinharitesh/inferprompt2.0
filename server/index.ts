import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { connectDatabase } from "./config/database";
import paymentsRouter from "./routes/payments";
import authRouter from "./routes/auth";
import riskRouter from "./routes/risk";
import inferenceRouter from "./routes/inference";

dotenv.config();

connectDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true // Crucial for sending HttpOnly cookies
}));
app.use(express.json());
app.use(cookieParser());

// Main healthcheck
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: "test" });
});

// Namespaces
app.use("/api/auth", authRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/risk", riskRouter);
app.use("/api/inference", inferenceRouter);

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});
