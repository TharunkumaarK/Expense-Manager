import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        print("Navigating to http://localhost:8090...")
        await page.goto("http://localhost:8090", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Navigate to Transactions ledger
        print("Navigating to transactions view...")
        await page.evaluate("() => app.showPage('transactions')")
        await page.wait_for_timeout(1000)

        # Check console errors
        print(f"Console errors so far: {len(console_errors)}")
        for err in console_errors:
            print(f"  [ERROR] {err}")

        # Capture Desktop 1440 ledger view
        await page.screenshot(path="scratch/pass2_transactions_1440.png", full_page=False)
        print("Saved scratch/pass2_transactions_1440.png")

        # Test Filter Popover Toggle
        print("Testing filter popover toggle...")
        await page.click("#ledger-filter-btn")
        await page.wait_for_timeout(500)
        await page.screenshot(path="scratch/pass2_filter_popover_1440.png", full_page=False)
        print("Saved scratch/pass2_filter_popover_1440.png")

        # Close filter popover
        await page.click("#ledger-filter-btn")
        await page.wait_for_timeout(300)

        # Test Transaction Detail Modal
        print("Testing transaction row click to open detail modal...")
        first_row = page.locator(".ledger-tx-row").first
        if await first_row.count() > 0:
            await first_row.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path="scratch/pass2_detail_modal_1440.png", full_page=False)
            print("Saved scratch/pass2_detail_modal_1440.png")

            # Read values from modal
            wallet_val = await page.inner_text("#tx-detail-wallet-val")
            category_val = await page.inner_text("#tx-detail-category-val")
            amount_val = await page.inner_text("#tx-detail-amount-val")
            print(f"Modal values: Wallet='{wallet_val}', Category='{category_val}', Amount='{amount_val}'")

            # Close modal
            await page.evaluate("() => app.closeTransactionDetail()")
            await page.wait_for_timeout(300)
        else:
            print("No transaction rows found to click!")

        # Multi-resolution screenshots:
        # 1. Desktop 1280x800
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.wait_for_timeout(500)
        await page.screenshot(path="scratch/pass2_transactions_1280.png")
        print("Saved scratch/pass2_transactions_1280.png")

        # 2. Desktop 1920x1080
        await page.set_viewport_size({"width": 1920, "height": 1080})
        await page.wait_for_timeout(500)
        await page.screenshot(path="scratch/pass2_transactions_1920.png")
        print("Saved scratch/pass2_transactions_1920.png")

        # 3. Mobile 390x844
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(500)
        await page.screenshot(path="scratch/pass2_transactions_390.png")
        print("Saved scratch/pass2_transactions_390.png")

        # Mobile Modal
        if await first_row.count() > 0:
            await first_row.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path="scratch/pass2_detail_modal_390.png")
            print("Saved scratch/pass2_detail_modal_390.png")
            await page.evaluate("() => app.closeTransactionDetail()")

        await browser.close()
        print("Verification completed successfully!")

if __name__ == "__main__":
    asyncio.run(run())
