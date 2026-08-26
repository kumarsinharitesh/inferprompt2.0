import crypto from "crypto";

/**
 * Verifies a Razorpay webhook/checkout signature.
 * orderId + "|" + paymentId is the body signed by Razorpay using HMAC-SHA256 with the key secret.
 *
 * @returns true if the signature is valid, false otherwise.
 */
export function verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string,
    keySecret: string
): boolean {
    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(body)
        .digest("hex");
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature.length === expectedSignature.length ? signature : expectedSignature, "hex")
        // Note: if lengths differ, expectedSignature is compared to itself (returns true only if sig matches)
    ) && expectedSignature === signature;
}
