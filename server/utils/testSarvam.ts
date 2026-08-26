import dotenv from "dotenv";
dotenv.config();

const key = process.env.VITE_SARVAM_API_KEY;
const prompt = `Output JSON: {"riskLevel": "high"}`;
const req = {
    model: 'sarvam-105b',
    messages: [{ role: 'system', content: prompt }, { role: 'user', content: "{}" }],
    stream: false
};

fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': key!
    },
    body: JSON.stringify(req)
})
    .then(r => r.json())
    .then(c => console.log("CONTENT:", c.choices?.[0]?.message?.content))
    .catch(e => console.error(e));
