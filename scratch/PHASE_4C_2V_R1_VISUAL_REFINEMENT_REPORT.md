# Phase 4C.2V-R1 — Visual refinement and layout precision

Baseline `4941c6429309719f692d72ea53acb94783ff85ac` on `test`. This phase changes `scratch/design-lab/lab.js`, `scratch/design-lab/lab.css`, the three evidence files below, and this report.

| Before | After | Why |
| --- | --- | --- |
| The integrated previews loaded B3 by default. | Both start with **B1 · Edge glimmer only**, using the existing 105ms desktop dwell, 790ms duration, 56% edge intensity, 19% edge radius, and forward direction. | Each intentional interaction moves one soft highlight along the edge. |
| The shared hover rule painted `#202025` behind the 34px sidebar toggle. The expanded link hover also painted a row background. | Navigation controls keep transparent hover and press backgrounds. Links use foreground feedback and the existing active marker. Keyboard focus retains its 2px outline. | The icon sits directly on the rail surface while the hit area and drawer behavior stay available. |

Unversioned settings saved B3 even when someone changed only a slider. The migration converts that legacy B3 value to B1 and keeps valid saved parameters and any legacy B2 choice. After migration, explicit variant choices persist normally. The B2 and B3 comparisons remain available.

## Alignment

The lab already gives the summary and grid the same section width. Japan and India returned identical measurements before and during drawer expansion. The right card measured in each case was the last card of the first complete row, with the grid gaps included in the span.

| Width | Summary left | Summary right | First card left | Last card right | Left / right difference |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 390 | 12 | 378 | 12 | 378 | 0 / 0 |
| 767 | 78 | 738 | 78 | 737.9844 | 0 / 0.0156 |
| 768 | 78 | 739 | 78 | 739 | 0 / 0 |
| 769 | 78 | 740 | 78 | 740 | 0 / 0 |
| 1024 | 78 | 727.7344 | 78 | 727.7188 | 0 / 0.0156 |
| 1440 | 90 | 997.8125 | 90 | 997.8125 | 0 / 0 |
| 1920 | 90 | 1333.8125 | 90 | 1333.8125 | 0 / 0 |

All values are CSS pixels. The lab used two columns in the 390px mobile preview and three in each desktop preview. The drawer left workspace and card geometry stable, with zero document overflow across these checks.

### Future application correction

On the application dashboard, the summary and grid are siblings in `.collapsible-inner`. At **768px and above**, the summary’s `width: 100%` reaches the parent edges, while `.category-grid { padding: 0 16px; }` insets only the grid’s cards. The mobile rule at `max-width: 767.98px` removes that inset. For example, at 1440px the summary spans `104–1023px`, while the card row spans `120–1006.9844px`.

Move the grid’s existing inline padding to the common parent in the application stylesheet. Remove `padding: 0 16px` from the base `.category-grid` rule and the now-redundant `padding: 0 !important` declarations on that grid in the two mobile rules. Keep its columns, gaps, and the summary’s border-box sizing. Apply the existing responsive inset to the parent.

```css
#home-view .collapsible-inner:has(> .category-grid) {
    padding-inline: 16px;
}

@media (max-width: 767.98px) {
    #home-view .collapsible-inner:has(> .category-grid) {
        padding-inline: 0;
    }
}
```

A temporary Chromium style override reproduced this correction in both application regions across all seven widths. It preserved every category-card boundary and aligned the summary to within 0.0156px.

## Verification and evidence

Applied frontend-design for the focused visual correction, emil-design-eng and review-animations for optical motion and feedback, and frontend-testing-debugging for the local Chromium run. The 4.4-second recording shows the glimmer crossing the upper edge and the sidebar opening and closing. Browser checks covered stationary hover, rapid crossings, B1 without interior shine, stable card materials and 3.5px progress, reduced motion, touch-scroll cancellation, keyboard and click navigation, variant controls, and regional and branded wallet gradients. Mobile checks used Chromium touch emulation.

- [Desktop dashboard with expanded frameless sidebar](design-lab/evidence/4c2v-r1-desktop.webp)
- [Budget alignment close-up](design-lab/evidence/4c2v-r1-budget-alignment.webp)
- [Normal-speed B1 and sidebar recording](design-lab/evidence/4c2v-r1-glimmer-sidebar.mp4)

**VISUAL REFINEMENT AND LAYOUT PRECISION COMPLETE — AWAITING OWNER ACCEPTANCE**
