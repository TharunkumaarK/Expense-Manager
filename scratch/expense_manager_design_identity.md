# Expense Manager — Design Identity Specification
**Refined Button Hierarchy, Semantic Color Separation & Interaction Token Contract**

> **Status:** APPROVED DESIGN SPECIFICATION (All Architectural Decisions Aligned via `/grill-me`)  
> **Development Branch:** `test`  
> **Documentation File:** `scratch/expense_manager_design_identity.md`  
> **Design Skills & Principles:** `unslop`, `generative_ui`, Emil Kowalski Motion Principles

---

## 1. Executive Summary & Design Vision

Expense Manager is an exacting, restrained personal finance ledger designed for multi-country currency management (Japan JPY, India INR, Germany EUR). It belongs to the physical world of account statements, receipts, and precision ledgers: dark surfaces, paper-weight numbers, and authentic card materials.

### The Problem Addressed
The application previously contained visual dissonance between its disciplined, near-black chrome and certain interactive controls:
1. **Saturated Neon Buttons:** Blinding fills (`.btn-green` for income, `.btn-blue` for transfers, `.btn-purple` for remittances, `bg-red`/`bg-green` on FAB items, and inline `#10b981` / `#ef4444` styles).
2. **Duplicated & Competing Styles:** Multiple divergent declarations for `.btn-primary`, `.btn-add-tx`, `.action-type-card`, and `.tx-type-icon` spread throughout `css/style.css`.
3. **Rigid Header Button Widths:** Desktop header action buttons forced to a hardcoded `158px` width, causing awkward padding and text clipping.
4. **Conflation of Controls vs. Data:** Expressive financial indicators (wallet card gradients, ledger signed amounts, budget health indicators, charts) were blurred with interactive UI controls.

### The Approved Principle: "Quiet Controls, Expressive Data"
- **Interactive Application Controls:** Monochromatic, high-contrast, tactile, and restrained. Form submit buttons take elegant, low-saturation tinted surfaces derived directly from the transaction type selector popup.
- **Financial Visualizations:** Meaningful, communicative color is strictly preserved and refined (wallet materials, country badges, progress indicators, positive/negative cashflows).

---

## 2. Aligned Decisions Summary (via `/grill-me`)

| Decision Area | Previous State | Approved Specification |
| :--- | :--- | :--- |
| **1. Primary Action Button (`.btn-primary`)** | Two-state metallic gradient with 158px rigid desktop width | **Refined Two-State Graphite Gradient** with **Natural Content Width** (16px horizontal padding, `min-width: 120px`). Tactile Emil Kowalski `scale(0.98)` push. |
| **2. Transaction Form Submit Buttons** | Saturated solid buttons (`.btn-blue`, `.btn-green`, `.btn-purple`) | **Subtle Tinted Surface & Matching Icon** (`.btn-tx-expense`, `.btn-tx-income`, `.btn-tx-transfer`, `.btn-tx-remittance`): 12% opacity wash + 25% border + vibrant Lucide glyph with high-contrast text. |
| **3. Mobile FAB & Speed-Dial** | Saturated solid circular badges (`bg-red`, `bg-blue`, `bg-purple`, `bg-green`) | **Harmonized Tint Discs & Unified Glyphs**: 48px discs with 12% tint matching the selector popup and unified icons (`arrow-up-right`, `arrow-down-left`, `arrow-left-right`, `send`). |
| **4. Destructive Action Hierarchy** | Inconsistent mix of `#ef4444`, `#fb7185`, and inline styles | **Two-Tier Semantic Red**: In-modal triggers use calm ghost outline (`.btn-danger-ghost`: `rgba(222,74,66,0.25)` border, muted red text); final irreversible confirmations use solid controlled semantic red (`.btn-danger`: `#de4a42`). |
| **5. Monthly Closing Confirmation** | Inline style `background: #10b981; border-color: #059669;` | **Unified Neutral Primary**: Keep button strictly within neutral `.btn-primary` palette with a check/lock icon and contextual copy ("Confirm & Reconcile Month"). |
| **6. Transaction Form Back Navigation** | Only top-right close (x) button; no back navigation | **Context-Aware Header Back Button**: Top-left arrow-left button (`#tx-modal-back-btn`) returning to type selector (preserving wallet/country context) when logging, or returning to details modal when editing. |

---

