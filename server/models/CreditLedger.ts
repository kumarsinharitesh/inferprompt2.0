import mongoose, { Document, Schema } from "mongoose";

export interface ICreditLedger extends Document {
    userId: mongoose.Types.ObjectId;
    type: "USAGE" | "PURCHASE" | "FREE" | "RESERVATION" | "REFUND";
    status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
    amount: number; // positive for purchase/refund/free, negative for usage/reservation
    description: string;
    reference?: string;
    idempotencyKey?: string;
    metadata?: any;
    completedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const CreditLedgerSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: ["USAGE", "PURCHASE", "FREE", "RESERVATION", "REFUND"], required: true },
        status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED"], default: "COMPLETED" },
        amount: { type: Number, required: true },
        description: { type: String, required: true },
        reference: { type: String },
        idempotencyKey: { type: String, index: true, sparse: true },
        metadata: { type: Schema.Types.Mixed },
        completedAt: { type: Date }
    },
    { timestamps: true }
);

export default mongoose.model<ICreditLedger>("CreditLedger", CreditLedgerSchema);
