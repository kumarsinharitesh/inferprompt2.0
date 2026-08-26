import mongoose, { Document, Schema } from "mongoose";

export interface ICreditBalance extends Document {
    userId: mongoose.Types.ObjectId;
    balance: number;
    totalPurchased: number;
    totalUsed: number;
}

const CreditBalanceSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        balance: { type: Number, required: true, default: 0, min: 0 },
        totalPurchased: { type: Number, required: true, default: 0 },
        totalUsed: { type: Number, required: true, default: 0 },
    },
    { timestamps: true }
);

export default mongoose.model<ICreditBalance>("CreditBalance", CreditBalanceSchema);