## 3. Coherent Button Hierarchy & Token Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BUTTON HIERARCHY                              │
├───────────────────┬────────────────────────────────────────────────────┤
│ 1. Primary        │ High-contrast neutral metallic/white surface.      │
│                   │ Natural content width (min 120px on desktop).      │
├───────────────────┼────────────────────────────────────────────────────┤
│ 2. Form Submits   │ Low-saturation tinted surface (12% wash, 25%       │
│    (Contextual)   │ border) + semantic Lucide icon + crisp text.       │
├───────────────────┼────────────────────────────────────────────────────┤
│ 3. Secondary      │ Subtle glass surface + muted border.               │
│                   │ Used for Cancel, Filters, Secondary actions.       │
├───────────────────┼────────────────────────────────────────────────────┤
│ 4. Tertiary/Ghost │ Transparent surface, hover highlight.              │
│                   │ Used for icon buttons, inline table actions.       │
├───────────────────┼────────────────────────────────────────────────────┤
│ 5. Destructive    │ Two-tier: Ghost trigger for modal actions, solid   │
│                   │ controlled semantic red (#de4a42) for confirm.     │
└───────────────────┴────────────────────────────────────────────────────┘
```

### 3.1 Primary Action (`.btn-primary`)
- **Usage:** Header action buttons, modal default submissions, wizard next buttons.
- **Styling:**
  ```css
  .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 34px;
      padding: 0 16px;
      min-width: 120px;
      position: relative;
      background: linear-gradient(92.03deg, rgba(117, 117, 117, 0.28) 0%, rgba(255, 255, 255, 0.28) 48%, rgba(117, 117, 117, 0.28) 100%);
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
      color: #f5f5f7;
      font-family: var(--font-sans);
      font-size: 0.82rem;
      font-weight: 510;
      letter-spacing: -0.01em;
      cursor: pointer;
      white-space: nowrap;
      transition: background 200ms var(--ease-out),
                  border-color 200ms var(--ease-out),
                  box-shadow 200ms var(--ease-out),
                  color 200ms var(--ease-out),
                  transform var(--duration-fast) var(--ease-out);
  }

  .btn-primary:hover {
      background: rgba(255, 255, 255, 0.92);
      border-color: rgba(255, 255, 255, 0.92);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2), 0 4px 14px rgba(0, 0, 0, 0.4);
      color: #121214;
  }

  .btn-primary:hover svg {
      stroke: #121214;
  }

  .btn-primary:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.8);
  }

  .btn-primary:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--bg-app), 0 0 0 4px rgba(255, 255, 255, 0.4);
  }
  ```

### 3.2 Contextual Form Submit Buttons (`.btn-tx-*`)
Derived directly from `.action-icon-wrap` in the transaction selector popup:

```css
/* Base Contextual Submit Button */
.btn-tx-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 38px;
    width: 100%;
    padding: 0 16px;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 510;
    cursor: pointer;
    transition: background 180ms var(--ease-out),
                border-color 180ms var(--ease-out),
                box-shadow 180ms var(--ease-out),
                transform var(--duration-fast) var(--ease-out);
}

.btn-tx-submit:active {
    transform: scale(0.985);
}

/* 1. Expense */
.btn-tx-expense {
    background: rgba(244, 63, 94, 0.12);
    border: 1px solid rgba(244, 63, 94, 0.25);
    color: #f5f5f7;
}
.btn-tx-expense svg {
    stroke: #fb7185;
}
.btn-tx-expense:hover {
    background: rgba(244, 63, 94, 0.20);
    border-color: rgba(244, 63, 94, 0.45);
    box-shadow: 0 2px 10px rgba(244, 63, 94, 0.2);
}

/* 2. Income */
.btn-tx-income {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    color: #f5f5f7;
}
.btn-tx-income svg {
    stroke: #34d399;
}
.btn-tx-income:hover {
    background: rgba(16, 185, 129, 0.20);
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 2px 10px rgba(16, 185, 129, 0.2);
}

/* 3. Transfer */
.btn-tx-transfer {
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
    color: #f5f5f7;
}
.btn-tx-transfer svg {
    stroke: #38bdf8;
}
.btn-tx-transfer:hover {
    background: rgba(56, 189, 248, 0.20);
    border-color: rgba(56, 189, 248, 0.45);
    box-shadow: 0 2px 10px rgba(56, 189, 248, 0.2);
}

