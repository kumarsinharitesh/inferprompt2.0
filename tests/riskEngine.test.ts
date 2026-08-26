import { calculateRiskScore } from "../src/services/riskEngine.js";

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function runTests() {
    console.log("Starting riskEngine deterministic tests...");

    // 1. Completely low-risk transaction
    const t1 = calculateRiskScore({
        amount: 100,
        currency: "USD",
        country: "US",
        merchantName: "SafeShop",
        merchantAge: 24,
        deviceType: "Mobile",
        isNewDevice: false,
        failedAttempts: 0,
        previousTransactionCount: 50,
        ipCountry: "US",
        userCountry: "US",
        transactionTimestamp: "2026-08-22T14:30:00Z"
    });
    assert(t1.score === 0, "Test 1: Score should be 0");
    assert(t1.level === "LOW", "Test 1: Level should be LOW");
    assert(t1.recommendation === "ALLOW", "Test 1: Rec should be ALLOW");
    assert(t1.factors.length === 0, "Test 1: Should have no factors");

    // 2. New device only (Weight 20)
    const t2 = calculateRiskScore({ amount: 100, currency: "USD", country: "US", merchantName: "Shop", isNewDevice: true });
    assert(t2.score === 20, "Test 2: Score should be 20");
    assert(t2.level === "LOW", "Test 2: Level should be LOW");
    assert(t2.factors[0].name === "New Device", "Test 2: Factor name mismatch");

    // 3. Multiple failed attempts (Weight 30 for 4+)
    const t3 = calculateRiskScore({ amount: 100, currency: "USD", country: "US", merchantName: "Shop", failedAttempts: 5 });
    assert(t3.score === 30, "Test 3: Score should be 30");

    // 4. New merchant (0 months) (Weight 20)
    // Ensure that explicit 0 is handled differently than undefined!
    const t4 = calculateRiskScore({ amount: 100, currency: "USD", country: "US", merchantName: "Shop", merchantAge: 0 });
    assert(t4.score === 20, "Test 4: Score should be 20 for 0 month age");
    assert(t4.factors[0].name === "New Merchant", "Test 4: Factor name mismatch");

    // 5. Location mismatch (Weight 25)
    const t5 = calculateRiskScore({ amount: 100, currency: "USD", country: "US", merchantName: "Shop", ipCountry: "IN", userCountry: "UK" });
    assert(t5.score === 25, "Test 5: Score should be 25");

    // 6. Late-night transaction (Weight 15) Make sure to test in local hour via JS Date parsing.
    // 03:00 UTC = 03:00 local if using dummy Date parse across timezones? 
    // Wait, Date.getHours() is local time. If the string isn't Z, it implies local. 
    // We'll pass a string without Z that parses to 03:00 local time
    const d = new Date();
    d.setHours(3, 0, 0, 0); // Force 3 AM local time
    const t6 = calculateRiskScore({ amount: 100, currency: "USD", country: "US", merchantName: "Shop", transactionTimestamp: d.toISOString() });
    assert(t6.score === 15, "Test 6: Score should be 15 for night time");

    // 7. Multiple risk factors combined
    const t7 = calculateRiskScore({
        amount: 60000,           // 20
        currency: "USD", country: "US", merchantName: "Shop",
        isNewDevice: true,       // 20
        failedAttempts: 2,       // 15
        merchantAge: 3,          // 5
    });
    assert(t7.score === 60, `Test 7: Score should be 60, got ${t7.score}`);
    assert(t7.level === "HIGH", "Test 7: Level should be HIGH");
    assert(t7.recommendation === "REVIEW", "Test 7: Recommendation should be REVIEW");

    // 8. Missing optional fields
    // Must contribute 0
    const t8 = calculateRiskScore({ amount: 15, currency: "USD", country: "US", merchantName: "Shop", isNewDevice: undefined, merchantAge: undefined, failedAttempts: undefined, ipCountry: undefined });
    assert(t8.score === 0, "Test 8: Missing fields must contribute 0 risk");

    // 9. Invalid timestamp
    const t9 = calculateRiskScore({ amount: 15, currency: "USD", country: "US", merchantName: "Shop", transactionTimestamp: "INVALID_DATE_STRING" });
    assert(t9.score === 0, "Test 9: Invalid timestamp must contribute 0 risk");

    // 10. Score never exceeds 100
    const t10 = calculateRiskScore({
        amount: 999999,          // 20
        currency: "USD", country: "US", merchantName: "X",
        isNewDevice: true,       // 20
        failedAttempts: 25,      // 30
        merchantAge: 0,          // 20
        ipCountry: "A", userCountry: "B", // 25
    }); // Total = 115
    assert(t10.score === 100, `Test 10: Score must be clamped to 100 (got ${t10.score})`);
    assert(t10.level === "CRITICAL", "Test 10: Level must be CRITICAL");
    assert(t10.recommendation === "BLOCK", "Test 10: Recommendation must be BLOCK");

    // 11. Score never goes below 0 (there are no negative factors right now anyway, but testing logic bounding)
    const t11 = calculateRiskScore({ amount: 10, currency: "USD", country: "US", merchantName: "X" });
    assert(t11.score === 0, "Test 11: Base score shouldn't be negative");

    // 12. Deterministic output
    const t12_1 = calculateRiskScore({ amount: 500, currency: "USD", country: "US", merchantName: "X", isNewDevice: true });
    const t12_2 = calculateRiskScore({ amount: 500, currency: "USD", country: "US", merchantName: "X", isNewDevice: true });
    assert(t12_1.score === t12_2.score && t12_1.level === t12_2.level, "Test 12: Same input must produce same result");

    console.log("✅ All 12 deterministic riskEngine tests passed.");
}

try {
    runTests();
    
} catch (e) {
    console.error((e as Error).message);
    
}
