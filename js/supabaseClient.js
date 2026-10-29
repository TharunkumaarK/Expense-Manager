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

    async init() {
        const { data: { session } } = await this.client.auth.getSession();
        this.session = session;
        this.isInitialized = true;
        
        this.client.auth.onAuthStateChange((event, session) => {
            this.session = session;
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') {
                this.updateUI(true);
            }
        });
        
        await this.updateUI(false);
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
        await this.client.auth.signOut();
    },

    async updateUI(isAuthChange = false) {
        const authScreen = document.getElementById('auth-screen');
        const appContent = document.getElementById('app-content');
        const bottomNav = document.getElementById('bottom-nav');
        const mainFab = document.getElementById('main-fab');
        
        if (this.session) {
            authScreen.style.display = 'none';
            appContent.style.display = 'block';
            if (bottomNav) bottomNav.style.display = 'flex';
            if (mainFab) mainFab.style.display = 'flex';
            
            const emailDisplay = document.getElementById('account-email-display');
            if (emailDisplay) emailDisplay.innerText = `Logged in as ${this.session.user.email}`;

            // Sync from Supabase — if remote is newer, fully re-initialize the app
            if (typeof storage !== 'undefined') {
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
            this.showError(error.message);
        } else {
            this.showError('Password reset link sent! Check your email.', false); // It's green actually, but red is fine for now
            const errEl = document.getElementById('auth-error');
            errEl.style.color = 'var(--green)';
        }

        btn.innerText = 'Sign In / Sign Up';
        btn.disabled = false;
    }
};

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => {
    supabaseClient.init();
});
