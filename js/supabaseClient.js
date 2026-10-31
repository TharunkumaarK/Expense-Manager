const SUPABASE_CONFIG = window.SUPABASE_CONFIG;
const DEV_PROJECT_REF = 'nyetklojxqnawdtrrhma';

if (
    !SUPABASE_CONFIG ||
    SUPABASE_CONFIG.environment !== 'development' ||
    SUPABASE_CONFIG.projectRef !== DEV_PROJECT_REF ||
    new URL(SUPABASE_CONFIG.url).hostname !== `${DEV_PROJECT_REF}.supabase.co` ||
    !SUPABASE_CONFIG.publishableKey.startsWith('sb_publishable_')
) {
    throw new Error('Development Supabase configuration is missing or invalid.');
}

const supabaseClient = {
    client: window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey),
    session: null,
    isInitialized: false,
    realtimeChannel: null,
    isRecoveryMode: false,

    async init() {
        // 1. Check for error fragments from expired/invalid recovery links first.
        const hasRecoveryError = this._checkForRecoveryErrors();
        if (hasRecoveryError) {
            this.isRecoveryMode = false;
            await this.updateUI(false);
            return;
        }

        // 2. Synchronously check if URL hash or search params indicate password recovery.
        // This MUST be checked immediately so isRecoveryMode is true BEFORE getSession()
        // resolves or onAuthStateChange fires, preventing the dashboard from rendering.
        if (this._isRecoveryUrl()) {
            this.isRecoveryMode = true;
            this.showResetPasswordScreen();
        }

        // 3. Register onAuthStateChange BEFORE getSession() to avoid missed/out-of-order events.
        this.client.auth.onAuthStateChange(async (event, session) => {
            console.log('[Auth] State change event:', event);
            this.session = session;

            if (event === 'PASSWORD_RECOVERY') {
                this.isRecoveryMode = true;
                this.showResetPasswordScreen();
                return;
            }

            // Guard: while in recovery mode, ignore SIGNED_IN or INITIAL_SESSION
            // so that the dashboard is never displayed over the reset screen.
            if (this.isRecoveryMode) {
                this.showResetPasswordScreen();
                return;
            }

            if (event === 'SIGNED_OUT') {
                this.isRecoveryMode = false;
                if (typeof storage !== 'undefined') {
                    storage.onUserLogout();
                }
                if (typeof app !== 'undefined') {
                    app._hasInit = false;
                    if (typeof app.clearViewsOnLogout === 'function') {
                        app.clearViewsOnLogout();
                    }
                }
                await this.updateUI(true);
                return;
            }

            if (event === 'SIGNED_IN') {
                await this.updateUI(true);
            }
        });

        // 4. Retrieve or exchange existing session
        const { data: { session } } = await this.client.auth.getSession();
        this.session = session;
        this.isInitialized = true;

        // 5. Update UI: show reset screen if in recovery mode, otherwise normal UI.
        if (this.isRecoveryMode) {
            this.showResetPasswordScreen();
        } else {
            await this.updateUI(false);
        }
    },

    /**
     * Check whether the current URL contains password recovery indicators
     * in the hash fragment (implicit flow) or query string (PKCE flow).
     */
    _isRecoveryUrl() {
        const hash = window.location.hash;
        const search = window.location.search;
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
        const searchParams = new URLSearchParams(search);

        return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
    },

    /**
     * Check the URL hash for error parameters from an expired or invalid
     * recovery link. Supabase redirects with:
     *   #error=...&error_code=...&error_description=...
     * Returns true if an error was found and handled, false otherwise.
     */
    _checkForRecoveryErrors() {
        const hash = window.location.hash;
        if (!hash) return false;
        const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
        const error = params.get('error');
        const errorDesc = params.get('error_description');
        if (error) {
            // Clean up the URL hash so it doesn't persist on refresh
            history.replaceState(null, '', window.location.pathname + window.location.search);
            const message = errorDesc
                ? errorDesc.replace(/\+/g, ' ')
                : 'This recovery link is invalid or has expired.';
            this.showError(message);
            return true;
        }
        return false;
    },

    showError(msg, isError = true) {
        const errEl = document.getElementById('auth-error');
        if (errEl) {
            errEl.innerText = msg;
            errEl.style.color = isError ? 'var(--red)' : '#10b981'; // red or green
            errEl.style.display = 'block';
        }
    },

    clearError() {
        const errEl = document.getElementById('auth-error');
        if (errEl) {
            errEl.innerText = '';
            errEl.style.display = 'none';
        }
    },

    async handleLogin() {
        this.clearError();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const btn = document.getElementById('auth-btn');
        btn.innerText = 'Loading...';
        btn.disabled = true;

        // Try to log in
        const { data, error } = await this.client.auth.signInWithPassword({ email, password });
        
        if (error) {
            if (error.message.toLowerCase().includes('invalid login credentials')) {
                const { data: signUpData, error: signUpError } = await this.client.auth.signUp({ email, password });
                if (signUpError) {
                    this.showError(signUpError.message);
                } else if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                    this.showError('User already exists, but invalid password.');
                } else {
                    if (!signUpData.session) {
                        this.showError('Account created! Please check your email for a confirmation link (or disable Email Confirmations in Supabase settings).');
                    } else {
                        this.session = signUpData.session;
                        await this.updateUI(true);
                    }
                }
            } else {
                this.showError(error.message);
            }
        } else if (data && data.session) {
            this.session = data.session;
            await this.updateUI(true);
        }
        
        btn.innerText = 'Sign In / Sign Up';
        btn.disabled = false;
    },

    async handleLogout() {
        try {
            await this.client.auth.signOut();
        } catch (e) {
            console.error('[Auth] Sign out error:', e);
        }
        this.session = null;

        // Clean up storage and reset to clean state
        if (typeof storage !== 'undefined') {
            storage.onUserLogout();
        }

        // Clean up app state and DOM
        if (typeof app !== 'undefined') {
            app._hasInit = false;
            if (typeof app.clearViewsOnLogout === 'function') {
                app.clearViewsOnLogout();
            }
        }

        await this.updateUI(false);
    },

    async updateUI(isAuthChange = false) {
        const authScreen = document.getElementById('auth-screen');
        const appContent = document.getElementById('app-content');
        const bottomNav = document.getElementById('bottom-nav');
        const mainFab = document.getElementById('main-fab');
        const resetScreen = document.getElementById('reset-password-screen');
        
        // Never show the dashboard while in recovery mode
        if (this.isRecoveryMode) {
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            if (mainFab) mainFab.style.display = 'none';
            if (resetScreen) resetScreen.style.display = 'flex';
            return;
        }

        if (this.session) {
            if (authScreen) authScreen.style.display = 'none';
            if (resetScreen) resetScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';
            if (bottomNav) bottomNav.style.display = 'flex';
            if (mainFab) mainFab.style.display = 'flex';
            
            const emailDisplay = document.getElementById('account-email-display');
            if (emailDisplay) emailDisplay.innerText = `Logged in as ${this.session.user.email}`;

            // Sync from Supabase — if remote is newer, fully re-initialize the app
            if (typeof storage !== 'undefined') {
                storage.onUserLogin(this.session.user.id);
                const stateChanged = await storage.syncFromSupabase();
                if (typeof app !== 'undefined') {
                    if (!app._hasInit) {
                        console.log('[Sync] Initializing app after sync...');
                        app._hasInit = true;
                        app.init();
                    } else if (stateChanged) {
                        // Remote state was newer: fully re-init to apply rollover etc.
                        console.log('[Sync] State updated from remote. Re-initializing app...');
                        app.init();
                    } else if (typeof app.renderAll === 'function') {
                        app.renderAll();
                    }
                }
            }
        } else {
            authScreen.style.display = 'flex';
            if (resetScreen) resetScreen.style.display = 'none';
            appContent.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            if (mainFab) mainFab.style.display = 'none';
        }
    },

    async handleForgotPassword() {
        this.clearError();
        const email = document.getElementById('auth-email').value;
        if (!email) {
            this.showError('Please enter your email address first.');
            return;
        }
        
        const btn = document.getElementById('auth-btn');
        btn.innerText = 'Sending link...';
        btn.disabled = true;

        const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname,
        });

        if (error) {
            if (error.message.toLowerCase().includes('rate limit')) {
                this.showError('Email rate limit reached. Supabase limits how frequently reset emails can be sent. Please wait a few minutes before requesting another link.');
            } else {
                this.showError(error.message);
            }
        } else {
            this.showError('Password reset link sent! Check your email.', false);
            const errEl = document.getElementById('auth-error');
            if (errEl) errEl.style.color = 'var(--green)';
        }

        btn.innerText = 'Sign In / Sign Up';
        btn.disabled = false;
    },

    // ===== Reset Password Flow =====

    /**
     * Show the dedicated reset-password screen.
     * Hides the auth screen, app content, navigation, and FAB.
     */
    showResetPasswordScreen() {
        const authScreen = document.getElementById('auth-screen');
        const appContent = document.getElementById('app-content');
        const bottomNav = document.getElementById('bottom-nav');
        const mainFab = document.getElementById('main-fab');
        const resetScreen = document.getElementById('reset-password-screen');

        authScreen.style.display = 'none';
        appContent.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (mainFab) mainFab.style.display = 'none';

        // Clear any previous form state
        const newPwInput = document.getElementById('reset-new-password');
        const confirmPwInput = document.getElementById('reset-confirm-password');
        if (newPwInput) newPwInput.value = '';
        if (confirmPwInput) confirmPwInput.value = '';
        this._clearResetMessages();

        // Enable the form (in case it was disabled from a previous success)
        const resetForm = document.getElementById('reset-password-form');
        if (resetForm) resetForm.style.display = 'block';

        resetScreen.style.display = 'flex';
    },

    /**
     * Hide the reset-password screen and transition to the normal UI.
     */
    hideResetPasswordScreen() {
        const resetScreen = document.getElementById('reset-password-screen');
        if (resetScreen) resetScreen.style.display = 'none';
        this.isRecoveryMode = false;
    },

    /**
     * Clear success and error messages on the reset screen.
     */
    _clearResetMessages() {
        const successEl = document.getElementById('reset-success-msg');
        const errorEl = document.getElementById('reset-error-msg');
        if (successEl) { successEl.style.display = 'none'; successEl.innerText = ''; }
        if (errorEl) { errorEl.style.display = 'none'; errorEl.innerText = ''; }
    },

    /**
     * Show an error on the reset password screen.
     */
    _showResetError(msg) {
        const errorEl = document.getElementById('reset-error-msg');
        if (errorEl) {
            errorEl.innerText = msg;
            errorEl.style.display = 'block';
        }
    },

    /**
     * Show a success message on the reset password screen.
     */
    _showResetSuccess(msg) {
        const successEl = document.getElementById('reset-success-msg');
        if (successEl) {
            successEl.innerText = msg;
            successEl.style.display = 'block';
        }
    },

    /**
     * Validate the new password.
     * Returns an error string, or null if valid.
     */
    _validatePassword(password, confirmPassword) {
        if (!password || password.length < 8) {
            return 'Password must be at least 8 characters long.';
        }
        if (password !== confirmPassword) {
            return 'Passwords do not match.';
        }
        return null;
    },

    /**
     * Handle the password reset form submission.
     * Validates the inputs and calls Supabase updateUser().
     */
    async handleResetPassword() {
        this._clearResetMessages();

        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;
        const btn = document.getElementById('reset-btn');

        // Validate
        const validationError = this._validatePassword(newPassword, confirmPassword);
        if (validationError) {
            this._showResetError(validationError);
            return;
        }

        btn.innerText = 'Updating...';
        btn.disabled = true;

        try {
            const { data, error } = await this.client.auth.updateUser({
                password: newPassword
            });

            if (error) {
                this._showResetError(error.message);
                btn.innerText = 'Update Password';
                btn.disabled = false;
                return;
            }

            // Success — password has been updated
            this._showResetSuccess('Password updated successfully! Redirecting to your dashboard...');

            // Hide the form to prevent re-submission
            const resetForm = document.getElementById('reset-password-form');
            if (resetForm) resetForm.style.display = 'none';

            // Hide the resend link
            const resendLink = document.querySelector('#reset-password-screen .resend-link');
            if (resendLink) resendLink.style.display = 'none';

            // Wait briefly so the user sees the success message, then proceed to dashboard
            setTimeout(() => {
                this.hideResetPasswordScreen();
                // Clean up URL hash
                history.replaceState(null, '', window.location.pathname + window.location.search);
                this.updateUI(true);
            }, 2000);

        } catch (err) {
            this._showResetError('An unexpected error occurred. Please try again.');
            console.error('[ResetPassword] Error:', err);
            btn.innerText = 'Update Password';
            btn.disabled = false;
        }
    },

    /**
     * Handle "Request a new recovery link" from the reset screen.
     * Transitions back to the auth screen so the user can enter their email
     * and trigger a new recovery email.
     */
    handleRequestNewLink() {
        // Exit recovery mode and go back to the login screen
        this.hideResetPasswordScreen();
        // Sign out the recovery session so the auth screen appears
        this.client.auth.signOut();
        this.session = null;
        this.updateUI(false);

        // Pre-populate a helpful message
        this.showError('Enter your email address and click "Forgot?" to request a new recovery link.', false);
        const errEl = document.getElementById('auth-error');
        if (errEl) errEl.style.color = 'var(--accent)';
    },

    // ===== Password Visibility Toggle =====

    /**
     * Toggle password visibility for a given input field.
     * Swaps between type="password" and type="text" and updates the icon.
     * @param {string} inputId - The ID of the password input.
     * @param {HTMLElement} toggleBtn - The toggle button element.
     */
    togglePasswordVisibility(inputId, toggleBtn) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Swap the SVG icon: eye (visible) ↔ eye-off (hidden)
        if (isPassword) {
            // Now showing text — display eye-off icon
            toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        } else {
            // Now showing password — display eye icon
            toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
    }
};

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => {
    supabaseClient.init();
});
