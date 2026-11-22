// Small motion toolkit: springs, momentum projection, rubber-banding.
// Springs use Apple's two-parameter model (damping ratio + response in seconds).

(function (global) {
    const reducedQuery = global.matchMedia('(prefers-reduced-motion: reduce)');

    // The System Preferences window can switch this on top of the system setting
    let override = false;
    try { override = localStorage.getItem('reduceMotion') === '1'; } catch {}
    document.documentElement.classList.toggle('reduce-motion', override);

    function reduced() {
        return override || reducedQuery.matches;
    }

    function systemReduced() {
        return reducedQuery.matches;
    }

    function setReduced(value) {
        override = value;
        document.documentElement.classList.toggle('reduce-motion', value);
        try { localStorage.setItem('reduceMotion', value ? '1' : '0'); } catch {}
    }

    // Animates a number toward `to`, starting from its current value and velocity (units/second).
    // Interruptible: call .stop() at any time and start a new spring from .value / .velocity.
    function spring({ from, to, velocity = 0, response = 0.4, damping = 1, restDelta = 0.001, restSpeed, onUpdate, onDone }) {
        if (reduced()) response = Math.min(response, 0.15);
        const stiffness = Math.pow((2 * Math.PI) / response, 2);
        const drag = (4 * Math.PI * damping) / response;
        const speedLimit = restSpeed ?? restDelta * 10;

        let x = from;
        let v = velocity;
        let last = null;
        let raf = 0;
        let stopped = false;

        function frame(now) {
            if (stopped) return;
            if (last === null) last = now;
            const dt = Math.min((now - last) / 1000, 0.064);
            last = now;

            const steps = Math.max(1, Math.ceil(dt / 0.004));
            const h = dt / steps;
            for (let i = 0; i < steps; i++) {
                v += (-stiffness * (x - to) - drag * v) * h;
                x += v * h;
            }

            if (Math.abs(x - to) < restDelta && Math.abs(v) < speedLimit) {
                x = to;
                v = 0;
                stopped = true;
                onUpdate(x);
                if (onDone) onDone();
                return;
            }
            onUpdate(x);
            raf = requestAnimationFrame(frame);
        }

        raf = requestAnimationFrame(frame);

        return {
            stop() { stopped = true; cancelAnimationFrame(raf); },
            get value() { return x; },
            get velocity() { return v; },
        };
    }

    // Where a flick of `velocity` (px/s) would come to rest, using scroll-style deceleration.
    function project(velocity, decelerationRate = 0.998) {
        return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
    }

    // Progressive resistance past a boundary.
    function rubberband(overshoot, dimension, constant = 0.55) {
        return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
    }

    // Applies rubber-banding to a value outside [min, max].
    function rubber(value, min, max, dimension) {
        if (value < min) return min - rubberband(min - value, dimension);
        if (value > max) return max + rubberband(value - max, dimension);
        return value;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // Release velocity (units/s) from recent { v, t } samples; 0 if the pointer paused before release.
    function velocityFrom(samples, now = performance.now()) {
        const recent = samples.filter(s => now - s.t <= 100);
        if (recent.length < 2) return 0;
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt <= 0 || now - last.t > 80) return 0;
        return (last.v - first.v) / dt;
    }

    // Gives media inside `root` its real src the first time it is opened (data-open-src -> src).
    function loadOnOpen(root) {
        root.querySelectorAll('[data-open-src]').forEach(el => {
            el.src = el.dataset.openSrc;
            el.removeAttribute('data-open-src');
            if (el.tagName === 'SOURCE') el.parentElement.load();
        });
    }

    global.loadOnOpen = loadOnOpen;
    global.Motion = { spring, project, rubber, clamp, velocityFrom, reduced, systemReduced, setReduced };
})(window);
