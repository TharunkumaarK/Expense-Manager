#!/usr/bin/env python3
"""
Production Data Anonymizer & Sanitization Utility for Expense Manager
---------------------------------------------------------------------
Converts raw production JSON exports into sanitized test fixtures:
- Strips PII (user emails, personal profile names, avatars).
- Obfuscates transaction descriptions & notes using deterministic salted hashes.
- Preserves exact schema hierarchies, types, nullability, IDs, currencies, dates, and balance invariants.
- Preserves utility keywords in notes for reverse-migration compatibility.
- Validates pre- and post-anonymization financial invariants (sums, counts).
- Keeps the raw input separate from the sanitized output.

Usage:
    python3 scratch/anonymize_production_data.py <input_prod_dump.json> <output_sanitized.json>
"""

import sys
import json
import hashlib
import re

UTILITY_KEYWORDS = ['Electricity', 'Gas', 'Water', 'Internet']

def anonymize_text(text, salt="em_salt_v4", preserve_keywords=True):
    if not text:
        return text
    text_str = str(text).strip()
    if not text_str:
        return text

    prefix = ""
    if preserve_keywords:
        for kw in UTILITY_KEYWORDS:
            if kw.lower() in text_str.lower():
                prefix = f"{kw} - "
                break

    h = hashlib.sha256((text_str + salt).encode('utf-8')).hexdigest()[:8]
    return f"{prefix}Anon-{h}"

def sanitize_state_document(raw_state):
    state = json.loads(json.dumps(raw_state))

    # 1. Anonymize user profile & sensitive account metadata
    if "userProfile" in state and isinstance(state["userProfile"], dict):
        state["userProfile"]["displayName"] = "Production User"
        state["userProfile"]["name"] = "Production User"
        state["userProfile"]["email"] = "anonymized_user@example.com"
        state["userProfile"]["avatar"] = None

    # 2. Anonymize active transactions
    if "transactions" in state and isinstance(state["transactions"], list):
        for tx in state["transactions"]:
            if isinstance(tx, dict):
                is_util = tx.get("categoryId") == "jp-utilities"
                if "note" in tx and tx["note"]:
                    tx["note"] = anonymize_text(tx["note"], preserve_keywords=is_util)
                if "description" in tx and tx["description"]:
                    tx["description"] = anonymize_text(tx["description"], preserve_keywords=is_util)

    # 3. Anonymize historical transactions in partitioned ledgers (Schema v2)
    if "history" in state and isinstance(state["history"], list):
        for h in state["history"]:
            if isinstance(h, dict) and "transactions" in h and isinstance(h["transactions"], list):
                for tx in h["transactions"]:
                    if isinstance(tx, dict):
                        is_util = tx.get("categoryId") == "jp-utilities"
                        if "note" in tx and tx["note"]:
                            tx["note"] = anonymize_text(tx["note"], preserve_keywords=is_util)
                        if "description" in tx and tx["description"]:
                            tx["description"] = anonymize_text(tx["description"], preserve_keywords=is_util)

    # 4. Anonymize closedMonths snapshots if present
    if "closedMonths" in state and isinstance(state["closedMonths"], dict):
        for month_key, snapshot in state["closedMonths"].items():
            if isinstance(snapshot, dict) and "transactions" in snapshot and isinstance(snapshot["transactions"], list):
                for tx in snapshot["transactions"]:
                    if isinstance(tx, dict):
                        is_util = tx.get("categoryId") == "jp-utilities"
                        if "note" in tx and tx["note"]:
                            tx["note"] = anonymize_text(tx["note"], preserve_keywords=is_util)
                        if "description" in tx and tx["description"]:
                            tx["description"] = anonymize_text(tx["description"], preserve_keywords=is_util)

    return state

