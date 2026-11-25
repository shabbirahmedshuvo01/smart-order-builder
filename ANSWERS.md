# Assessment Section 10: Deliverables & Numerical Answers

This document provides exact, verified answers to the **8 questions in Section 10** of the assessment brief. All calculations are executed directly using our production engines (`validateRules`, `stockEngine`, `pricingEngine`, and `statsEngine`) with strict integer-poisha arithmetic.

### Verification Command

All figures below are computed and asserted by the dedicated Vitest test suite:

```bash
npx vitest run src/test/answersVerification.test.ts
```

---

## Q1: Maximum Item C from Empty Cart

**Question:** Starting from an empty cart and the initial stock in Appendix A, what is the maximum number of Item C you can add to the cart? Which ingredient is the bottleneck?

**Answer:** **`2` units of Item C**. The bottleneck ingredient is **`cheese`**.

### Detailed Stock Calculation

Item C configuration:

- `bread: paratha` (requires `1 paratha`)
- `eggs: fried x2` (requires `2 egg`)
- `protein: tofu` (requires `1 tofu`)
- `extras: cheese x2` (requires `2 cheese`), `beans x1` (requires `1 beans`), `mushroom x1` (requires `1 mushroom`)
- `sauce: chili` (0 ingredients)

Per-unit ingredient requirements vs. initial stock:
| Ingredient | Initial Stock | Required per Item C | Max Units Allowed by Stock | Bottleneck? |
| :--- | :---: | :---: | :---: | :---: |
| **cheese** | **4** | **2** | **`floor(4 / 2) = 2`** | **YES (Bottleneck)** |
| **egg** | 10 | 2 | `floor(10 / 2) = 5` | No |
| **paratha** | 10 | 1 | `floor(10 / 1) = 10` | No |
| **tofu** | 5 | 1 | `floor(5 / 1) = 5` | No |
| **beans** | 8 | 1 | `floor(8 / 1) = 8` | No |
| **mushroom** | 6 | 1 | `floor(6 / 1) = 6` | No |

$$\text{Max Item C} = \min(2, 5, 10, 5, 8, 6) = \mathbf{2}$$

Attempting to add a 3rd unit requires 6 cheese against 4 available, returning:
`"Short: 2 cheese"`.

---

## Q2: Cheapest Valid Configuration

**Question:** What is the cheapest valid breakfast configuration you can build, and what is its unit price in BDT?

**Answer:** **`Toast` (1), `Fried` (2), `Tofu` (1)** (with 0 Extras and 0 Sauce).
**Unit Price:** **`360.00` BDT** (`36,000` poisha).

### Breakdown of Selections & Pricing

- **Base Price:** `250.00` BDT (`25,000` poisha)
- **Bread (min 1, max 1):** `Toast` (`toast`) = **`+0.00` BDT** (`0` poisha) [vs. Paratha +20.00, Croissant +50.00]
- **Eggs (min 2, max 6, step 2):** `Fried x2` (`fried`) = **`+60.00` BDT** (`6,000` poisha) [vs. Scrambled +70.00, Omelette +140.00]
- **Protein (min 1, max 3):** `Tofu` (`tofu`) = **`+50.00` BDT** (`5,000` poisha) [vs. Sausage +60.00, Bacon +90.00]
- **Extras (min 0, max 4):** None selected = **`+0.00` BDT**
- **Sauce (min 0, maxDistinct 2):** None selected = **`+0.00` BDT**

### Rule Compliance

1. Group limits: Bread (1), Eggs (2, step 2), Protein (1), Extras (0), Sauce (0) $\rightarrow$ all min/max/step satisfied.
2. Rule R2: Tofu excludes sausage and bacon $\rightarrow$ neither is selected (satisfied).
3. Violations count = **`0`**.

$$\text{Unit Price} = 25,000 + 0 + 6,000 + 5,000 = \mathbf{36,000\text{ poisha}}\text{ (360.00 BDT)}$$

---

## Q3: Cart = A x 3 at 10:30 vs. 11:30 Asia/Dhaka

**Question:** A customer adds 3 of Item A to their cart and applies coupon code `MORNING15`.

1. What is the subtotal, discount, VAT, and payable if checkout occurs at 10:30 (`Asia/Dhaka`)?
2. What if checkout occurs at 11:30 (`Asia/Dhaka`)? Show your intermediate integer-poisha working.

### Item A Base Pricing

- Unit Price of Item A = `380.00` BDT (`38,000` poisha)
- Line Total for 3 units = $38,000 \times 3 = \mathbf{114,000\text{ poisha}}$ (`1,140.00` BDT)
- **Cart Subtotal:** **`114,000` poisha** (`1,140.00` BDT)

### 1. Checkout at 10:30 (Asia/Dhaka) — strictly before 11:00:

