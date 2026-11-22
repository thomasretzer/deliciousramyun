// Loads only the layout that is actually shown (desktop or mobile).
// Heavy media (iframes, videos) carry data-src and get their real src on first activation.

(function () {
    const query = window.matchMedia('(max-width: 768px)');
    const roots = {
        desktop: document.querySelector('.desktop-layout'),
        mobile: document.querySelector('.mobile-layout'),
    };
    const active = { desktop: false, mobile: false };
    const waiting = { desktop: [], mobile: [] };

    function load(root) {
        root.querySelectorAll('[data-src]').forEach(el => {
            // Ambient background video stays a still frame for people who ask for reduced motion
            if (Motion.reduced() && el.tagName === 'SOURCE' && el.parentElement.matches('.video-background, .mobile-video-background')) {
                el.parentElement.autoplay = false;
            }
            el.src = el.dataset.src;
            el.removeAttribute('data-src');
            if (el.tagName === 'SOURCE') el.parentElement.load();
        });
    }

    function activate(name) {
        if (active[name] || !roots[name]) return;
        active[name] = true;
        load(roots[name]);
        waiting[name].splice(0).forEach(fn => fn());
    }

    // Runs fn once the named layout is shown (immediately if it already is).
    window.onLayout = function (name, fn) {
        if (active[name]) fn();
        else waiting[name].push(fn);
    };

    function update() {
        activate(query.matches ? 'mobile' : 'desktop');
    }

    query.addEventListener('change', update);
    update();

    // Don't decode full-screen video in a background tab
    document.addEventListener('visibilitychange', () => {
        document.querySelectorAll('.video-background, .mobile-video-background').forEach(video => {
            const root = video.closest('.desktop-layout, .mobile-layout');
            if (!video.currentSrc || getComputedStyle(root).display === 'none') return;
            if (document.hidden) video.pause();
            else if (!Motion.reduced() && video.dataset.still !== 'true') video.play().catch(() => {});
        });
    });
})();
