if (window.lucide) window.lucide.createIcons();

document.getElementById('backup-export-button').addEventListener('click', () => storage.exportJSON());

document.getElementById('header-add-transaction').addEventListener('click', () => app.openUnifiedTransactionSelector());
document.querySelectorAll('[data-privacy-toggle]').forEach(button => {
    button.addEventListener('click', () => app.togglePrivacy());
});

document.getElementById('main-fab').addEventListener('click', () => app.toggleFabMenu());

const reflectableButtons = '.btn-primary, .btn-secondary, .btn-tx-submit, .btn-ghost:not(.text-rose), .fab';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen') ||
        reducedMotion.matches || !(event.target instanceof Element)) return;
    const button = event.target.closest(reflectableButtons);
    if (!button || button.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]') ||
        button.closest('#auth-screen, #reset-password-screen, #sync-error-screen, #onboarding-screen')) return;
    button.classList.add('button-reflect');
    button.addEventListener('animationend', clearButtonReflection);
    button.addEventListener('animationcancel', clearButtonReflection);
}, { passive: true });

function clearButtonReflection(event) {
    if (event.target !== event.currentTarget || event.animationName !== 'button-reflect') return;
    const button = event.currentTarget;
    button.classList.remove('button-reflect');
    button.removeEventListener('animationend', clearButtonReflection);
    button.removeEventListener('animationcancel', clearButtonReflection);
}

if (typeof EXPENSE_DEPLOYMENT !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
        console.warn('[Startup] Static asset cache registration failed.');
    });
}