- **Promo C1 (Threshold):** Cart Subtotal `114,000 < 120,000` poisha $\rightarrow$ not eligible (`0` poisha).
- **Promo C2 (`MORNING15`):** Time `10:30:00 < 11:00:00` $\rightarrow$ eligible.
  $$\text{Raw 15\%} = \text{roundHalfUp}(114,000 \times 15, 100) = \text{roundHalfUp}(1,710,000, 100) = 17,100\text{ poisha}$$
  Capped at `15,000` poisha (`150.00` BDT).
- **Chosen Discount:** C2 wins with **`15,000` poisha** (`150.00` BDT).
- **Discounted Subtotal:** $114,000 - 15,000 = \mathbf{99,000\text{ poisha}}$ (`990.00` BDT).
- **5% VAT:**
  $$\text{vatPoisha} = \text{roundHalfUp}(99,000 \times 5, 100) = \text{roundHalfUp}(495,000, 100) = \mathbf{4,950\text{ poisha}}\text{ (49.50 BDT)}$$
- **Total Payable:**
  $$\text{payableBdt} = \text{roundHalfUp}(99,000 + 4,950, 100) = \text{roundHalfUp}(103,950, 100) = \mathbf{1,040\text{ BDT}}$$

### 2. Checkout at 11:30 (Asia/Dhaka) — after 11:00 cutoff:

- **Promo C2 (`MORNING15`):** Time `11:30:00 >= 11:00:00` $\rightarrow$ **REJECTED** (_"Coupon MORNING15 is only valid strictly before 11:00 Asia/Dhaka"_).
- **Promo C1 (Threshold):** Cart Subtotal `114,000 < 120,000` poisha $\rightarrow$ not eligible (`0` poisha).
- **Chosen Discount:** **`0.00` BDT** (`0` poisha).
- **Discounted Subtotal:** **`114,000` poisha** (`1,140.00` BDT).
- **5% VAT:**
  $$\text{vatPoisha} = \text{roundHalfUp}(114,000 \times 5, 100) = \text{roundHalfUp}(570,000, 100) = \mathbf{5,700\text{ poisha}}\text{ (57.00 BDT)}$$
- **Total Payable:**
  $$\text{payableBdt} = \text{roundHalfUp}(114,000 + 5,700, 100) = \text{roundHalfUp}(119,700, 100) = \mathbf{1,197\text{ BDT}}$$

---

## Q4: Post-TC-10 Cart at 11:30 Asia/Dhaka

**Question:** In TC-10, Tab A edits Item B to reduce eggs. If the cart after this edit contains:

- 1 x Item B (as edited in TC-10)
- 2 x Item C

And the customer checks out at 11:30 (`Asia/Dhaka`) with `MORNING15`:
What are the subtotal, discount, VAT, and payable?

**Answer:**

- **Subtotal:** **`162,350` poisha** (`1,623.50` BDT)
- **Discount:** **`10,000` poisha** (`100.00` BDT via C1 fallback)
- **Discounted Subtotal:** **`152,350` poisha** (`1,523.50` BDT)
- **5% VAT:** **`7,618` poisha** (`76.18` BDT)
- **Total Payable:** **`1,600` BDT**

### Step-by-Step Calculation

1. **Line 1 (Edited Item B, qty 1):**
   - Options: `croissant: 1`, `omelette: 1`, `fried: 3`, `sausage: 1`, `bacon: 1`, `hashbrown: 1`, `mushroom: 1`, `hollandaise: 1`
   - Base = `25,000`; Options = `6,000 + 7,000 + 9,000 + 6,000 + 9,000 + 4,000 + 3,000 + 2,500 = 46,500` poisha.
   - Step 1 = `71,500` poisha.
   - Step 2 (Extras deal): 2 extras < 3 $\rightarrow$ 0 free $\rightarrow$ Step 2 = `71,500` poisha.
   - Step 3 (Combo deal): eggs = 4 ($\ge 4$), protein = 2 ($\ge 2$) $\rightarrow$ 10% combo discount = $\text{roundHalfUp}(71,500 \times 10, 100) = 7,150$ poisha.
   - Unit price = $71,500 - 7,150 = \mathbf{64,350\text{ poisha}}$ (`643.50` BDT).
   - Line 1 total = $\mathbf{64,350\text{ poisha}}$.

2. **Line 2 (Item C, qty 2):**
   - Unit price = `49,000` poisha (`490.00` BDT).
   - Line 2 total = $49,000 \times 2 = \mathbf{98,000\text{ poisha}}$ (`980.00` BDT).

$$\text{Cart Subtotal} = 64,350 + 98,000 = \mathbf{162,350\text{ poisha}}\text{ (1,623.50 BDT)}$$

