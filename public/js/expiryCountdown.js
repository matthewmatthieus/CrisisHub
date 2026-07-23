(function () {
    function formatCountdown(expiresAt) {
        const expiry = new Date(expiresAt).getTime();
        const remaining = expiry - Date.now();

        if (Number.isNaN(expiry)) {
            return 'Expiry unavailable';
        }
        if (remaining <= 0) {
            return 'Expired';
        }

        const totalSeconds = Math.floor(remaining / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) {
            return `Expires in ${days}d ${String(hours).padStart(2, '0')}h`;
        }
        if (hours > 0) {
            return `Expires in ${hours}h ${String(minutes).padStart(2, '0')}m`;
        }
        return `Expires in ${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }

    function updateCountdowns() {
        document.querySelectorAll('[data-expiry-countdown]').forEach((element) => {
            const text = formatCountdown(element.dataset.expiresAt);
            element.textContent = text;
            element.classList.toggle('is-expired', text === 'Expired');
        });
    }

    window.CrisisHubExpiry = { formatCountdown };
    updateCountdowns();
    window.setInterval(updateCountdowns, 1000);
}());