/* 4. Remittance */
.btn-tx-remittance {
    background: rgba(192, 132, 252, 0.12);
    border: 1px solid rgba(192, 132, 252, 0.25);
    color: #f5f5f7;
}
.btn-tx-remittance svg {
    stroke: #c084fc;
}
.btn-tx-remittance:hover {
    background: rgba(192, 132, 252, 0.20);
    border-color: rgba(192, 132, 252, 0.45);
    box-shadow: 0 2px 10px rgba(192, 132, 252, 0.2);
}
```

### 3.3 Secondary Action (`.btn-secondary`)
- **Usage:** Cancel, back, export CSV/PDF, filter reset.
- **Styling:**
  ```css
  .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      border: 1px solid var(--border-default);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
      font-weight: 500;
  }

  .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--border-hover);
      color: #ffffff;
  }

  .btn-secondary:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.04);
  }
  ```

### 3.4 Destructive Hierarchy
- **Tier 1 — Trigger (`.btn-danger-ghost`):**
  ```css
  .btn-danger-ghost {
      background: transparent;
      color: #e0524a;
      border: 1px solid rgba(222, 74, 66, 0.25);
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 160ms var(--ease-out), border-color 160ms var(--ease-out);
  }

  .btn-danger-ghost:hover {
      background: rgba(222, 74, 66, 0.12);
      border-color: rgba(222, 74, 66, 0.45);
      color: #f87171;
  }
  ```
- **Tier 2 — Irreversible Confirmation (`.btn-danger`):**
  ```css
  .btn-danger {
      background: var(--error); /* #de4a42 */
      color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.2);
      box-shadow: 0 1px 3px rgba(222, 74, 66, 0.35);
      font-weight: 510;
  }

  .btn-danger:hover {
      background: #c93b34;
      border-color: #b3322c;
  }

  .btn-danger:active {
      transform: scale(0.98);
  }
  ```

### 3.5 Floating Action Button (FAB) & Mobile Speed-Dial
- **Main FAB:** 52px diameter circle floating bottom-right. Metallic subtle gradient resting, rotates plus icon 45deg on open.
- **Speed-Dial Actions:**
  - Replace saturated `bg-red`, `bg-blue`, `bg-purple`, `bg-green` with 48px frosted discs using the exact 12% tint:
    - Expense: `background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.25); stroke: #fb7185;`
    - Income: `background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); stroke: #34d399;`
    - Transfer: `background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.25); stroke: #38bdf8;`
    - Remittance: `background: rgba(192, 132, 252, 0.12); border: 1px solid rgba(192, 132, 252, 0.25); stroke: #c084fc;`
  - Unified Lucide glyphs:
    - Expense: `arrow-up-right`
    - Income: `arrow-down-left`
    - Transfer: `arrow-left-right`
    - Remittance: `send`

---

## 4. Preservation of Meaningful Financial Color

We strictly preserve and protect expressive visual data so the application remains intuitive and rapid to parse:

| Domain | Visual Treatment | Preservation Rule |
| :--- | :--- | :--- |
| **Physical Wallet Cards** | Layered dark gradients (Charcoal, Sapphire, Emerald, Gold, Obsidian), EMV chip, contactless glyph | **Preserved:** Authentic material weight and tactile card personality. Saturated radial glow blobs removed in favor of elegant tone-on-tone textures. |
| **Country Visual Markers** | Japan (circle), India (saffron/green), Germany (tricolor) flags and ISO tags | **Preserved:** Authentic flag badges and currency indicators (`¥`, `₹`, `€`). |
| **Financial Ledger Flow** | Income: `+` with `var(--success)` (`#30d158`)<br>Expense: `-` with `var(--text-primary)` or muted `var(--error)` | **Preserved:** Tabular lining numbers (`--font-numeric`) with instant visual polarity. |
| **Budget Progress Indicators** | Linear progress bars: Cushion (`--success`), Warning at 80% (`--warning`), Overspend (`--error`) | **Preserved:** Single-tone clean fills (no cheesy multi-hue gradient shifts within a single bar). |
| **Analytical Charts** | Spending line curve, income comparison bars, category distribution | **Preserved:** Expressive Chart.js palettes calibrated for high contrast on black. |
| **Status Pills & Badges** | Active period pill, closed month lock pill, synced status indicator | **Preserved:** Low-saturation tinted badges (`rgba(..., 0.12)` fill with matching 1px border). |

---

## 5. CSS Refactoring & De-duplication Roadmap

1. **Remove Duplicate Rules:**
   - `.btn-add-tx` (lines 584–665) merged to inherit `.btn-primary`.
   - Remove duplicate `.action-type-card` block (line 8311 vs line 10899).
   - Remove duplicate `.tx-type-icon` block (line 3627 vs line 7279).
2. **Deprecate Unused Saturated Helpers:**
   - Remove `.btn-blue`, `.btn-green`, `.btn-purple` from `css/style.css`.
3. **Harmonize Primary Action Sizing:**
   - Replace fixed `width: 158px` with `padding: 0 16px; min-width: 120px; width: auto;`.
4. **Script Updates in `js/app.js`:**
   - Update `openTransactionModal()`: Assign `class="btn-tx-submit btn-tx-${type}"` and `id="tx-submit-btn"`.
   - Update `editCurrentDetailTransaction()`: Query `#tx-submit-btn` uniformly instead of querying `.btn-green` or `.btn-blue`.
   - Remove inline styles on `#closing-btn-confirm` and `#cat-btn-archive` in `index.html`.

---

## 6. Verification & Safety Constraints

1. **WCAG Contrast Ratios:**
   - Primary button resting: `#f5f5f7` text on `rgba(255,255,255,0.28)` composite exceeds 4.5:1.
   - Primary button hover: `#121214` on `rgba(255,255,255,0.92)` exceeds 12:1.
   - Secondary button: `#f5f5f7` on `var(--bg-surface-2)` exceeds 8:1.
   - Danger ghost: `#e0524a` text on dark background meets 4.5:1.
2. **Zero Financial Calculation Interference:**
   - Refactoring is strictly confined to class names, CSS tokens, and button text bindings.
   - Zero changes to transaction payloads, math calculations, schema serialization, or Supabase synchronization.
3. **Implementation Gate:**
   - Per explicit instructions: **Do not implement these visual changes until this design specification is approved.**
