import { initializeCredits, getCreditBalance, consumeCredit, addCredits, getPaymentHistory } from "../src/utils/creditStore";

// Mock localStorage securely 
const mockStorage: Record<string, string> = {};
global.localStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => {
        for (const key in mockStorage) delete mockStorage[key];
    },
    length: 0,
    key: () => null
};
global.window = {} as any;

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTests() {
    console.log("Starting Credit Store tests...");
    localStorage.clear();

    // Test initialization bounds
    initializeCredits();
    let b = getCreditBalance();
    assert(b.balance === 5, "Initialized to exactly 5 credits.");

    // Test duplicate initialization block
    initializeCredits();
    b = getCreditBalance();
    assert(b.balance === 5, "Repeated initialization ignored properly.");

    // Test consumption logic
    const consumed = consumeCredit(1, "Test logic");
    assert(consumed === true, "Allowed valid consumption");

    b = getCreditBalance();
    assert(b.balance === 4, "Properly removed 1 credit");
    assert(b.totalUsed === 1, "Tracked usage auditing natively");

    // Insufficient 
    consumeCredit(4, "Burn remaining");
    b = getCreditBalance();
    assert(b.balance === 0, "Drained fully.");

    const badConsume = consumeCredit(1, "Failed deduct");
    assert(!badConsume, "Prevented negative deduction");
    assert(getCreditBalance().balance === 0, "Balance stayed 0");

    // Recharging
    addCredits(100, "Purchase", "pay_test");
    b = getCreditBalance();
    assert(b.balance === 100, "Recharged payload seamlessly");
    assert(b.totalPurchased === 100, "Tracked purchase history externally");

    // Recharging exact same payment string MUST BE BLOCKED natively 
    addCredits(100, "Malicious duplicate webhook", "pay_test");
    assert(getCreditBalance().balance === 100, "Duplicate test transaction prevented seamlessly.");

    addCredits(-100, "Negative string Injection", "pay_neg");
    assert(getCreditBalance().balance === 100, "Negative balance injections gracefully blocked.");

    console.log("✅ Credit Store verification passed.");
}

try {
    runTests();
    
} catch (e: any) {
    console.error(e.message);
    
}
