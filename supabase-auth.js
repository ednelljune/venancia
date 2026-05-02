(function () {
    const SESSION_KEY = 'venancia_supabase_session';
    const CONFIG_KEY = 'venancia_supabase_config';

    const legacyFallback = {
        username: 'admin',
        password: 'venancia2026'
    };

    function readSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function saveSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    async function getConfig() {
        if (window.VENANCIA_RUNTIME_CONFIG) {
            return window.VENANCIA_RUNTIME_CONFIG;
        }

        const cached = sessionStorage.getItem(CONFIG_KEY);
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (error) {
                sessionStorage.removeItem(CONFIG_KEY);
            }
        }

        const response = await fetch('/api/config', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Unable to load authentication config (${response.status}).`);
        }

        const config = await response.json();
        sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        return config;
    }

    async function requestAuth(path, options = {}) {
        const config = await getConfig();
        const headers = {
            apikey: config.supabaseAnonKey,
            ...(options.headers || {})
        };

        if (options.accessToken) {
            headers.Authorization = `Bearer ${options.accessToken}`;
        } else if (!headers.Authorization) {
            headers.Authorization = `Bearer ${config.supabaseAnonKey}`;
        }

        const response = await fetch(`${config.supabaseUrl}${path}`, {
            ...options,
            headers
        });

        return response;
    }

    function normalizeSession(data) {
        if (!data) {
            return null;
        }

        const expiresIn = Number(data.expires_in || 0);
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type || 'bearer',
            expires_in: expiresIn,
            expires_at: data.expires_at || (expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null),
            user: data.user || null
        };
    }

    async function signInWithPassword(email, password) {
        const config = await getConfig();
        if (!config.authEnabled) {
            if (email === legacyFallback.username && password === legacyFallback.password) {
                const fallbackSession = {
                    access_token: `local_${Date.now()}`,
                    refresh_token: `local_${Date.now()}`,
                    token_type: 'bearer',
                    expires_in: 60 * 60 * 24,
                    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
                    user: { email: legacyFallback.username, user_metadata: { legacy: true } }
                };
                saveSession(fallbackSession);
                return fallbackSession;
            }

            throw new Error('Supabase Auth is not configured for this environment.');
        }

        const response = await requestAuth('/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error_description || data.msg || data.error || 'Unable to sign in.');
        }

        const session = normalizeSession(data);
        saveSession(session);
        return session;
    }

    async function refreshSession(session) {
        const config = await getConfig();
        if (!config.authEnabled || !session?.refresh_token) {
            return null;
        }

        const response = await requestAuth('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return null;
        }

        const refreshed = normalizeSession(data);
        saveSession(refreshed);
        return refreshed;
    }

    async function getUser(session = readSession()) {
        if (!session) {
            return null;
        }

        const config = await getConfig();
        if (!config.authEnabled) {
            return session.user || null;
        }

        let response = await requestAuth('/auth/v1/user', {
            method: 'GET',
            accessToken: session.access_token
        });

        if (response.status === 401 && session.refresh_token) {
            const refreshed = await refreshSession(session);
            if (!refreshed) {
                clearSession();
                return null;
            }

            response = await requestAuth('/auth/v1/user', {
                method: 'GET',
                accessToken: refreshed.access_token
            });
        }

        if (!response.ok) {
            clearSession();
            return null;
        }

        return response.json();
    }

    async function requireSession() {
        const session = readSession();
        if (!session) {
            return null;
        }

        const user = await getUser(session);
        if (!user) {
            return null;
        }

        return session;
    }

    async function signOut() {
        const session = readSession();
        clearSession();

        if (!session) {
            return;
        }

        try {
            const config = await getConfig();
            if (!config.authEnabled) {
                return;
            }

            await requestAuth('/auth/v1/logout', {
                method: 'POST',
                accessToken: session.access_token,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            // Local cleanup already happened.
        }
    }

    window.VenanciaSupabaseAuth = {
        getConfig,
        readSession,
        saveSession,
        clearSession,
        signInWithPassword,
        refreshSession,
        getUser,
        requireSession,
        signOut
    };
})();
