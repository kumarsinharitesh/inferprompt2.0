export type Provider = "sarvam" | "openrouter" | "gemini" | "groq";

export interface InferenceRequest {
  mode: "text" | "audio";
  text?: string;
  audioBlob?: Blob;
  provider: Provider;
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface InferenceProvider {
  streamResponse(request: InferenceRequest): Promise<ReadableStream<Uint8Array>>;
}

export type StreamingStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "aborted";

export interface SessionMetrics {
  tokenCount: number;
  tokensPerSec: number;
  latencyMs: number;
  similarityPct: number;
  added: number;
  removed: number;
  unchanged: number;
}

export interface DiffToken {
  text: string;
  type: "equal" | "insert" | "delete";
}

export interface DiffResult {
  tokensA: DiffToken[];
  tokensB: DiffToken[];
  stats: {
    added: number;
    removed: number;
    unchanged: number;
    similarityPct: number;
  };
}

/**
 * A persisted snapshot of one successfully completed inference session.
 * Only "done" sessions are stored — aborted/errored runs are not persisted.
 * Optional fields are reserved for future phases (diff wiring, risk analysis).
 */
export interface SessionRecord {
  /** Unique identifier — crypto.randomUUID() */
  id: string;
  /** Unix timestamp (ms) at stream completion */
  timestamp: number;
  /** User prompt, truncated to 200 chars before storage */
  prompt: string;
  /** The provider used for this inference */
  provider: Provider;
  /** Total tokens streamed */
  tokenCount: number;
  /** Tokens per second at completion */
  tokensPerSec: number;
  /** End-to-end latency in milliseconds */
  latencyMs: number;
  /** Similarity percentage from ABTD diff — populated in a future phase */
  similarityPct?: number;
  /** First 300 chars of model output — for future display in history */
  outputPreview?: string;
}

export type ChartType = "bar" | "pie" | "line" | "table";
export interface AnalyticsDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ProviderMeta {
  id: Provider;
  label: string;
  description: string;
  requiresKey: boolean;
  envKey?: string;
  docsUrl?: string;
}

// ---------------------------------------------------------------------------
// Risk Analyzer — Domain Types
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskRecommendation = "ALLOW" | "REVIEW" | "BLOCK";

export interface ModelReasoningComparison {
  providerA: Provider;
  providerB: Provider;
  resultA: ModelRiskResult;
  resultB: ModelRiskResult;
  similarityPct: number;
  diffTokensA?: DiffToken[]; // Optional due to dropping raw sizes from persistence
  diffTokensB?: DiffToken[];
}

export interface RiskAnalysisResult {
  id: string;
  timestamp: string;
  transaction: TransactionData;
  platformRisk: PlatformRiskResult;
  modelResults: ModelRiskResult[];
  consensus: ConsensusResult | null;
  reasoningComparisons: ModelReasoningComparison[];
}

// ---------------------------------------------------------------------------
// Billing & Credit Domain
// ---------------------------------------------------------------------------

export interface CreditBalance {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
}

export interface CreditTransaction {
  id: string;
  timestamp: string;
  type: "FREE" | "PURCHASE" | "USAGE";
  credits: number;
  description: string;
  referenceId?: string;
}

export type PaymentStatus = "created" | "pending" | "success" | "failed" | "cancelled" | "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING";

export interface PaymentRecord {
  id: string;
  timestamp: string;
  orderId?: string;
  paymentId?: string;
  /** Razorpay amount in paise, not rupees. */
  amount: number;
  currency: string;
  credits: number;
  status: PaymentStatus;
  provider: "razorpay-test";
}

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AED" | "SGD" | "JPY" | "AUD";
export type DeviceType = "Mobile" | "Desktop" | "Tablet" | "Unknown";

// Phase 12 Types
export type MerchantVerificationStatus = "VERIFIED" | "UNVERIFIED" | "ANONYMOUS";
export type PaymentVerificationStatus = "VERIFIED" | "FAILED" | "NOT_VERIFIED";
export type PaymentMethod = "CARD" | "UPI" | "NET_BANKING" | "WALLET" | "BANK_TRANSFER" | "OTHER";

export interface CardContext {
  cardType?: "CREDIT" | "DEBIT";
  cardNetwork?: "VISA" | "MASTERCARD" | "RUPAY" | "AMEX" | "OTHER";
  cardPresent?: boolean;
  threeDS?: "VERIFIED" | "FAILED" | "NOT_AVAILABLE";
  cvvVerification?: "VERIFIED" | "FAILED" | "NOT_AVAILABLE";
  avsStatus?: "MATCH" | "PARTIAL" | "MISMATCH" | "NOT_AVAILABLE";
  internationalCard?: boolean;
  transactionMode?: "ONLINE" | "OFFLINE";
  posType?: "SWIPE" | "TAP" | "CHIP" | "CONTACTLESS";
}

export interface UPIContext {
  upiVerification?: "VERIFIED" | "FAILED" | "NOT_VERIFIED";
  collectRequest?: boolean;
  upiApp?: "GOOGLE_PAY" | "PHONEPE" | "PAYTM" | "OTHER";
}

export interface NetBankingContext {
  bankVerification?: "VERIFIED" | "FAILED" | "NOT_VERIFIED";
  accountHolderVerified?: boolean;
}

export interface POSContext {
  transactionType?: "SWIPE" | "CHIP" | "CONTACTLESS";
  cardPresent?: boolean;
  terminalVerified?: boolean;
  pinVerification?: "VERIFIED" | "FAILED" | "NOT_AVAILABLE";
}

export interface WalletContext {
  walletProvider?: "PAYTM" | "PHONEPE" | "GOOGLE_PAY" | "OTHER";
  walletVerification?: "VERIFIED" | "FAILED" | "NOT_VERIFIED";
  kycStatus?: "VERIFIED" | "NOT_VERIFIED" | "UNKNOWN";
}

export interface BankTransferContext {
  bankVerification?: "VERIFIED" | "FAILED" | "NOT_VERIFIED";
  beneficiaryVerified?: boolean;
}

export interface OfferContext {
  offerPresent: boolean;
  offerType?: "DISCOUNT" | "CASHBACK" | "COUPON" | "LIMITED_TIME" | "OTHER";
  discountPercentage?: number;
  offerVerification?: "VERIFIED" | "UNVERIFIED" | "NOT_APPLICABLE";
}

/** Core payment transaction input provided by the user. */
export interface TransactionData {
  amount: number;
  currency: Currency;
  country: string;
  merchantName: string;

