#!/usr/bin/env python3
"""
Automated Verification Script: Mobile Overall Budget Card Refinement
Verifies:
1. Two-tier header on Dashboard and Budgets page.
2. Two-item direct comparison bottom stats row on a single line.
3. 0.0px overflow across all mobile viewports (320px - 430px) and desktop.
4. Captures visual screenshots for verification.
"""

import os
import sys
import time
import json
import base64
import subprocess
import urllib.request
import websocket

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'
PORT = 9482
BASE_URL = f"file://{HTML_PATH}"

def run_tests():
    cmd = [
        CHROME_BIN,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/chrome_budget_diag_' + str(int(time.time()))
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)

    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read()
        tabs = json.loads(res.decode('utf-8'))
        ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'])

        msg_id = 0
        def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            msg = {"id": msg_id, "method": method, "params": params or {}}
            ws.send(json.dumps(msg))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        call("Page.enable")
        call("DOM.enable")
        call("Page.navigate", {"url": BASE_URL})
        time.sleep(1.5)

        # Setup active state with Japan budget, rollover cushion, and categories
        setup_script = """
        storage.state.preferences.activeCountries = ['JP'];
        storage.state.preferences.defaultCountry = 'JP';
        storage.state.preferences.onboardingCompleted = true;
        storage.state.budgets = {
            JP: { enabled: true, monthlyTotal: 120000, rolloverEnabled: true, carryover: 15000 },
            IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 },
            DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 }
        };
        storage.state.wallets = {
            'w-jp-1': { id: 'w-jp-1', name: 'Mizuho Checking', currency: '¥', region: 'JP', balance: 80000, isArchived: false }
        };
        storage.state.categories.JP = [
            { id: 'jp-food', name: 'Food & Groceries', budget: 40000, isActive: true, icon: 'utensils', contributesToTotalBudget: true },
            { id: 'jp-rent', name: 'Housing & Rent', budget: 50000, isActive: true, icon: 'home', contributesToTotalBudget: true }
        ];
        storage.state.transactions = [
            { id: 'tx1', type: 'expense', amount: 32000, region: 'JP', categoryId: 'jp-food', date: new Date().toISOString().slice(0, 10) }
        ];
        storage.saveData();

        if (document.getElementById('auth-screen')) document.getElementById('auth-screen').style.display = 'none';
        if (document.getElementById('onboarding-screen')) document.getElementById('onboarding-screen').style.display = 'none';
        if (document.getElementById('app-content')) document.getElementById('app-content').style.display = 'block';
        app.switchView('home-view');
        app.renderAll();
        """
        call("Runtime.evaluate", {"expression": setup_script})
        time.sleep(0.5)

        # -------------------------------------------------------------
        # TEST 1: Inspect Layout Geometry Across Viewports
        # -------------------------------------------------------------
        print("\n--- TEST 1: Overall Budget Card Layout Geometry ---")
        viewports = [320, 360, 375, 390, 412, 430, 768, 1024]

        for w in viewports:
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": 844,
                "deviceScaleFactor": 1,
                "mobile": (w <= 768)
            })
            time.sleep(0.2)

            inspect_eval = """
            (function() {
                const toBox = r => ({ top: r.top, left: r.left, width: r.width, height: r.height, right: r.right });
                const card = document.getElementById('budget-overview-card');
                const countryCard = document.getElementById('jp-country-card');
                const catGrid = document.getElementById('jp-categories-grid');
                if (!card) return { error: 'Card not found' };

                const header = card.querySelector('.budget-central-header');
                const headerTop = card.querySelector('.budget-central-header-top');
                const badgesRow = card.querySelector('.budget-central-badges-row');
                const remainingInTop = headerTop ? headerTop.querySelector('.budget-remaining-hero') : null;
                const editBtn = card.querySelector('.budgets-kpi-edit-btn');
                const progress = card.querySelector('.budget-central-progress-wrap');
                const stats = card.querySelector('.budget-central-stats-row');

                const badgesStyle = badgesRow ? getComputedStyle(badgesRow) : null;
                const statsStyle = stats ? getComputedStyle(stats) : null;
                const statsText = stats ? stats.innerText : '';

                const cushionPill = card.querySelector('.budget-cushion-pill');
                const cushionBadge = card.querySelector('.budget-cushion-badge');
                const pillStyle = cushionPill ? getComputedStyle(cushionPill) : null;
                const badgeStyle = cushionBadge ? getComputedStyle(cushionBadge) : null;

                const catItems = catGrid ? catGrid.querySelectorAll('.neon-row') : [];
                const cat0 = catItems[0] ? toBox(catItems[0].getBoundingClientRect()) : null;
                const cat1 = catItems[1] ? toBox(catItems[1].getBoundingClientRect()) : null;

                const summaryEl = document.getElementById('monthly-financial-summary');
                const trends = summaryEl ? summaryEl.querySelectorAll('.monthly-stat-trend') : [];
                const icons = summaryEl ? summaryEl.querySelectorAll('.monthly-stat-icon') : [];
                const subs = summaryEl ? Array.from(summaryEl.querySelectorAll('.monthly-stat-sub')).map(s => s.innerText) : [];

                const scrollW = document.documentElement.scrollWidth;
                const innerW = window.innerWidth;

                return {
                    card: toBox(card.getBoundingClientRect()),
                    countryCard: countryCard ? toBox(countryCard.getBoundingClientRect()) : null,
                    headerTop: headerTop ? toBox(headerTop.getBoundingClientRect()) : null,
                    badgesRow: badgesRow ? toBox(badgesRow.getBoundingClientRect()) : null,
                    remainingInTop: Boolean(remainingInTop),
                    isBadgesRightAligned: badgesStyle ? (badgesStyle.justifyContent === 'flex-end') : false,
                    statsText: statsText,
                    statsHasPct: statsText.includes('%'),
                    stats: stats ? toBox(stats.getBoundingClientRect()) : null,
                    statsMarginTop: statsStyle ? statsStyle.marginTop : '',
                    statsHeight: stats ? stats.clientHeight : 0,
                    headerTopHeight: headerTop ? headerTop.clientHeight : 0,
                    pillText: cushionPill ? cushionPill.innerText : '',
                    pillTooltip: cushionPill ? (cushionPill.getAttribute('title') || '') : '',
                    pillBg: pillStyle ? pillStyle.backgroundColor : '',
                    pillBorder: pillStyle ? pillStyle.borderWidth : '',
                    pillPadding: pillStyle ? pillStyle.padding : '',
                    hasSeparateRolloverBadge: Boolean(cushionBadge),
                    cat0: cat0,
                    cat1: cat1,
                    monthlyTrendsCount: trends.length,
                    monthlyIconsCount: icons.length,
                    monthlySubs: subs,
                    overflow: scrollW - innerW
                };
            })()
            """
            eval_res = call("Runtime.evaluate", {"expression": inspect_eval, "returnByValue": True})
            data = eval_res.get("result", {}).get("value", {})

            print(f"  Viewport {w}px:")
            print(f"    Card: {data['card']['width']:.1f}px x {data['card']['height']:.1f}px (left={data['card']['left']:.1f}, right={data['card']['right']:.1f})")
            if data['countryCard']:
                print(f"    CountryCard: (left={data['countryCard']['left']:.1f}, right={data['countryCard']['right']:.1f})")
            print(f"    Stats Margin-Top: {data['statsMarginTop']} | Height: {data['statsHeight']}px")
            print(f"    Pill Bg: '{data['pillBg']}' | Border: '{data['pillBorder']}' | Padding: '{data['pillPadding']}'")
            print(f"    Pill Text: '{data['pillText']}' | Tooltip: '{data['pillTooltip']}'")
            print(f"    Has Separate Rollover Badge: {data['hasSeparateRolloverBadge']}")
            print(f"    Badges Right-Aligned: {data['isBadgesRightAligned']}")
            print(f"    Stats Text: '{data['statsText']}' (Has %: {data['statsHasPct']})")
            print(f"    Horizontal Overflow: {data['overflow']}px")

            assert data['remainingInTop'] == False, f"Remaining hero should be removed from top row on {w}px"
            assert data['isBadgesRightAligned'] == True, f"Badges row should be right aligned on {w}px"
            assert data['statsHasPct'] == False, f"Stats row should NOT contain percentage on {w}px"
            assert "Remaining:" in data['statsText'], f"Stats row should contain 'Remaining:' on {w}px"
            assert data['headerTopHeight'] <= 36, f"Header top wrapped unexpectedly on {w}px: {data['headerTopHeight']}px"
            assert data['statsHeight'] <= 28, f"Stats row wrapped unexpectedly on {w}px: {data['statsHeight']}px"
            assert data['overflow'] <= 0.01, f"Horizontal overflow on {w}px: {data['overflow']}px"
            assert data['statsMarginTop'] == '8px', f"Expected stats row margin-top to be 8px, got {data['statsMarginTop']}"

            # Verify unified cushion: no separate purple rollover badge, merged into green cushion text with tooltip
            assert data['hasSeparateRolloverBadge'] == False, "Expected no separate purple rollover badge"
            assert 'Cushion' in data['pillText'], f"Expected 'Cushion' in pill text, got '{data['pillText']}'"
            assert 'Includes +' in data['pillTooltip'] and 'rollover from previous month' in data['pillTooltip'], f"Expected tooltip explaining rollover breakdown, got '{data['pillTooltip']}'"

            # Verify cushion typography-only styling (no pill background or border)
            assert data['pillBg'] in ['rgba(0, 0, 0, 0)', 'transparent', ''], f"Pill should have no background, got {data['pillBg']}"
            assert data['pillBorder'] in ['0px', ''], f"Pill should have no border, got {data['pillBorder']}"
            assert data['pillPadding'] in ['0px', '0px 0px 0px 0px', ''], f"Pill should have 0 padding, got {data['pillPadding']}"

            # Verify monthly summary cards: no redundant country trend badges, 3 minimalist icons, universal subtext
            assert data['monthlyTrendsCount'] == 0, f"Expected 0 monthly trend badges, got {data['monthlyTrendsCount']}"
            assert data['monthlyIconsCount'] == 3, f"Expected 3 monthly stat icons, got {data['monthlyIconsCount']}"
            assert data['monthlySubs'] == ['Earned this month', 'Spent this month', 'Inflows minus outflows'], f"Unexpected monthly subs: {data['monthlySubs']}"

            # Verify flush card alignment on mobile (w <= 640)
            if w <= 640 and data['countryCard']:
                assert abs(data['card']['left'] - data['countryCard']['left']) <= 1.0, f"Card left ({data['card']['left']}) should match Country card ({data['countryCard']['left']})"
                assert abs(data['card']['right'] - data['countryCard']['right']) <= 1.0, f"Card right ({data['card']['right']}) should match Country card ({data['countryCard']['right']})"
                if data['cat0']:
                    assert abs(data['cat0']['left'] - data['countryCard']['left']) <= 1.0, f"Category grid left ({data['cat0']['left']}) should match Country card ({data['countryCard']['left']})"
                if data['cat1']:
                    assert abs(data['cat1']['right'] - data['countryCard']['right']) <= 1.0, f"Category grid right ({data['cat1']['right']}) should match Country card ({data['countryCard']['right']})"

        print("  -> TEST 1 PASSED: Clean non-wrapping header top and two-item stats row across all viewports!")

        # -------------------------------------------------------------
        # TEST 2: Budgets Page Overall Budget Card Consistency
        # -------------------------------------------------------------
        print("\n--- TEST 2: Budgets Page Overall Budget Card ---")
        call("Emulation.setDeviceMetricsOverride", {
            "width": 390,
            "height": 844,
            "deviceScaleFactor": 1,
            "mobile": True
        })
        time.sleep(0.2)

        switch_budgets = """
        app.switchView('budgets-view');
        """
        call("Runtime.evaluate", {"expression": switch_budgets})
        time.sleep(0.4)

        inspect_budgets_eval = """
        (function() {
            const card = document.querySelector('#budgets-summary-banner .budget-central-card');
            if (!card) return { error: 'Budgets card not found' };

            const headerTop = card.querySelector('.budget-central-header-top');
            const stats = card.querySelector('.budget-central-stats-row');
            const badgesRow = card.querySelector('.budget-central-badges-row');

            return {
                cardWidth: card.clientWidth,
                cardHeight: card.clientHeight,
                headerTopHeight: headerTop ? headerTop.clientHeight : 0,
                statsHeight: stats ? stats.clientHeight : 0,
                hasBadges: Boolean(badgesRow)
            };
        })()
        """
        b_res = call("Runtime.evaluate", {"expression": inspect_budgets_eval, "returnByValue": True})
        b_data = b_res.get("result", {}).get("value", {})
        print("  Budgets view card:", b_data)
        assert b_data['headerTopHeight'] <= 42, "Header top wrapped on Budgets page"
        assert b_data['statsHeight'] <= 28, "Stats row wrapped on Budgets page"
        print("  -> TEST 2 PASSED: Budgets page overall card is clean and consistent!")

        # -------------------------------------------------------------
        # TEST 2B: Over-Budget State Verification
        # -------------------------------------------------------------
        print("\n--- TEST 2B: Over-Budget State Verification ---")
        over_budget_script = """
        (function() {
            storage.state.transactions = [
                { id: 'tx_over', type: 'expense', amount: 145000, region: 'JP', categoryId: 'jp-food', date: new Date().toISOString().slice(0, 10) }
            ];
            app.switchView('home-view');
            app.renderAll();

            const card = document.getElementById('budget-overview-card');
            const stats = card ? card.querySelector('.budget-central-stats-row') : null;
            const rightItem = stats ? stats.querySelector('.budget-stat-item-right') : null;
            const dangerStrong = rightItem ? rightItem.querySelector('strong.text-danger') : null;

            return {
                text: rightItem ? rightItem.innerText : '',
                hasDangerText: Boolean(dangerStrong),
                dangerAmount: dangerStrong ? dangerStrong.innerText : ''
            };
        })()
        """
        ob_res = call("Runtime.evaluate", {"expression": over_budget_script, "returnByValue": True})
        ob_data = ob_res.get("result", {}).get("value", {})
        print("  Over-budget right item text:", ob_data['text'])
        print("  Has text-danger class on amount:", ob_data['hasDangerText'])
        print("  Danger amount text:", ob_data['dangerAmount'])
        assert "Over limit:" in ob_data['text'], "Expected 'Over limit:' label"
        assert ob_data['hasDangerText'] == True, "Expected amount to have text-danger class"
        print("  -> TEST 2B PASSED: Over limit text formatted correctly with danger red amount alone!")

        # -------------------------------------------------------------
        # TEST 3: Screenshots Capture
        # -------------------------------------------------------------
        print("\n--- TEST 3: Capturing Screenshots ---")
        # Reset to normal budget state for clean visual captures
        call("Runtime.evaluate", {"expression": """
            storage.state.transactions = [
                { id: 'tx1', type: 'expense', amount: 32000, region: 'JP', categoryId: 'jp-food', date: new Date().toISOString().slice(0, 10) }
            ];
            app.switchView('budgets-view');
            app.renderAll();
        """})
        time.sleep(0.4)
        # 1. Budgets view screenshot
        ss_b = call("Page.captureScreenshot", {"format": "png"})
        out_b = os.path.join(os.path.dirname(__file__), 'budget_card_budgets_view_390.png')
        with open(out_b, 'wb') as f:
            f.write(base64.b64decode(ss_b['data']))
        print("  Saved budgets view screenshot:", out_b, "bytes:", len(ss_b['data']))
        print("  Active view during budgets screenshot:", call("Runtime.evaluate", {"expression": "document.querySelector('.view.active').id", "returnByValue": True})['result']['value'])

        # 2. Dashboard view screenshot
        call("Runtime.evaluate", {"expression": """
            app.switchView('home-view');
            app.renderAll();
        """})
        time.sleep(0.4)
        ss_d = call("Page.captureScreenshot", {"format": "png"})
        out_d = os.path.join(os.path.dirname(__file__), 'budget_card_dashboard_view_390.png')
        with open(out_d, 'wb') as f:
            f.write(base64.b64decode(ss_d['data']))
        print("  Saved dashboard view screenshot:", out_d, "bytes:", len(ss_d['data']))
        print("  Active view during dashboard screenshot:", call("Runtime.evaluate", {"expression": "document.querySelector('.view.active').id", "returnByValue": True})['result']['value'])
        print("  Are screenshot base64 payloads identical?", ss_b['data'] == ss_d['data'])

        # Copy to artifact directory
        art_dir = "/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128"
        with open(os.path.join(art_dir, 'budget_card_dashboard_view_390.png'), 'wb') as f:
            f.write(base64.b64decode(ss_d['data']))
        with open(os.path.join(art_dir, 'budget_card_budgets_view_390.png'), 'wb') as f:
            f.write(base64.b64decode(ss_b['data']))

        print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")

    finally:
        try:
            ws.close()
        except:
            pass
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    run_tests()

