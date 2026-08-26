import mongoose, { Document, Schema } from "mongoose";

export interface IOTP extends Document {
    email: string;
    code: string;
    expiresAt: Date;
}

const OTPSchema: Schema = new Schema({
    email: { type: String, required: true, index: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // MongoDB TTL auto-deletes
});

export default mongoose.model<IOTP>("OTP", OTPSchema);
