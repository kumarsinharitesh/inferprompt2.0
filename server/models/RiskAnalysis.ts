import mongoose, { Document, Schema } from "mongoose";

export interface IRiskAnalysis extends Document {
    userId: mongoose.Types.ObjectId;
    analysisId: string;
    transactionSnapshot: any; // Immutable record of the transaction at execution time
    deterministicEvidence?: any; // The factual pipeline mapping
    platformRisk?: any; // Platform deterministic overrides
    modelResults: any[];
    validatedModelResults?: any[]; // Trimmed mapping of reliable claims natively
    consensus?: any;
    abtd?: any; // Reasoning Comparison only
    finalDecision?: any; // The actual unified orchestrator output action 
    creditsConsumed?: number;
    creditTransactionId?: mongoose.Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

const RiskAnalysisSchema: Schema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        analysisId: { type: String, required: true },
        transactionSnapshot: { type: Schema.Types.Mixed, required: true },
        deterministicEvidence: { type: Schema.Types.Mixed },
        platformRisk: { type: Schema.Types.Mixed },
        modelResults: { type: [Schema.Types.Mixed], default: [] },
        validatedModelResults: { type: [Schema.Types.Mixed], default: [] },
        consensus: { type: Schema.Types.Mixed },
        abtd: { type: Schema.Types.Mixed },
        finalDecision: { type: Schema.Types.Mixed },
        creditsConsumed: { type: Number, default: 0 },
        creditTransactionId: { type: Schema.Types.ObjectId, ref: "CreditLedger" }
    },
    { timestamps: true }
);

RiskAnalysisSchema.index({ userId: 1, createdAt: -1 });
RiskAnalysisSchema.index({ userId: 1, analysisId: 1 }, { unique: true }); // Enforce idempotency at DB level

export default mongoose.model<IRiskAnalysis>("RiskAnalysis", RiskAnalysisSchema);
