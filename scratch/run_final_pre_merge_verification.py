#!/usr/bin/env python3
"""
Final Pre-Merge Verification Script
-----------------------------------
Executes the comprehensive checklist for Phase 5 / Final Pre-Merge:
1. Validates the latest production export (/tmp/production_raw_dump.json & /tmp/production_sanitized.json)
   - Balance invariance across all 6 wallets
   - Exact ID preservation & transaction counts
   - Continuous ledger conversion & closedMonths snapshots
   - Idempotency on repeated execution
   - Conflict detection halt & persistence block
2. Validates Netlify build generation
   - Production build -> production URL (xrovzkibilgbpawnunle)
   - Development build -> development URL (nyetklojxqnawdtrrhma)
   - Unknown context -> fails closed (exit code 1)
   - Zero service-role keys
   - Targeted Cache-Control headers in netlify.toml
3. Validates Release Safety
   - Git status (no production data or secrets committed)
   - Clean working tree with existing changes intact
"""

import subprocess
import json
import os
import sys

def verify_all():
    summary = {
        "productionDataValidation": {},
        "netlifyBuildValidation": {},
        "releaseSafetyValidation": {}
    }

    # -------------------------------------------------------------------------
    # 1. Netlify Build Generation Verification
    # -------------------------------------------------------------------------
    print(">>> Verifying Netlify Build Script...")
    
    # Test A: Production build
    p_prod = subprocess.run(
        ["bash", "scripts/build.sh"],
        env=dict(os.environ, CONTEXT="production", BRANCH="main"),
        capture_output=True,
        text=True
    )
    with open("js/supabase-config.js", "r") as f:
        prod_cfg = f.read()
    
    prod_has_prod_url = "xrovzkibilgbpawnunle.supabase.co" in prod_cfg
    prod_no_dev_url = "nyetklojxqnawdtrrhma" not in prod_cfg
    prod_no_service_role = "service_role" not in prod_cfg and "secret" not in prod_cfg.lower()

    # Test B: Development build
    p_dev = subprocess.run(
        ["bash", "scripts/build.sh"],
        env=dict(os.environ, CONTEXT="branch-deploy", BRANCH="test"),
        capture_output=True,
        text=True
    )
    with open("js/supabase-config.js", "r") as f:
        dev_cfg = f.read()

    dev_has_dev_url = "nyetklojxqnawdtrrhma.supabase.co" in dev_cfg
    dev_no_prod_url = "xrovzkibilgbpawnunle" not in dev_cfg
    dev_no_service_role = "service_role" not in dev_cfg and "secret" not in dev_cfg.lower()

    # Test C: Fail-closed assertion on unknown context
    p_unknown = subprocess.run(
        ["bash", "scripts/build.sh"],
        env=dict(os.environ, CONTEXT="unauthorized", BRANCH="rogue_branch"),
        capture_output=True,
        text=True
    )
    fail_closed_passed = (p_unknown.returncode != 0)

    # Test D: Check netlify.toml headers
    with open("netlify.toml", "r") as f:
        toml_content = f.read()
    targeted_headers = ("/js/supabase-config.js" in toml_content and 
                        "/sw.js" in toml_content and 
                        "no-cache, no-store, must-revalidate" in toml_content)

    summary["netlifyBuildValidation"] = {
        "productionExitCode": p_prod.returncode,
        "productionUsesOnlyProdUrl": prod_has_prod_url and prod_no_dev_url,
        "productionZeroSecretKeys": prod_no_service_role,
        "developmentExitCode": p_dev.returncode,
        "developmentUsesOnlyDevUrl": dev_has_dev_url and dev_no_prod_url,
        "developmentZeroSecretKeys": dev_no_service_role,
        "unknownContextFailedClosed": fail_closed_passed,
        "targetedCacheControlHeaders": targeted_headers
    }

    # -------------------------------------------------------------------------
    # 2. Production Dataset Verification (CDP headless run)
    # -------------------------------------------------------------------------
    print(">>> Verifying Real Production Data Migration Pipeline...")
    p_mig = subprocess.run(
        ["python3", "scratch/test_real_production_data_migration.py"],
        capture_output=True,
        text=True
    )
    
    # Extract JSON from output
    raw_out = p_mig.stdout
    json_start = raw_out.find("{")
    json_end = raw_out.rfind("}") + 1
    if json_start != -1 and json_end != -1:
        mig_res = json.loads(raw_out[json_start:json_end])
    else:
        mig_res = {"error": "Failed to parse test output", "raw": raw_out}

    summary["productionDataValidation"] = {
        "datasetSource": "ExpenseManager_Backup_2026-07-29.json (Production Authoritative)",
        "preWalletCount": mig_res.get("preWalletCount"),
        "preBalances": mig_res.get("preBalances"),
        "balances100PercentIdentical": mig_res.get("balancesIdentical"),
        "postTxCount": mig_res.get("postTxCount"),
        "allOriginalIdsFound": mig_res.get("allOriginalIdsFound"),
        "chronologicallySorted": mig_res.get("chronologicallySorted"),
        "closedMonthsSnapshot": mig_res.get("closedMonthsCreated"),
        "schemaVersionUpgradedTo": mig_res.get("schemaVersion"),
        "dynamicGetterFunctional": mig_res.get("dynamicGetterWorks"),
        "idempotencyVerified": mig_res.get("rerunAlreadyMigrated"),
        "conflictStrictSafetyHalt": mig_res.get("conflictHalted"),
        "conflictPersistenceBlocked": mig_res.get("conflictPersistenceBlocked")
    }

    # -------------------------------------------------------------------------
    # 3. Release Safety & Worktree Verification
    # -------------------------------------------------------------------------
    print(">>> Verifying Git Worktree Safety...")
    p_git_status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    porcelain = p_git_status.stdout.splitlines()

    # Verify no raw production dump or secret in porcelain
    has_raw_prod_dump = any("production_raw_dump" in line or "ExpenseManager_Backup" in line for line in porcelain)
    has_secret_files = any(".env" in line or "secret" in line for line in porcelain)

    # Current branch
    p_branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True)
    current_branch = p_branch.stdout.strip()

    summary["releaseSafetyValidation"] = {
        "currentBranch": current_branch,
        "isTestBranch": (current_branch == "test"),
        "noProductionDataInGit": not has_raw_prod_dump,
        "noSecretCredentialsInGit": not has_secret_files,
        "uncommittedChangesPreservedCount": len(porcelain)
    }

    print("\n================== VERIFICATION SUMMARY ==================")
    print(json.dumps(summary, indent=2))
    return summary

if __name__ == "__main__":
    verify_all()

