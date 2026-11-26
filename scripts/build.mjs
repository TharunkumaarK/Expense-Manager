import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';

const context = process.env.CONTEXT;
const branch = process.env.BRANCH;
const isProduction = context === 'production' && branch === 'main';
const isDevelopment = ['branch-deploy', 'deploy-preview'].includes(context) &&
    branch && !['main', 'unknown'].includes(branch);

const scripts = [
    'supabase-config', 'supabaseClient', 'country-config', 'storage',
    'charts', 'wallet', 'onboarding', 'app', 'startup'
];
const libraries = [
    ['lucide', 'dist/umd/lucide.min.js', 'https://unpkg.com/lucide@1.80.0/dist/umd/lucide.min.js'],
    ['@supabase/supabase-js', 'dist/umd/supabase.js', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js'],
    ['chart.js', 'dist/chart.umd.min.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.6.2/dist/chart.umd.min.js']
];
const sha = (value) => createHash('sha256').update(value).digest('hex').slice(0, 20);

async function loadConfig() {
    const text = await readFile(`js/supabase-config.${isProduction ? 'prod' : 'dev'}.js`, 'utf8');
    if (/sb_secret_|service_role|secretKey|serviceRoleKey/i.test(text)) {
        throw new Error('A privileged credential marker was found in the frontend configuration.');
    }
    const sandbox = { window: {} };
    runInNewContext(text, sandbox, { timeout: 500, contextCodeGeneration: { strings: false, wasm: false } });
    const config = sandbox.window.SUPABASE_CONFIG;
    const projectRef = isProduction ? 'xrovzkibilgbpawnunle' : 'nyetklojxqnawdtrrhma';
    const expected = {
        environment: isProduction ? 'production' : 'development',
        projectRef,
        url: `https://${projectRef}.supabase.co`,
        storageKey: isProduction ? 'em_connected_v2' : 'em_connected_v2_dev'
    };
    if (!config || Object.keys(config).length !== 5 ||
        !Object.entries(expected).every(([key, value]) => config[key] === value) ||
        typeof config.publishableKey !== 'string' ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) {
        throw new Error('The frontend configuration does not match the selected context.');
    }
    return { ...expected, publishableKey: config.publishableKey };
}

async function licenseNotice() {
    const packageNames = [
        'lucide', 'chart.js', '@kurkle/color', '@supabase/supabase-js', '@supabase/auth-js',
        '@supabase/functions-js', '@supabase/postgrest-js', '@supabase/realtime-js',
        '@supabase/storage-js', '@supabase/phoenix', 'iceberg-js', 'tslib'
    ];
    const notices = [];
    for (const name of packageNames) {
        for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
            try {
                const license = await readFile(join('node_modules', name, filename), 'utf8');
                notices.push(`${name}\n${license.trim()}`);
                break;
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }
    return notices.join('\n\n') + '\n';
}

function headersFor(config) {
    const websocketUrl = config.url.replace(/^https:/, 'wss:');
    const csp = [
        "default-src 'none'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "script-src-attr 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        `connect-src 'self' ${config.url} ${websocketUrl}`
    ].join('; ');

    return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/manifest.json
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

async function build() {
    if (!isProduction && !isDevelopment) {
        throw new Error('Unsupported Netlify context and branch combination. Build aborted.');
    }
    const config = await loadConfig();
    const stage = await mkdtemp('.dist-');
    try {
        await mkdir(join(stage, 'assets'));
        await mkdir(join(stage, 'icons'));
        const immutable = [];

        async function asset(name, extension, contents, precache = true) {
            const path = `assets/${name}-${sha(contents)}.${extension}`;
            await writeFile(join(stage, path), contents);
            if (precache) immutable.push(path);
            return path;
        }

        let html = await readFile('index.html', 'utf8');
        for (const [name, file, sourceUrl] of libraries) {
            const source = await readFile(join('node_modules', name, file), 'utf8');
            const vendor = source.replace(/^\/\/[#@] sourceMappingURL=.*$/gm, '');
            const output = await asset(name.split('/').at(-1), 'js', vendor);
            if (!html.includes(sourceUrl)) throw new Error(`Missing HTML entry for ${name}.`);
            html = html.replace(sourceUrl, output);
        }

        const local = [
            `window.SUPABASE_CONFIG = Object.freeze(${JSON.stringify(config)});`,
            ...await Promise.all(scripts.slice(1).map(name => readFile(`js/${name}.js`, 'utf8')))
        ];
        const js = await transform(`(() => {\n${local.join('\n;\n')}\n})();`, {
            loader: 'js',
            target: 'es2022',
            minify: true,
            charset: 'utf8',
            legalComments: 'inline',
            define: { EXPENSE_DEPLOYMENT: 'true' },
            pure: isProduction ? ['console.log', 'console.debug', 'console.info'] : []
        });
        const bundle = await asset('app', 'js', js.code);
        for (const [index, name] of scripts.entries()) {
            const tag = new RegExp(`<script src="js/${name}\\.js(?:\\?[^"]*)?"></script>`);
            if (!tag.test(html)) throw new Error(`Missing HTML entry for ${name}.`);
            html = html.replace(tag, index === 0 ? `<script src="${bundle}"></script>` : '');
        }

        const sourceCss = await readFile('css/style.css', 'utf8');
        // Only local font faces are deployable from this checkout. Keep the source fallbacks for local development.
        const deployCss = sourceCss.replace(/,\s*url\('\.\.\/fonts\/[^']+'\) format\('[a-z]+'\)/g, '');
        const css = await transform(deployCss, {
            loader: 'css', target: 'esnext', minify: true, charset: 'utf8'
        });
        const stylesheet = await asset('style', 'css', css.code);
        const cssHref = /href="css\/style\.css(?:\?[^"]*)?"/;
        if (!cssHref.test(html)) throw new Error('Missing HTML entry for the stylesheet.');
        html = html.replace(cssHref, `href="${stylesheet}"`);

        const worker = await readFile('sw.js', 'utf8');
        const version = sha(JSON.stringify([immutable, worker]));
        await Promise.all([
            writeFile(join(stage, 'index.html'), html),
            writeFile(join(stage, '_headers'), headersFor(config)),
            writeFile(join(stage, 'sw.js'), `const BUILD_ID = ${JSON.stringify(version)};\nconst BUILD_ASSETS = ${JSON.stringify(immutable)};\n${worker}`),
            asset('third-party-licenses', 'txt', await licenseNotice(), false),
            copyFile('manifest.json', join(stage, 'manifest.json')),
            copyFile('icons/icon.svg', join(stage, 'icons/icon.svg'))
        ]);
        await chmod(stage, 0o755);
        await rm('dist', { recursive: true, force: true });
        await rename(stage, 'dist');
        console.log(`Built dist/ for ${config.environment} (${config.projectRef}).`);
    } finally {
        await rm(stage, { recursive: true, force: true });
    }
}

try {
    await build();
} catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
}
