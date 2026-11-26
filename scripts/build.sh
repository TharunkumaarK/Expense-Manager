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
if [ "${BUILD_CONTEXT}" = "production" ] && [ "${BUILD_BRANCH}" = "main" ]; then
    echo "==> Target Environment: PRODUCTION (xrovzkibilgbpawnunle)"
    selected_config="js/supabase-config.prod.js"
elif { [ "${BUILD_CONTEXT}" = "deploy-preview" ] || [ "${BUILD_CONTEXT}" = "branch-deploy" ]; } &&
    [ "${BUILD_BRANCH}" != "main" ] && [ "${BUILD_BRANCH}" != "unknown" ]; then
    echo "==> Target Environment: DEVELOPMENT (nyetklojxqnawdtrrhma)"
    selected_config="js/supabase-config.dev.js"
else
    echo "ERROR: Unsupported build context '${BUILD_CONTEXT}' and branch '${BUILD_BRANCH}' combination. Failing closed." >&2
    exit 1
fi

if [ ! -f "$selected_config" ]; then
    echo "ERROR: Missing $selected_config. Failing closed." >&2
    exit 1
fi

# 2. Validate the selected configuration before activating it.
echo "==> Running security pre-flight assertion on selected configuration..."
node -e "
const fs = require('fs');
const content = fs.readFileSync(process.argv[1], 'utf8');

// Never allow service-role or secret keys in client bundles
if (content.includes('service_role') || content.includes('secretKey') || content.includes('serviceRoleKey') || content.includes('sb_secret_')) {
    console.error('FATAL: Privileged or secret credentials detected in active frontend configuration!');
    process.exit(1);
}

// Ensure publishable key exists and starts with standard public prefix
if (!content.includes('sb_publishable_')) {
    console.error('FATAL: Missing valid public anon key prefix (sb_publishable_) in active configuration!');
    process.exit(1);
}

console.log('Security pre-flight assertion PASSED: Configuration is secure.');
" "$selected_config"

# Activate with an atomic rename in the same directory.
pending_config=$(mktemp js/.supabase-config.XXXXXXXX)
trap 'rm -f -- "$pending_config"' EXIT
cp "$selected_config" "$pending_config"
chmod 644 "$pending_config"
mv -f -- "$pending_config" js/supabase-config.js
echo "Activated $selected_config -> js/supabase-config.js"
echo "==> Build successfully completed."