3. **Discount Evaluation at 11:30 (Asia/Dhaka):**
   - `MORNING15` is **REJECTED** (hour 11 $\ge$ 11:00 cutoff).
   - `C1` Automatic Promo applies because Subtotal $162,350 \ge 120,000$ poisha.
   - Applied Promo: **`C1`** with **`10,000` poisha** (`100.00` BDT) discount.

$$\text{Discounted Subtotal} = 162,350 - 10,000 = \mathbf{152,350\text{ poisha}}\text{ (1,523.50 BDT)}$$

4. **5% VAT:**
   $$\text{vatPoisha} = \text{roundHalfUp}(152,350 \times 5, 100) = \text{roundHalfUp}(761,750, 100) = \mathbf{7,618\text{ poisha}}\text{ (76.18 BDT)}$$

5. **Payable in Whole BDT:**
   $$\text{payableBdt} = \text{roundHalfUp}(152,350 + 7,618, 100) = \text{roundHalfUp}(159,968, 100) = \mathbf{1,600\text{ BDT}}$$

---

## Q5: Seed Orders Payable and Total Revenue

**Question:** For each of the 6 seed orders in `orders.seed.json`, what is its computed payable in BDT? What is the total revenue across all 6 orders?

**Answer:**

- **Total Revenue:** **`4,995` BDT** (`499,496` integer poisha)
  *(Note on Croissant Price: Under the exact Appendix A specification where Croissant is 60 BDT / 6,000 poisha, total revenue is **4,995 BDT**. If evaluated with Croissant at 50 BDT / 5,000 poisha, total revenue is **4,966 BDT**).*

### Individual Seed Order Payables

#### Case 1: Standard Appendix A Specification (Croissant = 60 BDT / 6,000 poisha)

| Order ID     | Created At (Asia/Dhaka) |     Subtotal     |     Applied Promo      |    Discount     |     5% VAT     |   Payable BDT   | Payment Method |
| :----------- | :---------------------- | :--------------: | :--------------------: | :-------------: | :------------: | :-------------: | :------------: |
| **ORD-1001** | `2026-11-20 09:15`      | `38,000` poisha  |      `MORNING15`       | `5,700` poisha  | `1,615` poisha |  **`339` BDT**  |     `card`     |
| **ORD-1002** | `2026-11-20 12:40`      | `67,950` poisha  |          none          |   `0` poisha    | `3,398` poisha |  **`713` BDT**  |    `bkash`     |
| **ORD-1003** | `2026-11-21 10:05`      | `136,000` poisha |      `MORNING15`       | `15,000` poisha | `6,050` poisha | **`1,271` BDT** |     `cash`     |
| **ORD-1004** | `2026-11-21 19:30`      | `55,000` poisha  |          none          |   `0` poisha    | `2,750` poisha |  **`578` BDT**  |     `card`     |
| **ORD-1005** | `2026-11-22 08:50`      | `97,000` poisha  |      `MORNING15`       | `14,550` poisha | `4,123` poisha |  **`866` BDT**  |    `bkash`     |
| **ORD-1006** | `2026-11-22 13:10`      | `116,950` poisha | none (coupon rejected) |   `0` poisha    | `5,848` poisha | **`1,228` BDT** |     `card`     |
| **TOTAL**    | —                       |        —         |           —            |        —        |       —        | **`4,995` BDT** |       —        |

$$\text{Total Revenue (Appendix A 60 BDT Croissant)} = 339 + 713 + 1,271 + 578 + 866 + 1,228 = \mathbf{4,995\text{ BDT}}$$

#### Case 2: Assessment Prompt Baseline (Croissant = 50 BDT / 5,000 poisha)

| Order ID     | Created At (Asia/Dhaka) |     Subtotal     |     Applied Promo      |    Discount     |     5% VAT     |   Payable BDT   | Payment Method |
| :----------- | :---------------------- | :--------------: | :--------------------: | :-------------: | :------------: | :-------------: | :------------: |
| **ORD-1001** | `2026-11-20 09:15`      | `38,000` poisha  |      `MORNING15`       | `5,700` poisha  | `1,615` poisha |  **`339` BDT**  |     `card`     |
| **ORD-1002** | `2026-11-20 12:40`      | `67,050` poisha  |          none          |   `0` poisha    | `3,353` poisha |  **`704` BDT**  |    `bkash`     |
| **ORD-1003** | `2026-11-21 10:05`      | `136,000` poisha |      `MORNING15`       | `15,000` poisha | `6,050` poisha | **`1,271` BDT** |     `cash`     |
| **ORD-1004** | `2026-11-21 19:30`      | `55,000` poisha  |          none          |   `0` poisha    | `2,750` poisha |  **`578` BDT**  |     `card`     |
| **ORD-1005** | `2026-11-22 08:50`      | `97,000` poisha  |      `MORNING15`       | `14,550` poisha | `4,123` poisha |  **`866` BDT**  |    `bkash`     |
| **ORD-1006** | `2026-11-22 13:10`      | `115,050` poisha | none (coupon rejected) |   `0` poisha    | `5,753` poisha | **`1,208` BDT** |     `card`     |
| **TOTAL**    | —                       |        —         |           —            |        —        |       —        | **`4,966` BDT** |       —        |

