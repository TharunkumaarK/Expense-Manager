#!/usr/bin/env python3
"""
Expense Manager — Onboarding Wallet Customization Automated Verification Suite
Tests the complete wallet customization functionality during onboarding:
1. Adding new wallets with chosen name, account type, and visual theme.
2. Editing existing/default starter wallets (renaming, changing type, changing theme/color).
3. Triggering editing via both the dedicated pencil button and direct click on wallet row.
4. Country-curated theme ordering in the visual theme picker.
5. Inline validation (empty name check, duplicate name collision prevention).
6. Opening balance preservation during customization.
7. Responsive mobile/desktop containment and 44px touch targets.
8. State persistence to StorageManager and final ledger integrity.
"""

import os
import sys
import time
import json
import subprocess
import urllib.request

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME_BIN = '/usr/bin/google-chrome-stable'
PORT = 9445
BASE_URL = f"file://{HTML_PATH}"

class CDPClient:
    def __init__(self, port=PORT):
        self.port = port
        self.ws_url = None
        self.sock = None
        self.msg_id = 0

    def start_chrome(self, width=390, height=844):
        import socket
        cmd = [
            CHROME_BIN,
            '--headless=new',
            f'--remote-debugging-port={self.port}',
            f'--window-size={width},{height}',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-extensions',
            '--user-data-dir=/tmp/chrome_onboarding_custom_test_' + str(int(time.time()))
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.0)
        
        # Connect to debugging endpoint
        res = urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json").read()
        tabs = json.loads(res.decode('utf-8'))
        self.ws_url = tabs[0]['webSocketDebuggerUrl']
        
        # Establish websocket
        import websocket
        self.ws = websocket.create_connection(self.ws_url)
        self.enable_domains()

    def enable_domains(self):
        self.call("Page.enable")
        self.call("DOM.enable")
        self.call("Runtime.enable")

    def call(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method}
        if params:
            msg["params"] = params
        self.ws.send(json.dumps(msg))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") == self.msg_id:
                return resp.get("result", {})

    def eval(self, expr):
        res = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in res:
            raise RuntimeError(f"CDP Eval error: {res['exceptionDetails']}")
        return res.get("result", {}).get("value")

    def set_viewport(self, width, height):
        self.call("Emulation.setDeviceMetricsOverride", {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": width <= 768
        })
        time.sleep(0.15)

    def screenshot(self, path):
        res = self.call("Page.captureScreenshot", {"format": "png"})
        import base64
        data = base64.b64decode(res["data"])
        with open(path, "wb") as f:
            f.write(data)

    def close(self):
        try:
            self.ws.close()
        except:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=2)
        except:
            pass

