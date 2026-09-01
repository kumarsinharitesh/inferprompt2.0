export const FREE_CREDITS = 5;

export interface CreditPack {
    id: string;
    credits: number;
    amountINR: number;
    label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
    {
        id: "risk-50",
        credits: 50,
        amountINR: 99,
        label: "50 Credits"
    }
];
