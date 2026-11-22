// Easter eggs: unlocking Cloud Hopper (click the menu-bar cloud 5 times, tap the About logo
// 5 times on a phone, or type "ramyun"), plus the little toast that announces it.

(function (global) {
    const KEY = 'hopperUnlocked';
    let unlockedThisSession = false;

    function unlocked() {
        if (unlockedThisSession) return true;
        try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
    }

    let toastEl = null;
    let toastTimer = 0;

    function toast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            toastEl.setAttribute('role', 'status');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        // Re-trigger the entrance if a previous toast is still up
        toastEl.classList.remove('show');
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3800);
    }

    function unlock() {
        const mobile = global.matchMedia('(max-width: 768px)').matches;
        if (unlocked()) {
            toast(mobile ? 'CLOUD HOPPER IS ON YOUR HOME SCREEN' : 'CLOUD HOPPER IS ALREADY IN YOUR DOCK');
            return;
        }
        unlockedThisSession = true;
        try { localStorage.setItem(KEY, '1'); } catch {}
        global.dispatchEvent(new CustomEvent('hopper-unlocked'));
        toast(mobile ? 'SECRET UNLOCKED!\nCloud Hopper is on your home screen' : 'SECRET UNLOCKED!\nCloud Hopper is in your dock');
    }

    // Calls `callback` after `count` quick taps/clicks on `el`
    function tapCounter(el, callback, count = 5, windowMs = 2500) {
        if (!el) return;
        let taps = [];
        el.addEventListener('click', () => {
            const now = performance.now();
            taps = taps.filter(t => now - t < windowMs);
            taps.push(now);
            if (taps.length >= count) {
                taps = [];
                callback();
            }
        });
    }

    tapCounter(document.querySelector('.menu-bar-logo'), unlock);
    tapCounter(document.getElementById('mobileAboutLogo'), unlock);

    let typed = '';
    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
        if (e.target.closest?.('input, textarea, [contenteditable]')) return;
        typed = (typed + e.key.toLowerCase()).slice(-6);
        if (typed === 'ramyun') {
            typed = '';
            unlock();
        }
    });

    global.Secrets = { unlocked, unlock, toast };
})(window);