def compute_financial_invariants(data):
    """Computes totals and counts to verify zero data mutation during anonymization."""
    # Extract state document whether root or wrapped
    state = data
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) and "state" in data[0]:
        state = data[0]["state"]
    elif isinstance(data, dict) and "state" in data and isinstance(data["state"], dict):
        state = data["state"]

    invariants = {
        "walletBalances": {},
        "walletCount": 0,
        "activeTxCount": 0,
        "activeTxSum": 0.0,
        "historyTxCount": 0,
        "historyTxSum": 0.0,
        "historySnapshotCount": 0,
        "schemaVersion": state.get("schemaVersion", 1) if isinstance(state, dict) else None
    }

    if not isinstance(state, dict):
        return invariants

    # Wallets
    wallets = state.get("wallets", {})
    if isinstance(wallets, dict):
        invariants["walletCount"] = len(wallets)
        for w_id, w in wallets.items():
            if isinstance(w, dict):
                invariants["walletBalances"][w_id] = float(w.get("balance", 0) or 0)

    # Active transactions
    txs = state.get("transactions", [])
    if isinstance(txs, list):
        invariants["activeTxCount"] = len(txs)
        invariants["activeTxSum"] = sum(float(t.get("amount", 0) or 0) for t in txs if isinstance(t, dict))

    # History transactions
    history = state.get("history", [])
    if isinstance(history, list):
        invariants["historySnapshotCount"] = len(history)
        for h in history:
            if isinstance(h, dict) and isinstance(h.get("transactions"), list):
                invariants["historyTxCount"] += len(h["transactions"])
                invariants["historyTxSum"] += sum(float(t.get("amount", 0) or 0) for t in h["transactions"] if isinstance(t, dict))

    return invariants

def anonymize_payload(raw_data):
    # Handle DB row array, single DB row, or direct state JSON
    if isinstance(raw_data, list):
        sanitized = []
        for row in raw_data:
            if isinstance(row, dict) and "state" in row:
                sanitized_row = {
                    "user_id": hashlib.sha256(str(row.get("user_id", "")).encode('utf-8')).hexdigest()[:16],
                    "state": sanitize_state_document(row["state"]),
                    "updated_at": row.get("updated_at")
                }
                sanitized.append(sanitized_row)
            else:
                sanitized.append(sanitize_state_document(row))
        return sanitized
    elif isinstance(raw_data, dict) and "state" in raw_data and isinstance(raw_data["state"], dict):
        return {
            "user_id": hashlib.sha256(str(raw_data.get("user_id", "")).encode('utf-8')).hexdigest()[:16],
            "state": sanitize_state_document(raw_data["state"]),
            "updated_at": raw_data.get("updated_at")
        }
    else:
        return sanitize_state_document(raw_data)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scratch/anonymize_production_data.py <input_prod_dump.json> <output_sanitized.json>")
        return

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(input_file, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    # 1. Compute pre-anonymization invariants
    pre_inv = compute_financial_invariants(raw_data)

    # 2. Anonymize
    sanitized_data = anonymize_payload(raw_data)

    # 3. Compute post-anonymization invariants
    post_inv = compute_financial_invariants(sanitized_data)

    # 4. Verify invariants match exactly
    assert pre_inv["walletCount"] == post_inv["walletCount"], "Wallet count mismatch!"
    assert pre_inv["activeTxCount"] == post_inv["activeTxCount"], "Active transaction count mismatch!"
    assert abs(pre_inv["activeTxSum"] - post_inv["activeTxSum"]) < 1e-4, "Active transaction sum mismatch!"
    assert pre_inv["historyTxCount"] == post_inv["historyTxCount"], "History transaction count mismatch!"
    assert abs(pre_inv["historyTxSum"] - post_inv["historyTxSum"]) < 1e-4, "History transaction sum mismatch!"
    assert pre_inv["walletBalances"] == post_inv["walletBalances"], "Wallet balances altered!"

    # 5. Write sanitized file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(sanitized_data, f, indent=2)

    print(f"[Anonymizer] SUCCESS: Sanitized {input_file} -> {output_file}")
    print("[Anonymizer] Invariants Verified:")
    print(f"  - Wallets: {post_inv['walletCount']} (Balances 100% Identical)")
    print(f"  - Active Transactions: {post_inv['activeTxCount']} (Sum: {post_inv['activeTxSum']})")
    print(f"  - Historical Transactions: {post_inv['historyTxCount']} (Sum: {post_inv['historyTxSum']})")
    print(f"  - Schema Version: {post_inv['schemaVersion']}")

if __name__ == "__main__":
    main()