def run_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — ONBOARDING WALLET CUSTOMIZATION VERIFICATION SUITE")
    print("=" * 80)
    
    cdp = CDPClient()
    cdp.start_chrome(width=390, height=844)
    
    try:
        # Navigate
        cdp.call("Page.navigate", {"url": BASE_URL})
        time.sleep(1.2)
        
        # --- SECTION 1: Clean State Initialization ---
        print("\n--- SECTION 1: Clean State Initialization ---")
        cdp.eval("""
            (() => {
                localStorage.clear();
                if (typeof onboardingController !== 'undefined') {
                    onboardingController.draft = {
                        activeCountries: ['JP'],
                        defaultCountry: 'JP',
                        budgets: {
                            JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true },
                            IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                            DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                        },
                        wallets: {},
                        loanConfig: {
                            enabled: false,
                            country: 'IN',
                            currency: '₹',
                            totalPrincipal: 0,
                            principalLeft: 0,
                            emi: 0,
                            annualInterestRate: 0,
                            emiDrawDate: 7
                        }
                    };
                    onboardingController._initDraftWallets();
                    onboardingController.show();
                    onboardingController.currentStep = 1;
                    onboardingController.render();
                    return true;
                }
                return false;
            })()
        """)
        time.sleep(0.3)
        step = cdp.eval("onboardingController.currentStep")
        assert step == 1, f"Expected step 1, got {step}"
        print("  [PASS] Clean state initialized, on step 1")

        # Select JP, IN, DE in Step 1
        cdp.eval("""
            onboardingController.toggleCountry('IN');
            onboardingController.toggleCountry('DE');
            onboardingController.handleNext(); // Move to Step 2
            onboardingController.handleNext(); // Move to Step 3
        """)
        time.sleep(0.3)
        step = cdp.eval("onboardingController.currentStep")
        assert step == 3, f"Expected step 3, got {step}"
        active_countries = cdp.eval("onboardingController.draft.activeCountries")
        assert len(active_countries) == 3, f"Expected 3 active countries, got {active_countries}"
        print("  [PASS] Advanced to Step 3 with active countries: JP, IN, DE")

        # --- SECTION 2: Starter Wallets & UI Elements in Step 3 ---
        print("\n--- SECTION 2: Starter Wallets & UI Elements in Step 3 ---")
        wallets = cdp.eval("Object.keys(onboardingController.draft.wallets)")
        print(f"  Starter wallets ({len(wallets)}): {wallets}")
        assert "Salary Account" in wallets, "Expected Salary Account in draft wallets"
        assert "Bank Account" in wallets, "Expected Bank Account in draft wallets"
        assert "Checking Account" in wallets, "Expected Checking Account in draft wallets"

        # Verify Edit buttons exist for all rows
        edit_btn_count = cdp.eval("document.querySelectorAll('.onboarding-wallet-edit-btn').length")
        assert edit_btn_count == len(wallets), f"Expected {len(wallets)} edit buttons, got {edit_btn_count}"
        print(f"  [PASS] All {edit_btn_count} wallet rows have dedicated edit buttons (.onboarding-wallet-edit-btn)")

        # Verify themes are assigned to starter wallets
        jp_theme = cdp.eval("onboardingController.draft.wallets['Salary Account'].theme")
        in_theme = cdp.eval("onboardingController.draft.wallets['Bank Account'].theme")
        de_theme = cdp.eval("onboardingController.draft.wallets['Checking Account'].theme")
        assert jp_theme == 'emerald-salary', f"Expected emerald-salary, got {jp_theme}"
        assert in_theme == 'burgundy-axis', f"Expected burgundy-axis, got {in_theme}"
        assert de_theme == 'frankfurt-slate', f"Expected frankfurt-slate, got {de_theme}"
        print("  [PASS] Starter templates have explicit theme bindings (emerald-salary, burgundy-axis, frankfurt-slate)")

        # --- SECTION 3: Edit Existing Starter Account via Dedicated Pencil Button ---
        print("\n--- SECTION 3: Edit Existing Starter Account via Dedicated Pencil Button ---")
        # Trigger edit modal for "Salary Account"
        cdp.eval("""
            const editBtn = document.querySelector('.onboarding-wallet-edit-btn[data-wallet-id="Salary Account"]');
            editBtn.click();
        """)
        time.sleep(0.2)

        modal_visible = cdp.eval("document.getElementById('onboarding-add-account-modal').style.display !== 'none'")
        assert modal_visible, "Expected customization modal to be visible"
        modal_title = cdp.eval("document.getElementById('onboarding-add-modal-title').textContent")
        assert modal_title == "Edit Account", f"Expected title 'Edit Account', got '{modal_title}'"
        modal_name = cdp.eval("document.getElementById('onboarding-modal-account-name').value")
        assert modal_name == "Salary Account", f"Expected name 'Salary Account', got '{modal_name}'"
        modal_type = cdp.eval("document.getElementById('onboarding-modal-account-type').value")
        assert modal_type == "bank", f"Expected type 'bank', got '{modal_type}'"
        modal_theme = cdp.eval("document.getElementById('onboarding-modal-theme-val').value")
        assert modal_theme == "emerald-salary", f"Expected theme 'emerald-salary', got '{modal_theme}'"
        print("  [PASS] Edit modal opened with correct prefilled fields and active theme")

        # Capture screenshot of edit modal
        cdp.screenshot("scratch/onboarding_custom_modal_edit_390.png")
        print("  [INFO] Captured screenshot: scratch/onboarding_custom_modal_edit_390.png")

        # Modify: rename to "MUFG Main Salary", type to "card", theme to "violet-suica"
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = 'MUFG Main Salary';
            document.getElementById('onboarding-modal-account-type').value = 'card';
            // Click violet-suica tile
            const suicaTile = document.querySelector('.theme-picker-tile[data-theme-id="violet-suica"]');
            suicaTile.click();
            // Submit form
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.3)

        # Verify modal closed
        modal_closed = cdp.eval("document.getElementById('onboarding-add-account-modal').style.display === 'none'")
        assert modal_closed, "Modal should be closed after submit"

        # Verify state mutation
        wallets_after_edit = cdp.eval("onboardingController.draft.wallets")
        assert "Salary Account" not in wallets_after_edit, "Old ID 'Salary Account' should be deleted"
        assert "MUFG Main Salary" in wallets_after_edit, "New ID 'MUFG Main Salary' should exist in draft"
        edited_w = wallets_after_edit["MUFG Main Salary"]
        assert edited_w["name"] == "MUFG Main Salary", f"Expected name 'MUFG Main Salary', got {edited_w['name']}"
        assert edited_w["type"] == "card", f"Expected type 'card', got {edited_w['type']}"
        assert edited_w["theme"] == "violet-suica", f"Expected theme 'violet-suica', got {edited_w['theme']}"
        assert edited_w["color"] == "#7c3aed", f"Expected color '#7c3aed', got {edited_w['color']}"
        print("  [PASS] Wallet renamed, type changed to card, theme changed to violet-suica (#7c3aed)")

        # Verify DOM rendering updated
        rendered_row = cdp.eval("document.querySelector('.onboarding-wallet-row[data-wallet-id=\"MUFG Main Salary\"]') !== null")
        assert rendered_row, "DOM should render updated wallet row"
        rendered_type = cdp.eval("document.querySelector('.onboarding-wallet-row[data-wallet-id=\"MUFG Main Salary\"] .onboarding-wallet-row-type').textContent")
        assert rendered_type == "CARD", f"Expected 'CARD', got '{rendered_type}'"
        print("  [PASS] DOM updated with new name and 'CARD' badge")

        # --- SECTION 4: Edit via Direct Click on Wallet Row Left Info ---
        print("\n--- SECTION 4: Edit via Direct Click on Wallet Row Left Info ---")
        cdp.eval("""
            const rowLeft = document.querySelector('.onboarding-wallet-row-left[data-wallet-id="Bank Account"]');
            rowLeft.click();
        """)
        time.sleep(0.2)

        modal_visible = cdp.eval("document.getElementById('onboarding-add-account-modal').style.display !== 'none'")
        assert modal_visible, "Modal should open when clicking row-left"
        name_val = cdp.eval("document.getElementById('onboarding-modal-account-name').value")
        assert name_val == "Bank Account", f"Expected 'Bank Account', got '{name_val}'"

        # Change name to "SBI Premier Wealth" and theme to "sapphire-sbi"
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = 'SBI Premier Wealth';
            const sbiTile = document.querySelector('.theme-picker-tile[data-theme-id="sapphire-sbi"]');
            sbiTile.click();
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.3)

        wallets_after_sbi = cdp.eval("onboardingController.draft.wallets")
        assert "SBI Premier Wealth" in wallets_after_sbi, "Expected 'SBI Premier Wealth' in draft"
        assert wallets_after_sbi["SBI Premier Wealth"]["theme"] == "sapphire-sbi", "Expected sapphire-sbi theme"
        assert wallets_after_sbi["SBI Premier Wealth"]["color"] == "#1d4ed8", "Expected sapphire blue color"
        print("  [PASS] Direct click on row info opened modal, customized to 'SBI Premier Wealth' (#1d4ed8)")

        # --- SECTION 5: Add New Custom Wallet with Theme & Type Selection ---
        print("\n--- SECTION 5: Add New Custom Wallet with Theme & Type Selection ---")
        cdp.eval("""
            const addBtn = document.querySelector('.onboarding-btn-add-wallet[data-region="IN"]');
            addBtn.click();
        """)
        time.sleep(0.2)

        modal_title = cdp.eval("document.getElementById('onboarding-add-modal-title').textContent")
        assert "Add India Account" in modal_title, f"Expected 'Add India Account', got '{modal_title}'"
        btn_text = cdp.eval("document.getElementById('onboarding-add-modal-submit').textContent")
        assert btn_text == "Add Account", f"Expected 'Add Account', got '{btn_text}'"

        # Check that featured themes for India are at the top
        first_theme_id = cdp.eval("document.querySelectorAll('#onboarding-wallet-theme-picker .theme-picker-tile')[0].getAttribute('data-theme-id')")
        assert first_theme_id in ['burgundy-axis', 'baroda-orange', 'sapphire-sbi', 'hfc-navy', 'icici-ruby'], f"Expected IN theme first, got {first_theme_id}"
        print(f"  [PASS] Add India Account modal opened with country-curated theme ordering (first: {first_theme_id})")

        # Create "HDFC Navy Reserve" with theme "hfc-navy" and type "bank"
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = 'HDFC Navy Reserve';
            document.getElementById('onboarding-modal-account-type').value = 'bank';
            const hdfcTile = document.querySelector('.theme-picker-tile[data-theme-id="hfc-navy"]');
            hdfcTile.click();
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.3)

        wallets_after_add = cdp.eval("onboardingController.draft.wallets")
        assert "HDFC Navy Reserve" in wallets_after_add, "Expected 'HDFC Navy Reserve' to be created"
        hdfc_w = wallets_after_add["HDFC Navy Reserve"]
        assert hdfc_w["theme"] == "hfc-navy", f"Expected hfc-navy, got {hdfc_w['theme']}"
        assert hdfc_w["color"] == "#1e3a8a", f"Expected #1e3a8a, got {hdfc_w['color']}"
        assert hdfc_w["region"] == "IN", f"Expected region IN, got {hdfc_w['region']}"
        print("  [PASS] Added custom wallet 'HDFC Navy Reserve' with HDFC Navy theme (#1e3a8a)")

        # --- SECTION 6: Inline Validation (Empty & Collision Prevention) ---
        print("\n--- SECTION 6: Inline Validation (Empty & Collision Prevention) ---")
        # 1. Empty name
        cdp.eval("""
            document.querySelector('.onboarding-btn-add-wallet[data-region="JP"]').click();
        """)
        time.sleep(0.2)
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = '   ';
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.1)
        err_text = cdp.eval("document.getElementById('onboarding-modal-account-error').textContent")
        assert "cannot be empty" in err_text, f"Expected empty error, got '{err_text}'"
        print("  [PASS] Empty account name rejected with inline validation error")

        # 2. Duplicate name on Add
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = 'HDFC Navy Reserve';
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.1)
        err_dup = cdp.eval("document.getElementById('onboarding-modal-account-error').textContent")
        assert "already exists" in err_dup, f"Expected duplicate error, got '{err_dup}'"
        print("  [PASS] Duplicate account name on Add rejected with collision error")

        # Cancel modal
        cdp.eval("document.getElementById('onboarding-add-modal-cancel').click();")
        time.sleep(0.1)

        # 3. Duplicate name on Edit
        cdp.eval("""
            document.querySelector('.onboarding-wallet-edit-btn[data-wallet-id="Cash"]').click();
        """)
        time.sleep(0.2)
        cdp.eval("""
            document.getElementById('onboarding-modal-account-name').value = 'MUFG Main Salary';
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.1)
        err_edit_dup = cdp.eval("document.getElementById('onboarding-modal-account-error').textContent")
        assert "already exists" in err_edit_dup, f"Expected duplicate edit error, got '{err_edit_dup}'"
        print("  [PASS] Renaming to existing account name rejected with collision error")

        cdp.eval("document.getElementById('onboarding-add-modal-cancel').click();")
        time.sleep(0.1)

        # --- SECTION 7: Balance Preservation across Customization ---
        print("\n--- SECTION 7: Balance Preservation across Customization ---")
        # Set balance on "MUFG Main Salary" to 250000
        cdp.eval("""
            (() => {
                const balInput = document.querySelector('.onboarding-balance-input[data-wallet-id="MUFG Main Salary"]');
                balInput.value = '250000';
                balInput.dispatchEvent(new Event('input', { bubbles: true }));
            })()
        """)
        time.sleep(0.1)
        bal_before = cdp.eval("onboardingController.draft.wallets['MUFG Main Salary'].balance")
        assert bal_before == 250000, f"Expected 250000, got {bal_before}"

        # Edit the wallet theme only
        cdp.eval("""
            document.querySelector('.onboarding-wallet-edit-btn[data-wallet-id="MUFG Main Salary"]').click();
        """)
        time.sleep(0.2)
        cdp.eval("""
            document.querySelector('.theme-picker-tile[data-theme-id="cyan-line"]').click();
            document.getElementById('onboarding-add-modal-submit').click();
        """)
        time.sleep(0.3)

        bal_after = cdp.eval("onboardingController.draft.wallets['MUFG Main Salary'].balance")
        assert bal_after == 250000, f"Balance must be preserved! Expected 250000, got {bal_after}"
        new_theme = cdp.eval("onboardingController.draft.wallets['MUFG Main Salary'].theme")
        assert new_theme == "cyan-line", f"Expected cyan-line, got {new_theme}"
        print("  [PASS] Balance preserved at exactly 250,000 across theme customization")

        # --- SECTION 8: Touch Target Sizing & Responsive Containment ---
        print("\n--- SECTION 8: Touch Target Sizing & Responsive Containment ---")
        viewports = [320, 375, 390, 430, 768, 1024, 1440]
        for w in viewports:
            cdp.set_viewport(w, 800)
            doc_scroll = cdp.eval("document.documentElement.scrollWidth")
            win_inner = cdp.eval("window.innerWidth")
            assert doc_scroll <= win_inner + 1, f"Horizontal overflow at {w}px: scrollWidth={doc_scroll} > {win_inner}"

            # Check touch targets for edit and delete buttons
            min_edit_h = cdp.eval("""
                Math.min(...Array.from(document.querySelectorAll('.onboarding-wallet-edit-btn')).map(b => b.getBoundingClientRect().height))
            """)
            min_del_h = cdp.eval("""
                Math.min(...Array.from(document.querySelectorAll('.onboarding-wallet-delete-btn')).map(b => b.getBoundingClientRect().height))
            """)
            min_target = 44.0 if w < 540 else 38.0
            assert min_edit_h >= min_target - 0.5, f"Edit button height too small at {w}px: {min_edit_h}px"
            assert min_del_h >= min_target - 0.5, f"Delete button height too small at {w}px: {min_del_h}px"
            print(f"  [PASS] Viewport {w}px: 0.0px overflow, edit/delete buttons comply with touch targets ({min_edit_h:.1f}px)")

        # Capture final Step 3 screenshots
        cdp.set_viewport(390, 844)
        cdp.screenshot("scratch/onboarding_custom_step3_390.png")
        cdp.set_viewport(1440, 900)
        cdp.screenshot("scratch/onboarding_custom_step3_1440.png")
        print("  [INFO] Captured screenshots: scratch/onboarding_custom_step3_390.png & scratch/onboarding_custom_step3_1440.png")

        # --- SECTION 9: Navigation Resilience & Draft State Invariants ---
        print("\n--- SECTION 9: Navigation Resilience & Draft State Invariants ---")
        # Navigate backward to Step 2, then back to Step 3
        cdp.eval("""
            onboardingController.handleBack(); // To Step 2
            onboardingController.handleNext(); // Back to Step 3
        """)
        time.sleep(0.3)
        wallets_reloaded = cdp.eval("onboardingController.draft.wallets")
        assert "MUFG Main Salary" in wallets_reloaded, "Custom wallet MUFG Main Salary must survive step navigation"
        assert "SBI Premier Wealth" in wallets_reloaded, "Custom wallet SBI Premier Wealth must survive step navigation"
        assert "HDFC Navy Reserve" in wallets_reloaded, "Custom wallet HDFC Navy Reserve must survive step navigation"
        assert wallets_reloaded["MUFG Main Salary"]["balance"] == 250000, "Balance must survive step navigation"
        print("  [PASS] All customized wallets, themes, and balances survived backward/forward step navigation")

        # --- SECTION 10: Step 4 Review & Final State Persistence ---
        print("\n--- SECTION 10: Step 4 Review & Final State Persistence ---")
        cdp.eval("onboardingController.handleNext();") # Move to Step 4
        time.sleep(0.3)
        step = cdp.eval("onboardingController.currentStep")
        assert step == 4, f"Expected step 4, got {step}"

        # Complete and enter app
        cdp.eval("""
            onboardingController.persistDraftLocally();
            onboardingController.completeAndEnterApp();
        """)
        time.sleep(0.4)

        # Check storage.state.wallets
        persisted_wallets = cdp.eval("storage.state.wallets")
        assert "MUFG Main Salary" in persisted_wallets, "MUFG Main Salary must be in storage.state.wallets"
        assert "SBI Premier Wealth" in persisted_wallets, "SBI Premier Wealth must be in storage.state.wallets"
        assert "HDFC Navy Reserve" in persisted_wallets, "HDFC Navy Reserve must be in storage.state.wallets"
        assert persisted_wallets["MUFG Main Salary"]["theme"] == "cyan-line", "Custom theme must be in storage"
        assert persisted_wallets["HDFC Navy Reserve"]["color"] == "#1e3a8a", "Custom color must be in storage"
        assert persisted_wallets["MUFG Main Salary"]["type"] == "card", "Custom type must be in storage"
        print("  [PASS] All customized wallets, themes, types, and colors persisted into storage.state.wallets")

        # App content is visible
        app_visible = cdp.eval("document.getElementById('app-content').style.display !== 'none'")
        onboarding_hidden = cdp.eval("document.getElementById('onboarding-screen').style.display === 'none'")
        assert app_visible, "Main app content should be visible after onboarding completion"
        assert onboarding_hidden, "Onboarding screen should be hidden after onboarding completion"
        print("  [PASS] Onboarding dismissed and main application entered cleanly")

        print("\n" + "=" * 80)
        print("ALL 10 ONBOARDING CUSTOMIZATION TEST SECTIONS PASSED!")
        print("=" * 80)

    finally:
        cdp.close()

if __name__ == '__main__':
    run_tests()
