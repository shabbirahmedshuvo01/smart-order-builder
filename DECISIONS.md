# Architectural Decisions & Checkpoints

## Checkpoints

### Checkpoint C1: Floating-Point Risk & TC-06 VAT Rounding

- **Why storing 679.50 as a JavaScript float is risky for TC-06:** JavaScript uses IEEE 754 binary floating-point numbers, where decimal fractions like `0.1`, `0.05`, or repeated percentage discounts produce binary representation errors (e.g., `1509.50 * 0.05 = 75.47500000000001` or cumulative `.0000000000002` drift across line totals and discounts). Even a `0.0001` poisha drift on a boundary like `.5` poisha can flip a half-up rounding result by 1 poisha or 1 BDT. Storing all monetary values as integer poisha (`67950`) guarantees exact integer arithmetic until the final rounding step.
- **Hand calculation of TC-06 VAT (`75.48` BDT):**
  - Item B unit subtotal = `679.50` BDT (`67950` poisha); Item C unit subtotal = `490.00` BDT (`49000` poisha), so `C x 2` = `980.00` BDT (`98000` poisha).
  - Cart subtotal = `67950 + 98000 = 165950` poisha (`1,659.50` BDT).
  - At server time `10:59:59` (strictly before `11:00`), `MORNING15` (C2) gives `15%` of `165950` = `24892.5` -> `24893` poisha, capped at `150.00` BDT (`15000` poisha). Since `15000 > 10000` (C1), C2 wins with `15000` poisha.
  - Discounted subtotal = `165950 - 15000 = 150950` poisha (`1,509.50` BDT).
  - 5% VAT = `roundHalfUp((150950 * 5) / 100) = roundHalfUp(754750 / 100) = roundHalfUp(7547.5)` = `7548` poisha = **`75.48` BDT**.
  - Payable = `150950 + 7548 = 158498` poisha -> rounded half-up to whole BDT (`1584.98` -> `1585`) = **`1,585` BDT**.

### Checkpoint C2: Sales Assistant Supported Questions & Tool Functions

1. **Total order count** ("How many orders?") -> `getOrderCount()` (inputs: none; output: `{ count: number }`).
2. **Total revenue** ("What is the total revenue?") -> `getTotalRevenue()` (inputs: none; output: `{ totalRevenueBdt: number; totalRevenuePoisha: number }`).
3. **Best-selling option by units** ("What is the best-selling option?") -> `getBestSellingOption()` (inputs: none; output: `{ optionId: string; optionName: string; totalUnits: number }`).
4. **Revenue by payment method** ("Revenue by payment method" / "Which payment method made the most?") -> `getRevenueByPaymentMethod()` (inputs: none; output: `{ breakdown: Record<string, number>; topMethod: string; topRevenueBdt: number }`).
5. **Average order value** ("What is the average order value?") -> `getAverageOrderValue()` (inputs: none; output: `{ averageBdt: number; averagePoisha: number; orderCount: number }`).
6. **Orders that actually received a coupon** ("How many orders got the coupon?") -> `getCouponAppliedStats()` (inputs: none; output: `{ appliedCount: number; rejectedCount: number; details: Array<{ orderId: string; couponCode: string; applied: boolean; reason?: string }> }`).
7. **Orders on a specific date** ("How many orders on YYYY-MM-DD?") -> `getOrdersByDate({ date })` (inputs: `{ date: string }` in `YYYY-MM-DD` `Asia/Dhaka` date; output: `{ date: string; count: number; orderIds: string[]; revenueBdt: number }`).

---

## Decision Points

### D1: Multi-Tab Stock Conflict During Edit

When Tab A saves an edit after Tab B has already claimed the last remaining eggs, the mock server atomically rejects Tab A's edit request with a conflict/shortage response listing the exact missing ingredients (e.g., `"Short: 2 egg"`). Tab A keeps its existing active reservation intact so the user's original cart allocation is never lost, and keeps all of Tab A's unsaved form selections in local UI state. An inline error banner displays the exact shortage message alongside a button to adjust selections or retry if stock becomes available.

### D2: When Prices Are Locked

Prices and promotion eligibility are evaluated dynamically on the server at preview time and re-evaluated at checkout using the current server timestamp (`serverTime`), rather than locking a promo discount at `Add to Cart`. This ensures `MORNING15` applies at `10:59:59` (TC-06) and is rejected at `11:00:00` (TC-07) even if the item was added earlier in the morning. Storing the final computed breakdown only when the order is paid guarantees checkout accuracy without allowing expired morning coupons to leak past 11:00.

### D3: Reservation Expiry Mid-Edit

If a reservation's 5-minute server-time TTL expires while the user is actively editing that cart item, the server automatically releases the held stock and marks the reservation as expired. In the UI, the edit modal or form immediately switches to a read-only notice explaining that the 5-minute reservation expired and stock was released, while preserving the user's edited selection values on screen so they can re-add them as a fresh reservation if stock is still available or remove the expired item.

### D4: Order ID, Timestamp & Pay Idempotency

The mock server generates both the authoritative `orderId` (e.g., `ord_<timestamp>_<seq>`) and the `createdAt` timestamp using the server clock so client clock skew cannot manipulate promo cutoffs or duplicate IDs. Before clicking Pay, the client generates a unique `checkoutIdempotencyKey` per checkout attempt and sends it with the payment request. If Pay is double-clicked, the server detects the in-flight or completed idempotency key and returns the exact same created order without deducting sold stock twice or creating a duplicate order.

### D5: Unknown Questions / Missing Customer Data in Sales Assistant

When staff ask questions requiring fields not present in the order schema—such as "Who is our best customer?"—the assistant explicitly states that customer names or profiles are not recorded in the order data and therefore cannot be determined. To prevent hallucination, the system prompt strictly instructs Gemini to answer only using values returned by the registered tool functions and to refuse extrapolation when no tool covers the requested entity. Additionally, no raw customer fields exist in the tool outputs, leaving the model nothing to fabricate from.

### D6: Stored Order JSON Schema

Each stored order in `orders.json` uses the following structure with all monetary totals recorded in **integer poisha** (alongside BDT display fields where helpful, keeping integer poisha as the source of truth):

```json
{
  "id": "ord_1732510200000_1",
  "createdAt": "2026-11-25T04:30:00.000Z",
  "paymentMethod": "bkash",
  "coupon": {
    "enteredCode": "MORNING15",
    "appliedCode": null,
    "rejectedReason": "Coupon MORNING15 is only valid strictly before 11:00 Asia/Dhaka"
  },
  "items": [
    {
      "lineId": "line_1",
      "quantity": 2,
      "selections": { "bread": "paratha", "eggs": { "fried": 2 } },
      "unitPricePoisha": 49000,
      "lineTotalPoisha": 98000
    }
  ],
  "pricing": {
    "subtotalPoisha": 98000,
    "appliedPromoCode": null,
    "discountPoisha": 0,
    "discountedSubtotalPoisha": 98000,
    "vatPoisha": 4900,
    "payableBdt": 1029
  }
}
```

Recording `coupon.enteredCode`, `coupon.appliedCode`, and `coupon.rejectedReason` explicitly distinguishes orders where a customer typed `MORNING15` after 11:00 or below threshold from orders where the discount actually applied.
