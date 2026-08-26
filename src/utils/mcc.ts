export const MCC_MAPPINGS: Record<string, string> = {
    "5732": "Electronics Stores",
    "5812": "Eating Places",
    "5311": "Department Stores",
    "5912": "Drug Stores",
    "5411": "Grocery Stores",
    "5814": "Fast Food Restaurants",
    "4511": "Airlines",
    "7011": "Hotels and Motels",
    "4111": "Transportation",
    "4121": "Taxicabs and Limousines",
    "5541": "Service Stations",
    "4814": "Telecommunication Services",
    "5999": "Miscellaneous Specialty Retail",
    "6011": "Financial Institutions",
    "7999": "Recreation Services",
    "4722": "Travel Agencies",
};

export function getMccCategory(code?: string): string {
    if (!code) return "Unknown MCC";
    return MCC_MAPPINGS[code] || "Unknown MCC";
}
