# Smart Order Builder

**Smart Order Builder** is a high-reliability, data-driven custom breakfast studio, inventory management engine, and AI-powered sales assistant designed for multi-item breakfast customization.

Built with **React 19**, **TypeScript** (strict mode), **Vite**, **Tailwind CSS**, **MSW (Mock Service Worker)**, **Vitest**, and the **Google Gen AI SDK (`@google/genai`)**.

---

## Assessment Metadata & Time Spent

- **Actual Hours Spent:** **`~3.5 hours`**
- **Assessment Scope:** Parts A through F complete with 100% test coverage across all test cases (TC-01 through TC-20).
- **Documentation:**
  - [DECISIONS.md](file:///d:/Assesment/smart-order-builder/DECISIONS.md): Architectural decisions (D1–D6) and checkpoints (C1–C2).
  - [ANSWERS.md](file:///d:/Assesment/smart-order-builder/ANSWERS.md): Complete answers and step-by-step mathematical working for **Section 10 (Q1 through Q8)**.

---

## Architecture Overview

```
src/
├── assistant/
│   └── geminiAssistant.ts      # Gemini 2.5 Flash function-calling sales assistant (Part F) with 2.0 fallback
├── components/
│   ├── BuilderView.tsx         # 100% data-driven option builder with live validation & preview
│   ├── CartPanel.tsx           # Server-synced countdown timer, net-diff editing & checkout
│   └── SalesAssistantPanel.tsx # Staff chat panel with sample query chips & error alerts
├── engine/
│   ├── clientPricing.ts        # GuardedPricingClient with sequential request ID cancellation
│   ├── orderEngine.ts          # Part E: Checkout, seed pricing & localStorage persistence (D6)
│   ├── pricingEngine.ts        # Part C: Exact integer-poisha 6-step calculation & roundHalfUp
│   ├── reservationEngine.ts    # Part D: Atomic reservations, 300s TTL & net-diff edit check
│   ├── statsEngine.ts          # Checkpoint C2 pure stats functions (LLM never does math)
│   ├── stockEngine.ts          # Part B: Ingredient usage, remaining stock & shortage formatting
│   └── validateRules.ts        # Part A: Pure data-driven validation (min, max, step, requires/excludes)
├── fixtures/
│   ├── appendixMenu.json       # Exact Appendix A specification & rules
│   └── orders.seed.json        # 6 historical seed orders for sales analysis
├── mocks/
│   ├── browser.ts              # MSW browser worker setup
│   ├── mockStore.ts            # Stateful in-memory mock store & simulation options
│   ├── mswHandlers.ts          # REST API endpoints (/api/menu, /api/price, /api/cart, etc.)
│   ├── server.ts               # MSW node server for test environments
│   └── serverClock.ts          # Controllable mock server clock running +90s ahead of browser
├── types/
│   └── order.ts                # Strongly typed domain interfaces
└── test/
    ├── coreEngine.test.ts          # TC-01 through TC-11 (pricing, stock, validation)
    ├── cartCheckout.test.ts        # TC-12 through TC-17 (idempotency, expiry, persistence)
    ├── assistantAndUi.test.tsx     # TC-18 through TC-20 + Q1–Q8 verification
    └── answersVerification.test.ts # Section 10 Q1–Q8 dedicated assertion suite
```

### 1. Rules Engine (`validateRules.ts`)
- Pure function `validate(config, groups, rules): RuleViolation[]`.
- Zero hardcoded option IDs or group names; all limits (`min`, `max`, `step`, `maxDistinct`, `maxPerOption`) and cross-group rules (`requires`, `excludes`, `overrideLimit`) are dynamically evaluated.
- Context-dependent `overrideLimit` rules dynamically reduce base group limits (e.g. Croissant reduces Extras limit from 4 to 2).

### 2. Stock Engine (`stockEngine.ts`) & Reservations (`reservationEngine.ts`)
- Calculates ingredient requirements based on option definitions.
- Enforces atomic reservations with zero phantom holds on shortage.
- Multi-item shortage formatting (e.g. `"Short: 2 egg, 2 cheese"`).
- Net-difference stock checking during item edits: held ingredients from the existing reservation are credited back to the builder for atomic update.
- 300-second (5-minute) TTL auto-expiry releases stock and marks items read-only.
- Live Stock Invariant: Live builder stock begins from `initialStock` (`egg: 10`, `cheese: 4`, `croissant: 2`, etc.) to match exact test case expectations (TC-08 to TC-11). Seed orders are priced at their historical timestamps without depleting live builder inventory.

### 3. Pricing Engine (`pricingEngine.ts`)
- Strict integer poisha arithmetic avoids IEEE 754 floating-point drift.
- Exact `roundHalfUp(numerator, denominator)` implementation (`Math.floor((numerator * 2 + denominator) / (2 * denominator))`).
- Sequential 6-step calculation pipeline:
  1. Unit subtotal (`basePricePoisha` + sum of option prices).
  2. P2 Extras deal: `floor(extras / 3)` cheapest extra units free per unit.
  3. P1 Combo deal: 10% off Step 2 if $\text{eggs} \ge 4$ and $\text{protein} \ge 2$.
  4. Line totals and Cart subtotal.
  5. Promo evaluation: C1 threshold flat vs. C2 `MORNING15` (15% capped at 150.00 BDT, strictly before 11:00 `Asia/Dhaka`). Larger discount wins; tie goes to C1.
  6. 5% VAT and whole-BDT payable rounding.

### 4. Sales Assistant & Stats Engine (`geminiAssistant.ts`, `statsEngine.ts`)
- Integrates Google Gen AI SDK (`@google/genai`) with primary model `gemini-2.5-flash` (and automatic fallback to `gemini-2.0-flash` on transient/availability errors).
- Uses 7 function declarations matching Checkpoint C2:
  - `getOrderCount`
  - `getTotalRevenue`
  - `getBestSellingOption`
  - `getRevenueByPaymentMethod`
  - `getAverageOrderValue`
  - `getCouponAppliedStats`
  - `getOrdersByDate`
- The LLM never calculates numbers: all numerical outputs are executed directly by pure TypeScript functions in `statsEngine.ts` and fed back to Gemini.
- Enforces Decision D5: Explicitly refuses customer identity questions (*"Customer names and profiles are not recorded in the order data and therefore cannot be determined"*), never inventing names.

---

## Architectural Trade-offs & Decisions

1. **Integer Poisha vs. JavaScript Floating Point:**
   - *Trade-off:* Requires converting display values to and from integer poisha ($1\text{ BDT} = 100\text{ poisha}$).
   - *Benefit:* Eliminates IEEE 754 rounding drift (e.g. $1509.50 \times 0.05 = 75.47500000000001$), guaranteeing exact half-up VAT rounding to 75.48 BDT and preventing penny discrepancies across cart lines.
2. **Server Clock Offset vs. Browser Clock:**
   - *Trade-off:* Requires syncing countdown timers to `serverTime` offset.
   - *Benefit:* Guarantees that clients with clock skew or browser time differences cannot circumvent morning coupon cutoffs (`11:00:00 Asia/Dhaka`) or manipulate reservation TTLs.
3. **In-Memory Store with LocalStorage Persistence:**
   - *Trade-off:* Client-side mock store rather than an external database.
   - *Benefit:* Full offline testability in MSW and Vitest without external database dependencies, while preserving orders across page refreshes via `localStorage` (matching Decision D6).
4. **Stale Request Guard in Pricing Client:**
   - *Trade-off:* Wraps fetch requests with sequential request IDs and `AbortController`.
   - *Benefit:* Completely prevents out-of-order asynchronous responses from overwriting a newer configuration's displayed price during rapid option clicking.

---

## Unfinished / Deferred Scope

- **Part G (Bonus Voice Assistant / Live Audio):**
  - Intentionally deferred to prioritize rock-solid stability, 100% test coverage, and strict mathematical precision across all required Parts A through F (Rules Validation, Stock Engine, Pricing Engine, Cart Reservations, Checkout, Gemini Function Calling, and UI).

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node.js v20/v22/v26)
- **npm** or **pnpm**

### 2. Installation
```bash
npm install
```

### 3. Environment Setup
Create a `.env.local` file from `.env.example`:
```bash
cp .env.example .env.local
```
Add your Gemini API key:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```
*(Note: `.env.local` is ignored by `.gitignore` to prevent secret leakage).*

### 4. Development Server
Start the development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173). Mock Service Worker (MSW) will automatically start and intercept `/api/*` endpoints.

---

## Running Tests

Execute the complete 38-test suite:

```bash
# Run all Vitest suites
npm test -- --run

# Run specific test suites
npx vitest run src/test/coreEngine.test.ts          # TC-01 to TC-11
npx vitest run src/test/cartCheckout.test.ts        # TC-12 to TC-17
npx vitest run src/test/assistantAndUi.test.tsx     # TC-18 to TC-20
npx vitest run src/test/answersVerification.test.ts # Section 10 Q1–Q8
```

### Production Build & Type Checking
```bash
npm run build
```
Runs strict TypeScript compilation (`tsc -b`) and Vite production bundle generation.

---

## Test Coverage Summary

| Test Suite | Purpose | Tests Passed |
| :--- | :--- | :---: |
| **`src/test/coreEngine.test.ts`** | TC-01 through TC-11 (Validation, P1/P2 Deals, C1/C2 Promos, Dhaka Cutoff, Stock & Net-Diff) | **12 / 12** |
| **`src/test/cartCheckout.test.ts`** | TC-12 through TC-17 (Stale Price Cancellation, Add/Pay Idempotency, 300s TTL, +90s Clock, LocalStorage D6) | **6 / 6** |
| **`src/test/assistantAndUi.test.tsx`** | TC-18 through TC-20 (Function-Calling Assistant, Live Update on Checkout, Customer Refusal, Stats Engine) | **12 / 12** |
| **`src/test/answersVerification.test.ts`** | Section 10 Assessment Verification (Q1 through Q8 exact assertion suite) | **8 / 8** |
| **TOTAL** | | **38 / 38** |
