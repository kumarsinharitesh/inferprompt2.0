import mongoose, { Document, Schema } from "mongoose";

export interface IPayment extends Document {
    userId: mongoose.Types.ObjectId;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    amount: number;
    currency: string;
    credits: number;
    status: string;
}

const PaymentSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        razorpayOrderId: { type: String, required: true },
        razorpayPaymentId: { type: String, required: true, unique: true }, // Idempotency guarantee
        amount: { type: Number, required: true },
        currency: { type: String, required: true },
        credits: { type: Number, required: true },
        status: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.model<IPayment>("Payment", PaymentSchema);
