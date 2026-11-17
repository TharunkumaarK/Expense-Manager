#!/usr/bin/env python3
"""
Test Suite: Design Identity Refinements & Button Hierarchy Verification
Verifies that all approved design identity tokens, button hierarchies,
and DOM elements match the approved specification in scratch/expense_manager_design_identity.md.
"""

import sys
import re

def test_css_tokens():
    with open('css/style.css', 'r', encoding='utf-8') as f:
        css = f.read()

    checks = [
        ("btn-primary has natural content width", r"\.header-action-btn[^}]*min-width:\s*120px"),
        ("btn-primary has auto width", r"\.header-action-btn[^}]*width:\s*auto"),
        ("btn-tx-submit defined", r"\.btn-tx-submit\s*\{"),
        ("btn-tx-expense defined with 12% rose tint", r"\.btn-tx-expense\s*\{[^}]*rgba\(244,\s*63,\s*94,\s*0\.12\)"),
        ("btn-tx-income defined with 12% emerald tint", r"\.btn-tx-income\s*\{[^}]*rgba\(16,\s*185,\s*129,\s*0\.12\)"),
        ("btn-tx-transfer defined with 12% sky blue tint", r"\.btn-tx-transfer\s*\{[^}]*rgba\(56,\s*189,\s*248,\s*0\.12\)"),
        ("btn-tx-remittance defined with 12% lilac tint", r"\.btn-tx-remittance\s*\{[^}]*rgba\(192,\s*132,\s*252,\s*0\.12\)"),
        ("btn-danger-ghost defined with semantic red border", r"\.btn-danger-ghost\s*\{[^}]*rgba\(222,\s*74,\s*66,\s*0\.25\)"),
        ("btn-danger defined with var(--error) solid background", r"\.btn-danger\s*\{[^}]*background:\s*var\(--error\)"),
        ("fab-icon-expense defined", r"\.fab-icon-expense\s*\{"),
        ("fab-icon-income defined", r"\.fab-icon-income\s*\{"),
        ("fab-icon-transfer defined", r"\.fab-icon-transfer\s*\{"),
        ("fab-icon-remittance defined", r"\.fab-icon-remittance\s*\{"),
    ]

    passed = 0
    for name, pattern in checks:
        if re.search(pattern, css):
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}")

    # Verify no duplicate standalone .btn-add-tx block
    add_tx_matches = len(re.findall(r"^\.btn-add-tx\s*\{", css, re.MULTILINE))
    if add_tx_matches == 1:
        print("  [PASS] Single concise .btn-add-tx rule (no duplicate 80-line declaration)")
        passed += 1
    else:
        print(f"  [FAIL] Expected 1 standalone .btn-add-tx rule, found {add_tx_matches}")

    return passed, len(checks) + 1

def test_html_markup():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    checks = [
        ("FAB speed dial uses fab-icon-expense with arrow-up-right", r'fab-icon\s+fab-icon-expense.*data-lucide="arrow-up-right"'),
        ("FAB speed dial uses fab-icon-transfer with arrow-left-right", r'fab-icon\s+fab-icon-transfer.*data-lucide="arrow-left-right"'),
        ("FAB speed dial uses fab-icon-remittance with send", r'fab-icon\s+fab-icon-remittance.*data-lucide="send"'),
        ("FAB speed dial uses fab-icon-income with arrow-down-left", r'fab-icon\s+fab-icon-income.*data-lucide="arrow-down-left"'),
        ("Closing confirm button has no inline #10b981 style", r'id="closing-btn-confirm"[^>]*style="display:none;"'),
        ("Category archive button uses btn-danger-ghost without inline #ef4444", r'class="btn btn-danger-ghost"\s+id="cat-btn-archive"'),
        ("Transaction detail delete button uses btn-danger-ghost", r'class="btn btn-danger-ghost btn-sm"\s+id="tx-detail-delete-btn"'),
        ("Transaction form header includes back button and sheet-header-left", r'class="sheet-header-left"[^>]*>\s*<button[^>]*id="tx-modal-back-btn"'),
    ]

    passed = 0
    for name, pattern in checks:
        if re.search(pattern, html, re.DOTALL):
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}")

    return passed, len(checks)

def test_js_app():
    with open('js/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    checks = [
        ("Expense submit button uses btn-tx-submit btn-tx-expense", r'class="btn btn-tx-submit btn-tx-expense"\s+id="tx-submit-btn"'),
        ("Transfer submit button uses btn-tx-submit btn-tx-transfer", r'class="btn btn-tx-submit btn-tx-transfer"\s+id="tx-submit-btn"'),
        ("Remittance submit button uses btn-tx-submit btn-tx-remittance", r'class="btn btn-tx-submit btn-tx-remittance"\s+id="tx-submit-btn"'),
        ("Income submit button uses btn-tx-submit btn-tx-income", r'class="btn btn-tx-submit btn-tx-income"\s+id="tx-submit-btn"'),
        ("In-form delete button uses btn-danger-ghost", r'delBtn\.className\s*=\s*[\'"]btn btn-danger-ghost mt-2[\'"]'),
        ("Submit button edit update uses unified selector", r'content\.querySelector\([\'"]#tx-submit-btn span[\'"]\)'),
        ("lucide.createIcons called on modal content", r'lucide\.createIcons\(\);'),
        ("handleTransactionModalBack handler implemented", r'handleTransactionModalBack\(\)\s*\{'),
    ]

    passed = 0
    for name, pattern in checks:
        if re.search(pattern, js):
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}")

    return passed, len(checks)

def main():
    print("=" * 70)
    print("DESIGN IDENTITY REFINEMENTS VERIFICATION SUITE")
    print("=" * 70)

    print("\n--- 1. CSS Design Tokens & Classes ---")
    css_passed, css_total = test_css_tokens()

    print("\n--- 2. HTML Markup & Component Classes ---")
    html_passed, html_total = test_html_markup()

    print("\n--- 3. JavaScript Modal Handlers & Submit Binding ---")
    js_passed, js_total = test_js_app()

    total_passed = css_passed + html_passed + js_passed
    total_checks = css_total + html_total + js_total

    print("\n" + "=" * 70)
    print(f"TOTAL CHECKS: {total_checks} | PASSED: {total_passed} | FAILED: {total_checks - total_passed}")
    print("=" * 70)

    if total_passed == total_checks:
        print("\n🎉 ALL DESIGN IDENTITY REFINEMENTS VERIFIED SUCCESSFULLY!")
        sys.exit(0)
    else:
        print("\n❌ SOME CHECKS FAILED.")
        sys.exit(1)

if __name__ == '__main__':
    main()
