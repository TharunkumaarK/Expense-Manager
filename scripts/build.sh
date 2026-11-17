#!/usr/bin/env bash
set -euo pipefail

echo "==============================================="
echo " Expense Manager — Netlify Automated Build"
echo "==============================================="

BUILD_CONTEXT="${CONTEXT:-unknown}"
BUILD_BRANCH="${BRANCH:-unknown}"

echo "Detected Netlify Context : ${BUILD_CONTEXT}"
echo "Detected Git Branch      : ${BUILD_BRANCH}"

# 1. Automated Environment Selection
if [ "${BUILD_CONTEXT}" = "production" ] || [ "${BUILD_BRANCH}" = "main" ]; then
    echo "==> Target Environment: PRODUCTION (xrovzkibilgbpawnunle)"
    if [ ! -f "js/supabase-config.prod.js" ]; then
        echo "ERROR: Missing js/supabase-config.prod.js! Failing closed." >&2
        exit 1
    fi
    cp js/supabase-config.prod.js js/supabase-config.js
    echo "Activated js/supabase-config.prod.js -> js/supabase-config.js"

elif [ "${BUILD_CONTEXT}" = "deploy-preview" ] || [ "${BUILD_CONTEXT}" = "branch-deploy" ] || [ "${BUILD_BRANCH}" = "test" ] || [ "${BUILD_BRANCH}" = "development" ]; then
    echo "==> Target Environment: DEVELOPMENT (nyetklojxqnawdtrrhma)"
    if [ ! -f "js/supabase-config.dev.js" ]; then
        echo "ERROR: Missing js/supabase-config.dev.js! Failing closed." >&2
        exit 1
    fi
    cp js/supabase-config.dev.js js/supabase-config.js
    echo "Activated js/supabase-config.dev.js -> js/supabase-config.js"

else
    echo "ERROR: Unknown build context '${BUILD_CONTEXT}' and branch '${BUILD_BRANCH}'! Failing closed." >&2
    exit 1
fi

# 2. Security Invariant & Credential Leakage Pre-flight Check
echo "==> Running security pre-flight assertion on active configuration..."
node -e "
const fs = require('fs');
const content = fs.readFileSync('js/supabase-config.js', 'utf8');

// Never allow service-role or secret keys in client bundles
if (content.includes('service_role') || content.includes('secretKey') || content.includes('serviceRoleKey')) {
    console.error('FATAL: Privileged or secret credentials detected in active frontend configuration!');
    process.exit(1);
}

// Ensure publishable key exists and starts with standard public prefix
if (!content.includes('sb_publishable_')) {
    console.error('FATAL: Missing valid public anon key prefix (sb_publishable_) in active configuration!');
    process.exit(1);
}

console.log('Security pre-flight assertion PASSED: Configuration is secure.');
"

echo "==> Build successfully completed."

