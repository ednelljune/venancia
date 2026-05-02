(function () {
    function resolveApiBaseUrl() {
        if (window.VENANCIA_RUNTIME_CONFIG?.apiBaseUrl) {
            return window.VENANCIA_RUNTIME_CONFIG.apiBaseUrl;
        }

        const host = window.location.hostname;
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.local') ||
            host === 'venancia.onrender.com'
        ) {
            return '';
        }

        return 'https://venancia.onrender.com';
    }

    window.VenanciaApiBaseUrl = resolveApiBaseUrl();
})();
