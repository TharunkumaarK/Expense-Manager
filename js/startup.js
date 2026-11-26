if (window.lucide) window.lucide.createIcons();

document.getElementById('backup-export-button').addEventListener('click', () => storage.exportJSON());

document.getElementById('header-add-transaction').addEventListener('click', () => app.openUnifiedTransactionSelector());
document.querySelectorAll('[data-privacy-toggle]').forEach(button => {
    button.addEventListener('click', () => app.togglePrivacy());
});

document.getElementById('main-fab').addEventListener('click', () => app.toggleFabMenu());

const actionButtons = 'button:not(.desktop-nav-item, .bottom-nav-item), a.btn';
const unavailableAction = ':disabled, [aria-disabled="true"], [aria-busy="true"]';
const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const perimeterSupported = CSS.supports('mask-composite: exclude') &&
    CSS.supports('background: conic-gradient(red, blue)') && CSS.supports('width: 1cqw');
const pressFeedbackDuration = 1100;
let buttonPress;

function findActionButton(target) {
    return target instanceof Element ? target.closest(actionButtons) : null;
}

function startButtonGlimmer(button) {
    if (reducedMotion.matches || !perimeterSupported) return;
    const perimeter = button.querySelector('.fab-icon') || button;
    const existing = perimeter.querySelector('.button-glimmer');
    if (existing) {
        // A rapid second press replays the existing CSS animation.
        const glimmer = existing.getAnimations({ subtree: true })
            .find(animation => animation.animationName === 'button-perimeter');
        if (glimmer) glimmer.currentTime = 0;
        return;
    }
    const overlay = document.createElement('span');
    overlay.className = 'button-glimmer';
    overlay.setAttribute('aria-hidden', 'true');
    perimeter.append(overlay);
}

document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    const button = findActionButton(event.target);
    if (!button || button.contains(event.relatedTarget) || button.matches(unavailableAction)) return;
    button.classList.add('button-hover');
    startButtonGlimmer(button);
}, { passive: true });

document.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse') return;
    const button = findActionButton(event.target);
    if (button && !button.contains(event.relatedTarget)) button.classList.remove('button-hover');
}, { passive: true });

document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    const button = findActionButton(event.target);
    if (!button || button.matches(unavailableAction)) return;
    if (buttonPress?.button === button) clearTimeout(buttonPress.timer);
    else clearButtonPress();

    button.classList.remove('button-hover');
    button.classList.add('button-press');
    startButtonGlimmer(button);
    buttonPress = { button, pointerId: event.pointerId, timer: setTimeout(clearButtonPress, pressFeedbackDuration) };
    pressObserver.observe(button, { attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-busy'] });
    pressObserver.observe(document.body, { childList: true, subtree: true });
}, { passive: true });

const pressObserver = new MutationObserver(() => {
    if (buttonPress && (!buttonPress.button.isConnected || buttonPress.button.matches(unavailableAction))) {
        clearButtonPress();
    }
});

function clearButtonPress() {
    if (!buttonPress) return;
    clearTimeout(buttonPress.timer);
    pressObserver.disconnect();
    buttonPress.button.classList.remove('button-press');
    buttonPress.button.querySelector('.button-glimmer')?.remove();
    buttonPress = undefined;
}

document.addEventListener('pointercancel', event => {
    if (event.pointerId === buttonPress?.pointerId) clearButtonPress();
}, { passive: true });

function clearFinishedGlimmer(event) {
    if (event.animationName === 'button-perimeter' && event.target.classList.contains('button-glimmer')) {
        event.target.remove();
    }
}

document.addEventListener('animationend', clearFinishedGlimmer);
document.addEventListener('animationcancel', clearFinishedGlimmer);
reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) clearButtonPress();
});

if (typeof EXPENSE_DEPLOYMENT !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
        console.warn('[Startup] Static asset cache registration failed.');
    });
}
