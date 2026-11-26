if (window.lucide) window.lucide.createIcons();

document.getElementById('backup-export-button').addEventListener('click', () => storage.exportJSON());

const unavailableAction = ':disabled, [aria-disabled="true"], [aria-busy="true"]';
const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

document.getElementById('main-fab').addEventListener('click', event => {
    if (!event.currentTarget.matches(unavailableAction)) app.toggleFabMenu();
});
document.getElementById('header-add-transaction').addEventListener('click', event => {
    if (!event.currentTarget.matches(unavailableAction)) app.openUnifiedTransactionSelector();
});
document.querySelectorAll('[data-privacy-toggle]').forEach(button => {
    button.addEventListener('click', () => app.togglePrivacy());
});

function stopRim(button) {
    button.querySelector('.action-rim rect')?.getAnimations().forEach(effect => effect.cancel());
}

// Minification can serialize the same CSS time in milliseconds or seconds.
function timeInMilliseconds(cssTime) {
    const value = cssTime.trim();
    return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
}

function playRim(button) {
    if (!button.hasAttribute('data-signature-action') || reducedMotion.matches) return;
    const path = button.querySelector('.action-rim rect');
    if (!path?.animate) return;
    stopRim(button);
    const style = getComputedStyle(button);
    // SVG has no viewBox. Its rounded path, dash and offset share CSS pixel units
    // even when the label width, font, or breakpoint changes.
    const perimeter = path.getTotalLength();
    if (!perimeter) return;
    const length = parseFloat(style.getPropertyValue('--rim-length'));
    const opacity = Number(style.getPropertyValue('--rim-opacity'));
    path.style.strokeDasharray = `${length} ${perimeter - length}`;
    path.animate([
        { strokeDashoffset: 0, opacity: 0 },
        { strokeDashoffset: -perimeter * .08, opacity, offset: .08 },
        { strokeDashoffset: -perimeter * .92, opacity, offset: .92 },
        { strokeDashoffset: -perimeter, opacity: 0 },
    ], { duration: timeInMilliseconds(style.getPropertyValue('--rim-travel-time')), easing: 'linear' });
}

// Delegated surface feedback also covers controls replaced by financial renders.
document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    const button = event.target.closest('button, a.btn');
    if (!button || button.contains(event.relatedTarget) || button.matches(unavailableAction)) return;
    button.classList.add('button-hover');
    playRim(button);
}, { passive: true });

document.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse') return;
    const button = event.target.closest('.button-hover');
    if (button && !button.contains(event.relatedTarget)) button.classList.remove('button-hover');
}, { passive: true });

let press;
function clearPress(cancelRim = false) {
    if (!press) return;
    clearTimeout(press.timer);
    press.button.classList.remove('button-press');
    if (cancelRim) stopRim(press.button);
    press = undefined;
}

document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    clearPress(true);
    const button = event.target.closest('button, a.btn');
    button?.classList.remove('button-hover');
    if (!button?.matches('.btn-primary, [data-signature-action]') || button.matches(unavailableAction)) return;
    button.classList.add('button-press');
    press = { button, id: event.pointerId, x: event.clientX, y: event.clientY };
    playRim(button);
}, { passive: true });

document.addEventListener('pointermove', event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
        clearPress(true);
    }
}, { passive: true });

document.addEventListener('pointerup', event => {
    if (press?.id !== event.pointerId) return;
    press.id = null;
    const delay = timeInMilliseconds(getComputedStyle(press.button).getPropertyValue('--action-release-time'));
    press.timer = setTimeout(clearPress, delay);
}, { passive: true });

for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
        if (press?.id === event.pointerId) clearPress(true);
    }, { passive: true });
}

function resetFeedback() {
    clearPress(true);
    document.querySelectorAll('.button-hover').forEach(button => button.classList.remove('button-hover'));
    document.querySelectorAll('[data-signature-action]').forEach(stopRim);
}
window.addEventListener('blur', resetFeedback);
reducedMotion.addEventListener('change', resetFeedback);
finePointer.addEventListener('change', resetFeedback);

// Observe the four persistent summary hosts, whose children are re-rendered.
if ('IntersectionObserver' in window) {
    const summaries = document.querySelectorAll('[data-budget-summary]');
    const visibility = new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
            target.classList.toggle('budget-summary-visible', !document.hidden && isIntersecting);
        }
    });
    function trackSummaries() {
        visibility.disconnect();
        for (const summary of summaries) {
            summary.classList.remove('budget-summary-visible');
            if (!document.hidden && !reducedMotion.matches) visibility.observe(summary);
        }
    }
    document.addEventListener('visibilitychange', trackSummaries);
    reducedMotion.addEventListener('change', trackSummaries);
    trackSummaries();
}

if (typeof EXPENSE_DEPLOYMENT !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
        console.warn('[Startup] Static asset cache registration failed.');
    });
}
