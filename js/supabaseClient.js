const SUPABASE_URL = 'https://xrovzkibilgbpawnunle.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const supabaseClient = {
    session: null,
    isInitialized: false,

    async init() {
        const { data: { session } } = await supabase.auth.getSession();
        this.session = session;
        this.isInitialized = true;
        
        supabase.auth.onAuthStateChange((event, session) => {
            this.session = session;
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                this.updateUI(true);
            }
        });
        
        await this.updateUI(false);
    },

    showError(msg) {
        const errEl = document.getElementById('auth-error');
        if (errEl) {
            errEl.innerText = msg;
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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            // If invalid credentials, maybe the user doesn't exist. Let's try to sign up automatically as requested.
            if (error.message.toLowerCase().includes('invalid login credentials')) {
                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
                if (signUpError) {
                    this.showError(signUpError.message);
                } else if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                    this.showError('User already exists, but invalid password.');
                } else {
                    // Sign up successful!
                    // Note: If email confirmations are enabled in Supabase, they will need to verify their email.
                    // Assuming for a personal project, email confirmations might be disabled.
                    // If not disabled, they'll be asked to check their email.
                }
            } else {
                this.showError(error.message);
            }
        }
        
        btn.innerText = 'Sign In / Sign Up';
        btn.disabled = false;
    },

    async handleLogout() {
        await supabase.auth.signOut();
    },

    async updateUI(isAuthChange = false) {
        const authScreen = document.getElementById('auth-screen');
        const appContent = document.getElementById('app-content');
        
        if (this.session) {
            authScreen.style.display = 'none';
            appContent.style.display = 'block';
            
            const emailDisplay = document.getElementById('account-email-display');
            if (emailDisplay) emailDisplay.innerText = `Logged in as ${this.session.user.email}`;
            
            // Re-load data from Supabase
            if (window.storage) {
                await storage.syncFromSupabase();
                if (window.app && typeof app.renderAll === 'function') {
                    app.renderAll();
                }
            }
        } else {
            authScreen.style.display = 'flex';
            appContent.style.display = 'none';
        }
    }
};

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => {
    supabaseClient.init();
});
