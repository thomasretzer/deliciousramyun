// Cloud screensaver: after a while with no input a dusk sky of soft drifting clouds fades in.
// It stays out of the way while media or the game is playing, and the first input only wakes it.

(function (global) {
    const overlay = document.getElementById('screensaver');
    if (!overlay) return;

    const KEY = 'screensaver';
    const DELAYS = [0, 60000, 300000];
    const DEFAULT_DELAY = 60000;
    const MOVE_THRESHOLD = 4;     // px; ignores the synthetic mousemove when the overlay appears

    function readDelay() {
        try {
            const stored = localStorage.getItem(KEY);
            if (stored !== null && DELAYS.includes(Number(stored))) return Number(stored);
        } catch {}
        return DEFAULT_DELAY;
    }

    let delay = readDelay();
    let active = false;
    let timer = 0;
    let clockTimer = 0;
    let wakeTimer = 0;
    let lastActivity = performance.now();
    let lastX = 0;
    let lastY = 0;

    // ---------- scenery, built once ----------
    // Clouds are soft SVG pictures (blur and shading baked in), so drifting them is just a cheap
    // move of an already-rendered image.

    function cloudPicture(width) {
        const body = Math.round(width * 0.46);          // height of the cloud itself
        const height = Math.round(body * 1.5);          // picture is taller, so the blur is never clipped
        const lift = (height - body) / 2;
        const blur = (width * 0.022).toFixed(1);
        const pad = width * 0.14;                       // keep the shapes well inside the left/right edges
        const shapes = [];

        shapes.push(`<ellipse cx="${width / 2}" cy="${body * 0.72}" rx="${width * 0.36}" ry="${body * 0.2}"/>`);
        const bumps = 4 + Math.floor(Math.random() * 2);
        for (let i = 0; i < bumps; i++) {
            const cx = pad + (width - pad * 2) * ((i + 0.5) / bumps) + (Math.random() - 0.5) * width * 0.04;
            const r = body * (0.2 + Math.random() * 0.12);
            const peak = Math.sin((i + 0.5) / bumps * Math.PI);          // taller in the middle
            const cy = body * 0.66 - peak * body * (0.12 + Math.random() * 0.1);
            shapes.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`);
        }

        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
            `<defs>` +
            `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${body}">` +
            `<stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/>` +
            `<stop offset="0.65" stop-color="#ffe6ee" stop-opacity="0.9"/>` +
            `<stop offset="1" stop-color="#f6b9cf" stop-opacity="0.8"/>` +
            `</linearGradient>` +
            `<filter id="b" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
            `</defs>` +
            `<g filter="url(#b)"><g transform="translate(0 ${lift.toFixed(1)})" fill="url(#g)">${shapes.join('')}</g></g></svg>`;

        return { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), height };
    }

    const cloudLayer = overlay.querySelector('.ss-clouds');
    for (let i = 0; i < 7; i++) {
        const width = 260 + Math.round(Math.random() * 300);
        const picture = cloudPicture(width);
        const cloud = document.createElement('img');
        const duration = 110 + Math.random() * 110;
        cloud.className = 'ss-cloud';
        cloud.alt = '';
        cloud.src = picture.src;
        cloud.width = width;
        cloud.height = picture.height;
        cloud.style.top = ((4 + i * 13 + Math.random() * 8) % 78) + '%';
        cloud.style.setProperty('--w', width + 'px');
        cloud.style.setProperty('--x', Math.round(Math.random() * 100) + 'vw');
        cloud.style.opacity = (0.5 + Math.random() * 0.45).toFixed(2);
        cloud.style.animationDuration = duration.toFixed(0) + 's';
        cloud.style.animationDelay = (-Math.random() * duration).toFixed(0) + 's';
        cloudLayer.appendChild(cloud);
    }

    function updateClock() {
        const now = new Date();
        const hour12 = new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12;
        let hours = now.getHours();
        const suffix = hour12 ? (hours >= 12 ? 'PM' : 'AM') : '';
        if (hour12) hours = hours % 12 || 12;
        overlay.querySelector('.ss-h').textContent = hour12 ? String(hours) : String(hours).padStart(2, '0');
        overlay.querySelector('.ss-m').textContent = String(now.getMinutes()).padStart(2, '0');
        overlay.querySelector('.ss-ap').textContent = suffix;
        overlay.querySelector('.ss-date').textContent =
            now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function backgroundVideos() {
        return document.querySelectorAll('.video-background, .mobile-video-background');
    }

    function busy() {
        return document.hidden
            || global.isMediaPlaying?.()
            || global.CloudHopper?.isPlaying()
            || document.querySelector('#mobileModalMedia.active, #mobileModalMusic.active');
    }

    function schedule() {
        clearTimeout(timer);
        timer = 0;
        if (!delay || active) return;
        const remaining = delay - (performance.now() - lastActivity);
        timer = setTimeout(check, Math.max(500, remaining));
    }

    function check() {
        timer = 0;
        if (active || !delay) return;
        if (performance.now() - lastActivity < delay - 250) {
            schedule();
        } else if (busy()) {
            lastActivity = performance.now();
            schedule();
        } else {
            start();
        }
    }

    function start() {
        if (active) return;
        active = true;
        clearTimeout(wakeTimer);
        overlay.classList.remove('waking');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        updateClock();
        clockTimer = setInterval(updateClock, 10000);
        backgroundVideos().forEach(v => v.pause());
    }

    function wake() {
        if (!active) return;
        active = false;
        clearInterval(clockTimer);
        overlay.classList.remove('active');
        // Keep swallowing input while it fades, so the wake-up click can't land on a window underneath
        overlay.classList.add('waking');
        wakeTimer = setTimeout(() => overlay.classList.remove('waking'), 600);
        overlay.setAttribute('aria-hidden', 'true');
        backgroundVideos().forEach(v => {
            if (v.currentSrc && !Motion.reduced() && v.dataset.still !== 'true' && !document.hidden) v.play().catch(() => {});
        });
        lastActivity = performance.now();
        schedule();
    }

    function onActivity(e) {
        if (e.type === 'pointermove') {
            const moved = Math.hypot(e.clientX - lastX, e.clientY - lastY);
            lastX = e.clientX;
            lastY = e.clientY;
            if (active && moved < MOVE_THRESHOLD) return;
        }
        lastActivity = performance.now();
        if (active) wake();
        else if (!timer) schedule();
    }

    ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(type => {
        global.addEventListener(type, onActivity, { capture: true, passive: true });
    });

    function setDelay(ms) {
        delay = DELAYS.includes(ms) ? ms : DEFAULT_DELAY;
        try { localStorage.setItem(KEY, String(delay)); } catch {}
        lastActivity = performance.now();
        if (active && !delay) wake();
        schedule();
    }

    global.Screensaver = {
        getDelay: () => delay,
        setDelay,
        start,
        isActive: () => active,
    };

    schedule();
})(window);