$$\text{Total Revenue (50 BDT Croissant)} = 339 + 704 + 1,271 + 578 + 866 + 1,208 = \mathbf{4,966\text{ BDT}}$$

---

## Q6: Best-Selling Option in Seed Orders

**Question:** Which option across all seed orders was selected the most times in total (accounting for line item quantities)? How many units of it were sold?

**Answer:** **`Fried` (`fried`)** with **`10` units sold**.

### Line-by-Line Calculation

Option count per line is multiplied by the line quantity (`item.quantity * optionCount`):

1. `ORD-1002`: `fried: 2` $\times 1 = \mathbf{2}$ units
2. `ORD-1003` Line 1: `fried: 2` $\times 2 = \mathbf{4}$ units
3. `ORD-1006` Line 1: `fried: 2` $\times 1 = \mathbf{2}$ units
4. `ORD-1006` Line 2: `fried: 2` $\times 1 = \mathbf{2}$ units

$$\text{Total Fried Units} = 2 + 4 + 2 + 2 = \mathbf{10\text{ units}}$$

**Runner-ups:**

- Omelette (`omelette`): `6` units ($2 + 2 + 2$)
- Scrambled (`scrambled`): `6` units ($2 + 2 + 2$)
- Cheese (`cheese`): `6` units ($4 + 2$)
- Chicken Sausage (`sausage`): `5` units ($1 + 1 + 1 + 2$)

---

## Q7: Highest-Revenue Payment Method in Seed Orders

**Question:** Which payment method (`card`, `bkash`, or `cash`) generated the most revenue in the seed orders, and how much?

**Answer:** **`card`** generated the most revenue with **`2,145` BDT** *(or `2,125` BDT if Croissant was 50 BDT)*.

### Revenue Breakdown by Payment Method

- **`card`:** `ORD-1001` (339 BDT) + `ORD-1004` (578 BDT) + `ORD-1006` (1,228 BDT) = **`2,145` BDT** *(or 2,125 BDT with 50 BDT croissant)*
- **`bkash`:** `ORD-1002` (713 BDT) + `ORD-1005` (866 BDT) = **`1,579` BDT** *(or 1,570 BDT with 50 BDT croissant)*
- **`cash`:** `ORD-1003` (1,271 BDT) = **`1,271` BDT**

$$\text{Top Payment Method} = \mathbf{card}\text{ with }\mathbf{2,145\text{ BDT}}$$

---

## Q8: Seed Orders Receiving MORNING15 & Late Cutoff Handling

**Question:** How many seed orders actually received the `MORNING15` discount? Explain why any order that included `couponCode: "MORNING15"` did or did not receive it.

**Answer:** Exactly **`3` seed orders** actually received the `MORNING15` discount (`ORD-1001`, `ORD-1003`, `ORD-1005`).

### Order-by-Order Explanation

4 seed orders originally included `couponCode: "MORNING15"`:

1. **`ORD-1001` (`createdAt: 2026-11-20T09:15:00+06:00`):**
   - Order time is `09:15:00 Asia/Dhaka`, which is strictly before the `11:00:00` cutoff.
   - Discount: 15% of 38,000 poisha = `5,700` poisha ($57.00$ BDT). **RECEIVED**.
2. **`ORD-1003` (`createdAt: 2026-11-21T10:05:00+06:00`):**
   - Order time is `10:05:00 Asia/Dhaka`, strictly before `11:00:00`.
   - Discount: 15% of 136,000 poisha = `20,400` poisha, capped at `15,000` poisha ($150.00$ BDT).
   - Beats C1 ($10,000$ poisha). **RECEIVED**.
3. **`ORD-1005` (`createdAt: 2026-11-22T08:50:00+06:00`):**
   - Order time is `08:50:00 Asia/Dhaka`, strictly before `11:00:00`.
   - Discount: 15% of 97,000 poisha = `14,550` poisha ($145.50$ BDT). **RECEIVED**.
4. **`ORD-1006` (`createdAt: 2026-11-22T13:10:00+06:00`):**
   - Order time is `13:10:00 Asia/Dhaka` (1:10 PM), which is **after the strict 11:00:00 AM cutoff**.
   - The coupon was rejected with message: _"Coupon MORNING15 is only valid strictly before 11:00 Asia/Dhaka"_.
   - Evaluated for fallback C1 automatic threshold discount ($120,000$ poisha), but cart subtotal of $115,050$ poisha was below the threshold, so $0$ discount applied. **DID NOT RECEIVE**.
