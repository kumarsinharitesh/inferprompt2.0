import mongoose from "mongoose";

export async function connectDatabase() {
    // MONGODB_URI is the documented name; keep MONGO_URI as a backwards-
    // compatible fallback for already deployed Render environments.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error("CRITICAL: MONGODB_URI is not defined in the environment.");
        process.exit(1);
    }
    try {
        await mongoose.connect(uri);
        console.log("MongoDB connected securely.");
    } catch (err) {
        console.error("MongoDB connection failed:", err);
        process.exit(1);
    }
}
