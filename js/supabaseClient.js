const SUPABASE_URL = 'https://xrovzkibilgbpawnunle.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyb3Z6a2liaWxnYnBhd251bmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDc2ODksImV4cCI6MjEwMTA4MzY4OX0.GUYo0D0itCakd7KaEdElOfUlbYxT3IoHGmMvPqWDOnY';

const supabaseClient = {
    client: window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY),
    session: null,
    isInitialized: false,

    async init() {
        const { data: { session } } = await this.client.auth.getSession();
        this.session = session;
        this.isInitialized = true;
        
        this.client.auth.onAuthStateChange((event, session) => {
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
