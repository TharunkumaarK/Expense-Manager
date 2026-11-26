if (window.lucide) window.lucide.createIcons();

document.getElementById('backup-export-button').addEventListener('click', () => storage.exportJSON());

if (typeof EXPENSE_DEPLOYMENT !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
        console.warn('[Startup] Static asset cache registration failed.');
    });
}
