import mongoose, { Document, Schema } from "mongoose";

export interface IInferenceSession extends Document {
    userId: mongoose.Types.ObjectId;
    sessionId: string;
    provider: string;
    totalTokens: number;
    latencyMs: number;
    source: "playground";
    status: "completed";
}

const InferenceSessionSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        sessionId: { type: String, required: true },
        provider: { type: String, required: true },
        totalTokens: { type: Number, required: true },
        latencyMs: { type: Number, required: true },
        // Keep analytics records explicitly scoped to a completed Playground
        // inference. Diff and risk analysis use their own collections.
        source: { type: String, enum: ["playground"], required: true },
        status: { type: String, enum: ["completed"], required: true },
    },
    { timestamps: true }
);

InferenceSessionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IInferenceSession>("InferenceSession", InferenceSessionSchema);
