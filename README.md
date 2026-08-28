# InferPrompt

InferPrompt is a full-stack workspace for testing LLM responses and reviewing payment-risk decisions. It combines a streaming playground, multi-model risk analysis, model comparison, usage analytics, credits, and Razorpay test-mode billing.

The deterministic risk engine provides a transparent baseline. Selected LLMs contribute independent opinions, and the consensus view makes agreement, disagreement, and evidence easy to inspect.

## What you can do

- Run text prompts and view streamed provider responses in the Playground.
- Analyse a payment transaction with Sarvam AI, OpenRouter, Gemini, or Groq.
- Compare model risk scores, recommendations, factors, and reasoning.
- Review deterministic flags, model consensus, and historical analytics.
- Manage API keys, usage credits, and Razorpay test-mode purchases.

## Project structure

```
src/       React + Vite frontend
server/    Express API, authentication, payments, and risk orchestration
public/    Static frontend files
tests/     Automated tests
```

The Express server also uses shared types and provider code from `src/`, so deploy the complete repository for the backend rather than the `server/` folder alone.

## Run locally

### Prerequisites

- Node.js 18 or newer
- A MongoDB database
- API keys only for the LLM providers you want the platform to supply

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in the values you need:

   ```bash
   copy .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env`.

3. Start the frontend and backend together:

   ```bash
   npm run dev
   ```

   The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:3001`. Vite proxies `/api` requests to the API during development.

## Useful commands

```bash
npm run dev          # frontend and backend together
npm run dev:frontend # Vite frontend only
npm run dev:backend  # Express API only
npm run build        # production frontend build and TypeScript check
npm test             # automated test suite
```

## Environment variables

Use `.env.example` as the reference. Never commit `.env`; it is already ignored by Git.

Required for the full application:

- `MONGO_URI` – MongoDB connection string.
- `JWT_SECRET` – long random value used to sign sessions.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` – Razorpay **test-mode** credentials for credit purchases.
- `EMAIL_USER` and `EMAIL_PASS` – SMTP credentials for email verification and password resets.

LLM keys are optional platform keys. When set on the backend, users can use that provider without entering their own key. Users can still add a personal key in the Keys panel.

## Deployment

- **Vercel:** deploy the frontend build from the repository root.
- **Fly.io or another Node host:** deploy the complete repository and run the Express service from `server/index.ts` through `npm run dev:backend` locally or the equivalent production start command.
- Configure the same server-side environment variables in the backend host. Do not expose secret keys through `VITE_` variables in production.

## Important note

InferPrompt is a hackathon/demo application. Its deterministic engine and model outputs are decision-support tools, not a substitute for production fraud controls, compliance review, or financial advice.
