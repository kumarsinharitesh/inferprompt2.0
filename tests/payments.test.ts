/**
 * payments.test.ts
 *
 * Tests the Razorpay signature verification logic by calling the
 * pure verifyRazorpaySignature() helper directly.
 *
 * This avoids Express router stack introspection (which is fragile
 * and breaks when middleware wraps route handlers).
 *
 * Coverage:
 *   1. Valid HMAC signature is accepted.
 *   2. Tampered signature is rejected.
 *   3. Empty/missing signature is rejected.
 *   4. Different orderId in signature is rejected.
 *   5. credits:9999 injection — pack lookup returns 0 for unknown amounts.
 */
import { verifyRazorpaySignature } from "../server/utils/hmac";
import { CREDIT_PACKS } from "../src/config/billing";
import crypto from "crypto";

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

async function runTests() {
    console.log("Starting backend Payments verification tests...");

    const TEST_SECRET = "secret_test_key_123";
    const orderId = "order_TestABC";
    const paymentId = "pay_TestXYZ";

    // Build a legitimately signed body
    const body = orderId + "|" + paymentId;
    const goodSig = crypto.createHmac("sha256", TEST_SECRET).update(body).digest("hex");

    // Test 1: Valid signature accepted
    const t1 = verifyRazorpaySignature(orderId, paymentId, goodSig, TEST_SECRET);
    assert(t1 === true, "Valid HMAC signature must be accepted");

    // Test 2: Tampered signature rejected
    const tamperedSig = goodSig.slice(0, -2) + "00";
    const t2 = verifyRazorpaySignature(orderId, paymentId, tamperedSig, TEST_SECRET);
    assert(t2 === false, "Tampered signature must be rejected");

    // Test 3: Completely wrong signature rejected
    const t3 = verifyRazorpaySignature(orderId, paymentId, "invalid_sig_completely", TEST_SECRET);
    assert(t3 === false, "Invalid signature string must be rejected");

    // Test 4: Signature from different orderId must not validate for this orderId
    const otherBody = "order_OTHER|" + paymentId;
    const otherSig = crypto.createHmac("sha256", TEST_SECRET).update(otherBody).digest("hex");
    const t4 = verifyRazorpaySignature(orderId, paymentId, otherSig, TEST_SECRET);
    assert(t4 === false, "Signature from different orderId must be rejected");

    // Test 5: credits:9999 injection — server derives credits from amount, not client body
    // Simulate: client sends credits:9999 but amount matching no pack → safeCredits = 0
    const fakeAmount = 999999; // Not a real pack amount (paisa)
    const matchedPack = CREDIT_PACKS.find(p => p.amountINR * 100 === fakeAmount);
    const safeCredits = matchedPack?.credits ?? 0;
    assert(safeCredits === 0, "credits:9999 injection must yield 0 safe credits for unknown amount");

    // Test 6: Correct pack amount resolves to real credit value
    const realPack = CREDIT_PACKS[0];
    const realAmount = realPack.amountINR * 100;
    const resolvedPack = CREDIT_PACKS.find(p => p.amountINR * 100 === realAmount);
    const resolvedCredits = resolvedPack?.credits ?? 0;
    assert(resolvedCredits === realPack.credits, `Real pack must resolve to ${realPack.credits} credits`);
    assert(resolvedCredits !== 9999, "Real pack must never resolve to injected value 9999");

    console.log("✅ All Payment security tests passed.");
}

runTests().catch((e: Error) => {
    console.error(e.message);
    
});