  // Phase 12 Additions
  merchantVerification?: MerchantVerificationStatus;
  mccCode?: string;
  paymentMethod?: PaymentMethod;
  paymentVerification?: PaymentVerificationStatus;

  cardDetails?: CardContext;
  upiDetails?: UPIContext;
  netBankingDetails?: NetBankingContext;
  posDetails?: POSContext;
  walletDetails?: WalletContext;
  bankTransferDetails?: BankTransferContext;

  offer?: OfferContext;

  /** Months the merchant has been in business. */
  merchantAge?: number;
  deviceType?: DeviceType;
  isNewDevice?: boolean;
  failedAttempts?: number;
  /** ISO 8601 timestamp of the transaction. */
  transactionTimestamp?: string;
  ipCountry?: string;
  userCountry?: string;
  previousTransactionCount?: number;
}

/**
 * A single explanatory factor surfaced by the Risk Engine.
 * Populated by the analysis pipeline in a future phase.
 */
export interface RiskFactor {
  name: string;
  severity: RiskLevel;
  description: string;
  evidence?: string;
  fieldRefs?: string[];
  supported?: boolean;
  supportType?: "DIRECT_FIELD" | "DERIVED_FIELD" | "MCC_LOOKUP" | "CROSS_FIELD" | "UNSUPPORTED";
  allowedForDecision?: boolean;
}

/** Typed payload constructed by the UI and consumed by the analysis pipeline. */
export interface RiskAnalysisRequest {
  transaction: TransactionData;
  /** Provider IDs of the LLMs selected for analysis. */
  selectedModels: Provider[];
}

/** Normalized structured output from a single LLM provider for a risk analysis. */
export interface ModelRiskResult {
  provider: Provider;
  riskLevel: RiskLevel;
  riskScore: number;
  confidence: number;
  riskFactors: RiskFactor[];
  recommendation: RiskRecommendation;
  reasoning: string;
  latencyMs?: number;
  tokenCount?: number;
  /** Present if the model failed to respond, timed out, or returned invalid JSON. */
  error?: string;
}

/** Deterministic platform score derived independent of LLMs. */
export interface PlatformRiskResult {
  score: number;
  level: RiskLevel;
  recommendation: RiskRecommendation;
  factors: RiskFactor[];
}

export interface FactorConsensus {
  name: string;
  modelCount: number;
  percentage: number;
  models: Provider[];
}

export interface ConsensusResult {
  modelCount: number;
  successfulModelCount: number;
  failedModelCount: number;
  consensusRiskLevel: RiskLevel;
  consensusRecommendation: RiskRecommendation;
  averageModelRiskScore: number;
  medianModelRiskScore: number;
  modelAgreementPct: number;
  riskLevelAgreementPct: number;
  platformModelDifference: {
    platformScore: number;
    modelAverage: number;
    difference: number;
  };
  factorAgreement: {
    common: FactorConsensus[];
    modelSpecific: FactorConsensus[];
  };
}
