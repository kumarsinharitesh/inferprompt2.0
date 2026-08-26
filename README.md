# InferPrompt

InferPrompt evaluates complex payment transaction structures utilizing an overarching **Deterministic Rule-Based Risk Baseline** seamlessly integrating and comparing reasoning derivations concurrently across multiple LLM integrations executing Risk Analysis operations intuitively dynamically.

## 1. What is InferPrompt?
InferPrompt is a highly parallelized Risk Analytics frontend and backend proxy evaluating incoming transaction profiles accurately against rule-based heuristic bounds natively scaling concurrent transactions through multiple AI models (Sarvam, OpenRouter, Gemini, Groq). By isolating individual AI LLM risk scoring engines accurately, and parsing those arrays explicitly into a unified `Consensus Engine`, it identifies statistical drifts predicting accurately whether different platforms disagree on specific transaction constraints utilizing ABTD reasoning mapping!

## 2. Core Problem
Modern Risk platforms depend almost exclusively on deterministic static bounds or black-box enterprise risk engines which are notoriously opaque. When a $50,000 transaction from an anomalous location blocks automatically, understanding "Why?" or seeking an unbiased 2nd/3rd opinion across LLMs proves critically useful for Analyst manual-review nodes.

## 3. Key Features
- **Multi-LLM Risk Analysis**: Concurrently proxy transactions against up to 5 LLMs visually analyzing derivations.
- **Deterministic Risk Baseline**: InferPrompt's static rule-based mathematical proxy bounding structural anomalies statically!
- **Consensus Engine**: Determines numerical overlap arrays outlining agreement vectors clearly natively separating platform results completely.
- **ABTD Reasoning Comparison**: Iterates through LLM derivations natively producing line-by-line semantic diffs mapping specifically where AI models agreed vs deviated explicitly producing visual reasoning matrices completely clearly identifying contextual logic overlaps!
- **Payment Risk Analytics**: Caches historical arrays bounding multi-level transactions completely storing aggregated metrics seamlessly. 
- **Razorpay Test Mode**: Integrated dynamically testing full checkout gateways natively tracking localized mock accounting safely!

## 4. Architecture
The codebase strictly decouples backend operations securely operating native NodeJS Express routines bypassing React limitations effortlessly:
```
src/
  components/       # UI Overlays (Risk Analyzer, ABTD limits)
  pages/            # Main Routing Structures
  services/         # External Fetch hooks and Risk Parsing Engine
  utils/            # Local Storage and Helper utilities 
  config/           # Centralized mappings
  types/            # Shared Typescript schema

server/             
  routes/payments.ts # Express endpoints operating Mock Razorpay boundaries 
```

## 5. Multi-LLM Risk Assessment & ABTD
Our asynchronous `.streamResponse` structure orchestrates multiple AI queries parsing strict structural schemas natively outputting structured JSON conditionally determining distinct metrics mapping Risk level, Confidence bounds, Risk Factors, and Textual Reasoning dynamically against ABTD diff boundaries seamlessly. 

## 6. Credit System & Analytics 
Execution limits are heavily controlled mitigating spam recursively caching `Free Tier` credits conditionally triggering functional Mock checkout bindings mapping Razorpay architectures locally mapping success/failed boundaries resiliently completely isolating environment secrets natively avoiding frontend bundles tracking dynamically properly. 

## 7. Local Development Setup
**Prerequisites**:
`Node v18+` natively.

**Installation**:
```bash
npm install
```

**Starting Concurrently (Frontend + Express Backend)**:
```bash
npm run dev 
```

## 8. Environment Variables
You must establish an `.env` matching the schema provided natively within `.env.example`:
```
VITE_API_BASE_URL=http://localhost:3001
RAZORPAY_KEY_ID=<mock-publishable>
RAZORPAY_KEY_SECRET=<mock-secret>
```
*   The system executes strictly in Razorpay TEST mode. 

## 9. Important Limitations
*   **The deterministic risk engine is a transparent prototype heuristic, not a production-grade fraud detection model.**
*   Razorpay integration currently uses TEST MODE explicitly. 
*   LocalStorage is utilized exclusively for demo local persistence correctly. Production deployments demand authenticated Postgres persistence endpoints scaling accurately securely correctly. 
