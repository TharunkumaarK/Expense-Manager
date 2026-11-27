import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'expense-build-test-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const path of ['css', 'icons', 'index.html', 'js', 'manifest.json', 'scripts', 'sw.js', 'typefaces']) {
        cpSync(join(root, path), join(dir, path), { recursive: true });
    }
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return dir;
}

function build(dir, context, branch) {
    const env = { ...process.env, CONTEXT: context };
    if (branch !== undefined) env.BRANCH = branch;
    else delete env.BRANCH;
    return spawnSync('bash', ['scripts/build.sh'], { cwd: dir, env, encoding: 'utf8' });
}

function output(dir) {
    const dist = join(dir, 'dist');
    return Object.fromEntries(readdirSync(dist, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => {
            const path = join(entry.parentPath, entry.name);
            return [path.slice(dist.length + 1), readFileSync(path, entry.name.endsWith('.woff2') ? null : 'utf8')];
        }).sort(([a], [b]) => a.localeCompare(b)));
}

const projects = {
    development: 'nyetklojxqnawdtrrhma',
    production: 'xrovzkibilgbpawnunle'
};

function verifyOutput(files, environment) {
    assert.deepEqual(Object.keys(files).filter(path => !path.startsWith('assets/')),
        ['_headers', 'icons/icon.svg', 'index.html', 'manifest.json', 'sw.js']);
    const assets = Object.keys(files).filter(path => path.startsWith('assets/'));
    const expectedAssets = [
        'app.js', 'chart.js.js', 'lucide.js', 'style.css', 'supabase-js.js', 'third-party-licenses.txt',
        'geist-variable.woff2', 'playfair-display-variable.woff2'
    ];
    assert.deepEqual(assets.map(path => path.replace(/^assets\//, '').replace(/-[a-f0-9]{20}\./, '.')).sort(),
        expectedAssets.sort());
    assert.ok(assets.filter(path => !path.endsWith('.txt')).every(path => files['index.html'].includes(path)));
    const stylesheet = files[assets.find(path => path.endsWith('.css'))];
    const licenses = files[assets.find(path => path.endsWith('.txt'))];
    for (const [name, notice] of [['geist-variable', 'Geist-OFL.txt'], ['playfair-display-variable', 'Playfair-OFL.txt']]) {
        const source = readFileSync(join(root, 'typefaces', `${name}.woff2`));
        const hash = createHash('sha256').update(source).digest('hex').slice(0, 20);
        const filename = `${name}-${hash}.woff2`;
        assert.deepEqual(files[`assets/${filename}`], source);
        assert.ok(stylesheet.includes(`url(${filename})`));
        assert.ok(files['sw.js'].includes(`"assets/${filename}"`));
        assert.ok(licenses.includes(readFileSync(join(root, 'typefaces', notice), 'utf8').trim()));
    }
    assert.doesNotMatch(files['index.html'], /<script>|https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)/);
    assert.ok(Object.values(files).every(contents => !/sourceMappingURL=|sb_secret_[\w-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(contents)));
    const ref = projects[environment];
    const otherRef = projects[environment === 'development' ? 'production' : 'development'];
    const bundle = files[assets.find(path => path.startsWith('assets/app-'))];
    assert.ok(bundle.includes(ref));
    const otherName = environment === 'development' ? 'prod' : 'dev';
    const sandbox = { window: {} };
    runInNewContext(readFileSync(join(root, `js/supabase-config.${otherName}.js`), 'utf8'), sandbox);
    assert.ok(!bundle.includes(sandbox.window.SUPABASE_CONFIG.publishableKey), 'alternate public key is absent');
    assert.match(files._headers, /script-src 'self'; script-src-attr 'unsafe-inline'/);
    assert.match(files._headers, /frame-ancestors 'none'/);
    assert.match(files._headers, /font-src 'self'/);
    assert.match(files._headers, new RegExp(`connect-src 'self' https://${ref}\\.supabase\\.co wss://${ref}\\.supabase\\.co`));
    assert.ok(!files._headers.includes(otherRef));
}

for (const [context, branch, expected] of [
    ['production', 'main', 'production'],
    ['branch-deploy', 'test', 'development'],
    ['deploy-preview', 'feature/acceptance', 'development'],
    ['branch-deploy', 'development', 'development'],
    ['production', 'test', null],
    ['branch-deploy', 'main', null],
    ['deploy-preview', 'main', null],
    ['unknown', 'test', null],
    ['production', undefined, null],
    ['production', 'unknown', null],
    ['branch-deploy', '', null]
]) {
    test(`build context ${context} / ${branch}`, t => {
        const dir = fixture(t);
        const configFile = join(dir, 'js/supabase-config.js');
        const original = readFileSync(configFile, 'utf8');
        const result = build(dir, context, branch);
        if (expected) {
            assert.equal(result.status, 0, result.stderr);
            verifyOutput(output(dir), expected);
        } else {
            assert.notEqual(result.status, 0);
            assert.throws(() => output(dir), { code: 'ENOENT' });
        }
        assert.equal(readFileSync(configFile, 'utf8'), original);
    });
}

for (const variant of ['missing', 'invalid public key', 'privileged marker']) {
    test(`fails closed for ${variant}`, t => {
        const dir = fixture(t);
        assert.equal(build(dir, 'branch-deploy', 'test').status, 0);
        const original = output(dir);
        const config = join(dir, 'js/supabase-config.dev.js');
        if (variant === 'missing') rmSync(config);
        else if (variant === 'invalid public key') writeFileSync(config, readFileSync(config, 'utf8').replace('sb_publishable_', 'invalid_'));
        else writeFileSync(config, readFileSync(config, 'utf8') + '\n// synthetic sb_secret_test_marker');
        assert.notEqual(build(dir, 'branch-deploy', 'test').status, 0);
        assert.deepEqual(output(dir), original);
    });
}

test('production build is reproducible and excludes developer files', t => {
    const dir = fixture(t);
    mkdirSync(join(dir, 'scratch'));
    writeFileSync(join(dir, 'scratch', 'internal.sql'), 'fixture');
    writeFileSync(join(dir, '.env'), 'synthetic=fixture');
    assert.equal(build(dir, 'production', 'main').status, 0);
    const first = output(dir);
    assert.equal(build(dir, 'production', 'main').status, 0);
    assert.deepEqual(output(dir), first);
    assert.equal(build(dir, 'branch-deploy', 'test').status, 0);
    assert.notEqual(Object.keys(output(dir)).find(path => path.startsWith('assets/app-')),
        Object.keys(first).find(path => path.startsWith('assets/app-')));
});

test('worker precaches only anonymous static assets and cleans only owned caches', async t => {
    const dir = fixture(t);
    const buildResult = build(dir, 'branch-deploy', 'test');
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const files = output(dir);
    const listeners = {};
    const seenRequests = [];
    const removed = [];
    const scope = 'https://example.invalid/';
    const names = ['em-v123', 'another-app', `expense-manager:static:${scope}:old`];
    const state = { claimed: false, skipped: false };
    const assetsCache = {
        addAll: async requests => seenRequests.push(...requests),
        match: async url => seenRequests.find(request => request.url === url) || null
    };
    runInNewContext(files['sw.js'], {
        URL, Request,
        self: {
            registration: { scope },
            addEventListener: (name, callback) => { listeners[name] = callback; },
            skipWaiting: async () => { state.skipped = true; },
            clients: { claim: async () => { state.claimed = true; } }
        },
        caches: { open: async () => assetsCache, keys: async () => names, delete: async name => removed.push(name) },
        fetch: async () => assert.fail('a network-only request was intercepted')
    });
    const lifecycle = name => new Promise(resolve => listeners[name]({ waitUntil: resolve }));
    await lifecycle('install');
    await lifecycle('activate');
    assert.deepEqual(state, { claimed: true, skipped: true });
    assert.equal(seenRequests.length, 7);
    assert.ok(seenRequests.every(request => request.credentials === 'omit' && request.redirect === 'error'));
    assert.ok(seenRequests.every(request => /^\/assets\/.+\.(js|css|woff2)$/.test(new URL(request.url).pathname)));
    assert.deepEqual(removed, ['em-v123', `expense-manager:static:${scope}:old`]);
    let intercepted;
    const request = (url, method = 'GET', mode = 'cors') => {
        intercepted = undefined;
        listeners.fetch({ request: { url, method, mode }, respondWith: promise => { intercepted = promise; } });
        return intercepted;
    };
    assert.ok(await request(seenRequests[0].url));
    assert.equal(request(seenRequests[0].url, 'POST'), undefined);
    assert.equal(request(seenRequests[0].url, 'GET', 'navigate'), undefined);
    assert.equal(request(seenRequests[0].url + '?access_token=synthetic'), undefined);
    assert.equal(request(scope + '?type=recovery', 'GET', 'navigate'), undefined);
    assert.equal(request('https://development.invalid/rest/v1/app_state'), undefined);
    assert.equal(request('https://development.invalid/auth/v1/token'), undefined);
});
