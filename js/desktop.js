const $ = id => document.getElementById(id);

// ==================== WINDOW REGISTRY ====================
// origin: the element a window grows out of / shrinks into

const windows = {
    youtube: { el: $('youtubeWindow'), dock: $('youtubeDock'), origin: $('youtubeDock') },
    music:   { el: $('musicWindow'),   dock: $('musicDock'),   origin: $('musicDock') },
    about:   { el: $('aboutWindow'),   dock: null,             origin: document.querySelector('.menu-bar-logo') },
    photos:  { el: $('photosWindow'),  dock: $('photosIcon'),  origin: $('photosIcon') },
    video2:  { el: $('videoWindow2'),  dock: null,             origin: $('photosIcon') },
    notes:   { el: $('notesWindow'),   dock: $('notesIcon'),   origin: $('notesIcon') },
    finder:  { el: $('finderWindow'),  dock: $('finderDock'),  origin: $('finderDock') },
    prefs:   { el: $('prefsWindow'),   dock: $('prefsDock'),   origin: $('prefsDock') },
};

Object.values(windows).forEach(w => {
    const isOpen = !w.el.classList.contains('closed');
    w.p = isOpen ? 1 : 0;       // presentation value: 0 = gone, 1 = fully open
    w.target = w.p;
    w.tx = 0;                   // drag offset
    w.ty = 0;
    w.anim = null;
    w.xAnim = null;
    w.yAnim = null;
    w.rectAnim = null;
    w.restore = null;           // size/position to return to after zooming
});

// ==================== OPEN / CLOSE / MINIMIZE ====================

function renderWindow(w) {
    const style = w.el.style;
    if (w.p >= 1 && w.target === 1) {
        style.opacity = '';
        style.transform = '';
        return;
    }
    style.opacity = Motion.clamp(w.p * 1.4, 0, 1);
    style.transform = Motion.reduced() ? '' : `scale(${0.15 + 0.85 * w.p})`;
}

function setWindowOrigin(w) {
    const o = w.origin?.getBoundingClientRect();
    if (!o) return;
    // offsetLeft/Top ignore transforms, so this stays correct mid-animation
    const left = w.el.offsetLeft + w.tx;
    const top = w.el.offsetTop + w.ty;
    w.el.style.transformOrigin = `${o.left + o.width / 2 - left}px ${o.top + o.height / 2 - top}px`;
}

// Springs from the window's current on-screen state, so it can be reversed mid-flight.
function setWindowTarget(w, target, restingClass) {
    w.target = target;
    w.anim?.stop();
    setWindowOrigin(w);
    w.el.classList.remove('closed', 'minimized');
    w.el.classList.toggle('leaving', target === 0);
    if (target === 1) {
        w.dock?.classList.add('active');
        w.onShow?.();
    }
    renderWindow(w);

    w.anim = Motion.spring({
        from: w.p,
        to: target,
        velocity: w.anim?.velocity ?? 0,
        response: 0.38,
        damping: 1,
        restDelta: 0.002,
        onUpdate(p) { w.p = p; renderWindow(w); },
        onDone() {
            w.anim = null;
            w.el.classList.remove('leaving');
            if (target === 0) w.el.classList.add(restingClass);
            renderWindow(w);
        },
    });
}

function closeWindow(w) {
    w.dock?.classList.remove('active');
    setWindowTarget(w, 0, 'closed');
}

function minimizeWindow(w) {
    setWindowTarget(w, 0, 'minimized');
}

// place(w) runs only when the window was fully closed, so restoring keeps its position.
function openWindow(name, place) {
    const w = windows[name];
    if (w.target === 1) {
        bringWindowToFront(w.el);
        return;
    }
    if (w.el.classList.contains('closed')) place?.(w);
    bringWindowToFront(w.el);
    setWindowTarget(w, 1);
}

document.addEventListener('click', e => {
    const button = e.target.closest('.mac-button[data-action]');
    if (!button) return;
    const w = windows[button.closest('.title-bar').dataset.window];
    if (!w) return;
    if (button.dataset.action === 'close') closeWindow(w);
    else if (button.dataset.action === 'minimize') minimizeWindow(w);
    else if (button.dataset.action === 'zoom') toggleZoom(w);
});

// ==================== WINDOW PLACEMENT ====================

function placeAt(w, left, top) {
    w.el.style.left = left + 'px';
    w.el.style.top = top + 'px';
    w.el.style.right = 'auto';
    resetDrag(w);
}

function placeCentered(w, top) {
    const x = (window.innerWidth - w.el.offsetWidth) / 2;
    const y = top ?? (window.innerHeight - w.el.offsetHeight) / 2;
    placeAt(w, Math.max(0, x), Math.max(28, y));
}

function placeRight(w, right, top) {
    placeAt(w, Math.max(0, window.innerWidth - right - w.el.offsetWidth), top);
}

function resetDrag(w) {
    w.xAnim?.stop();
    w.yAnim?.stop();
    w.tx = 0;
    w.ty = 0;
    w.el.style.translate = '';
}

// ==================== DRAGGABLE WINDOWS ====================
// Pointer Events: 1:1 tracking from the grab point, rubber-band at edges, momentum on release.

const EDGE_VISIBLE = 80;     // px of a window that must stay on screen horizontally
const MENU_BAR_HEIGHT = 28;
const DOCK_CLEARANCE = 100;

function applyDrag(w) {
    w.el.style.translate = `${w.tx}px ${w.ty}px`;
}

function makeDraggable(w) {
    const bar = w.el.querySelector('.title-bar');
    let drag = null;

    bar.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.mac-button')) return;

        w.xAnim?.stop();
        w.yAnim?.stop();

        const baseLeft = w.el.offsetLeft;
        const baseTop = w.el.offsetTop;
        drag = {
            startX: e.clientX,
            startY: e.clientY,
            startTx: w.tx,
            startTy: w.ty,
            minTx: EDGE_VISIBLE - w.el.offsetWidth - baseLeft,
            maxTx: window.innerWidth - EDGE_VISIBLE - baseLeft,
            minTy: MENU_BAR_HEIGHT - baseTop,
            maxTy: window.innerHeight - DOCK_CLEARANCE - baseTop,
            xs: [],
            ys: [],
        };
        bar.setPointerCapture(e.pointerId);
        w.el.classList.add('dragging');
    });

    bar.addEventListener('pointermove', e => {
        if (!drag) return;
        e.preventDefault();
        w.tx = Motion.rubber(drag.startTx + e.clientX - drag.startX, drag.minTx, drag.maxTx, window.innerWidth);
        w.ty = Motion.rubber(drag.startTy + e.clientY - drag.startY, drag.minTy, drag.maxTy, window.innerHeight);
        applyDrag(w);

        const t = performance.now();
        drag.xs.push({ v: e.clientX, t });
        drag.ys.push({ v: e.clientY, t });
        if (drag.xs.length > 8) { drag.xs.shift(); drag.ys.shift(); }
    });

    function release() {
        if (!drag) return;
        const d = drag;
        drag = null;
        w.el.classList.remove('dragging');

        const vx = Motion.velocityFrom(d.xs);
        const vy = Motion.velocityFrom(d.ys);
        // Throw toward where the flick is heading, not where the finger let go
        const targetX = Motion.clamp(w.tx + Motion.project(vx, 0.99), d.minTx, d.maxTx);
        const targetY = Motion.clamp(w.ty + Motion.project(vy, 0.99), d.minTy, d.maxTy);

        w.xAnim = Motion.spring({
            from: w.tx, to: targetX, velocity: vx, response: 0.4, damping: 1, restDelta: 0.3, restSpeed: 3,
            onUpdate(x) { w.tx = x; applyDrag(w); },
        });
        w.yAnim = Motion.spring({
            from: w.ty, to: targetY, velocity: vy, response: 0.4, damping: 1, restDelta: 0.3, restSpeed: 3,
            onUpdate(y) { w.ty = y; applyDrag(w); },
        });
    }

    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', release);
}

// ==================== RESIZING & ZOOM ====================
// Windows with flexible content get handles on every edge and corner. Resizing is 1:1 with the
// pointer; zoom (green button / title-bar double-click) springs to fill the desktop and back.

const RESIZABLE = {
    youtube: { minW: 320, minH: 240 },
    photos:  { minW: 200, minH: 160 },
    video2:  { minW: 200, minH: 160 },
    notes:   { minW: 230, minH: 150 },
    finder:  { minW: 300, minH: 220 },
};

const ZOOM_MARGIN = 12;
const ZOOM_TOP = 36;
const ZOOM_BOTTOM = 100;

// Switches a window from its natural size to explicit pixels, and its content to fill mode
function ensureResized(w) {
    if (w.el.classList.contains('resized')) return;
    const width = w.el.offsetWidth;
    const height = w.el.offsetHeight;
    // Some windows are centered by the page layout; pin them so growing doesn't move the origin
    w.el.style.left = w.el.offsetLeft + 'px';
    w.el.style.top = w.el.offsetTop + 'px';
    w.el.style.right = 'auto';
    w.el.classList.add('resized');
    w.el.style.maxWidth = 'none';
    w.el.style.width = width + 'px';
    w.el.style.height = height + 'px';
}

function currentRect(w) {
    return { width: w.el.offsetWidth, height: w.el.offsetHeight, tx: w.tx, ty: w.ty };
}

function setRect(w, rect) {
    w.el.style.width = rect.width + 'px';
    w.el.style.height = rect.height + 'px';
    w.tx = rect.tx;
    w.ty = rect.ty;
    applyDrag(w);
}

// Springs size and position together, from wherever the window is right now
function animateRect(w, to) {
    ensureResized(w);
    w.xAnim?.stop();
    w.yAnim?.stop();
    w.rectAnim?.stop();
    const from = currentRect(w);
    const mix = (a, b, p) => a + (b - a) * p;

    w.rectAnim = Motion.spring({
        from: 0,
        to: 1,
        response: 0.45,
        damping: 1,
        restDelta: 0.001,
        onUpdate(p) {
            setRect(w, {
                width: mix(from.width, to.width, p),
                height: mix(from.height, to.height, p),
                tx: mix(from.tx, to.tx, p),
                ty: mix(from.ty, to.ty, p),
            });
        },
        onDone() { w.rectAnim = null; },
    });
}

function toggleZoom(w) {
    if (!RESIZABLE[w.name]) return;
    ensureResized(w);
    if (w.restore) {
        animateRect(w, w.restore);
        w.restore = null;
        return;
    }
    w.restore = currentRect(w);
    animateRect(w, {
        width: window.innerWidth - ZOOM_MARGIN * 2,
        height: window.innerHeight - ZOOM_TOP - ZOOM_BOTTOM,
        tx: ZOOM_MARGIN - w.el.offsetLeft,
        ty: ZOOM_TOP - w.el.offsetTop,
    });
}

function makeResizable(w, { minW, minH }) {
    const zoomButton = w.el.querySelector('.mac-button.maximize');
    if (zoomButton) {
        zoomButton.disabled = false;
        zoomButton.removeAttribute('tabindex');
        zoomButton.dataset.action = 'zoom';
        zoomButton.setAttribute('aria-label', 'Zoom window');
    }

    w.el.querySelector('.title-bar').addEventListener('dblclick', e => {
        if (!e.target.closest('.mac-button')) toggleZoom(w);
    });

    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.dataset.edge = edge;
        w.el.appendChild(handle);

        let r = null;

        handle.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            w.xAnim?.stop();
            w.yAnim?.stop();
            w.rectAnim?.stop();
            w.restore = null;
            ensureResized(w);
            r = {
                x: e.clientX,
                y: e.clientY,
                width: w.el.offsetWidth,
                height: w.el.offsetHeight,
                tx: w.tx,
                ty: w.ty,
                left: w.el.offsetLeft + w.tx,   // current on-screen position
                top: w.el.offsetTop + w.ty,
            };
            handle.setPointerCapture(e.pointerId);
            w.el.classList.add('resizing');
        });

        handle.addEventListener('pointermove', e => {
            if (!r) return;
            const dx = e.clientX - r.x;
            const dy = e.clientY - r.y;
            let { width, height, tx, ty } = r;

            if (edge.includes('e')) {
                width = Motion.clamp(r.width + dx, minW, window.innerWidth - r.left);
            }
            if (edge.includes('w')) {
                width = Motion.clamp(r.width - dx, minW, r.width + r.left);
                tx = r.tx + (r.width - width);          // right edge stays put
            }
            if (edge.includes('s')) {
                height = Motion.clamp(r.height + dy, minH, window.innerHeight - r.top);
            }
            if (edge.includes('n')) {
                height = Motion.clamp(r.height - dy, minH, r.height + r.top - MENU_BAR_HEIGHT);
                ty = r.ty + (r.height - height);        // bottom edge stays put
            }
            setRect(w, { width, height, tx, ty });
        });

        const end = () => {
            if (!r) return;
            r = null;
            w.el.classList.remove('resizing');
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }
}

// ==================== WINDOW STACKING ====================

let zCounter = 10;

function bringWindowToFront(windowEl) {
    zCounter++;
    windowEl.style.zIndex = zCounter;
    document.querySelectorAll('.window.focused').forEach(el => el.classList.remove('focused'));
    windowEl.classList.add('focused');
}

windows.youtube.el.classList.add('focused');

Object.entries(windows).forEach(([name, w]) => {
    w.name = name;
    if (RESIZABLE[name]) makeResizable(w, RESIZABLE[name]);
});

Object.values(windows).forEach(w => {
    makeDraggable(w);
    w.el.addEventListener('pointerdown', () => bringWindowToFront(w.el), true);
});

// ==================== DOCK ====================

$('youtubeDock')?.addEventListener('click', () => openWindow('youtube'));
$('musicDock')?.addEventListener('click', () => openWindow('music'));

function openPhoto() {
    openWindow('photos', w => placeAt(w, 20, 50));
}

function openVideo() {
    openWindow('video2', w => {
        placeRight(w, 20, 50);
        loadOnOpen(w.el);
        $('mp4Video')?.play().catch(() => {});
    });
}

function openAbout() {
    openWindow('about', w => placeCentered(w, 100));
}

$('photosIcon')?.addEventListener('click', () => {
    openPhoto();
    openVideo();
});

$('finderDock')?.addEventListener('click', () => openWindow('finder', w => placeAt(w, 60, 90)));
$('prefsDock')?.addEventListener('click', () => openWindow('prefs', w => placeRight(w, 60, 110)));

$('notesIcon')?.addEventListener('click', () => openWindow('notes', w => placeCentered(w)));

$('mailIcon')?.addEventListener('click', () => {
    window.location.href = 'mailto:deliciousramyun@gmail.com';
});

document.querySelector('.menu-bar-logo')?.addEventListener('click', openAbout);

$('trashIcon')?.addEventListener('click', () => {
    window.close();
});

// Dock items are clickable divs; make them reachable and operable from the keyboard
document.querySelectorAll('.dock-item').forEach(item => {
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', item.querySelector('.dock-label')?.textContent ?? '');
    item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
        }
    });
});

// ==================== FINDER ====================
// Click selects; double-click, Enter or a touch tap opens.

const finderActions = { about: openAbout, photo: openPhoto, video: openVideo };

function selectFinderItem(item) {
    document.querySelectorAll('.finder-item').forEach(el => {
        el.classList.toggle('selected', el === item);
        el.setAttribute('aria-selected', String(el === item));
    });
}

let finderPointerType = 'mouse';

document.querySelector('.finder-items')?.addEventListener('pointerdown', e => {
    finderPointerType = e.pointerType;
});

document.querySelectorAll('.finder-item').forEach(item => {
    const open = () => finderActions[item.dataset.open]?.();
    item.addEventListener('click', e => {
        selectFinderItem(item);
        if (finderPointerType === 'touch' || finderPointerType === 'pen') open();
        else if (e.detail >= 2) open();
        else if (e.detail === 0) open();   // keyboard-triggered click (Enter / Space)
    });
});

document.querySelector('.finder-body')?.addEventListener('pointerdown', e => {
    if (!e.target.closest('.finder-item')) selectFinderItem(null);
});

// ==================== SYSTEM PREFERENCES ====================

const BACKGROUNDS = {
    clouds: 'images/backgrounds/clouds.mp4',
    reverse: 'images/backgrounds/clouds_reverse.mp4',
};

function readPref(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch {}
}

let backgroundChoice = ['clouds', 'reverse', 'still'].includes(readPref('background')) ? readPref('background') : 'clouds';

function applyBackground() {
    const video = document.querySelector('.video-background');
    const source = video?.querySelector('source');
    if (!video || !source) return;

    const wanted = BACKGROUNDS[backgroundChoice];
    // 'still' keeps whichever clip is loaded and just pauses it
    if (wanted && source.getAttribute('src') !== wanted) {
        source.src = wanted;
        video.load();
    }

    const still = backgroundChoice === 'still' || Motion.reduced();
    video.dataset.still = String(still);
    if (still) video.pause();
    else video.play().catch(() => {});

    document.querySelectorAll('.prefs-segment [data-bg]').forEach(button => {
        button.setAttribute('aria-checked', String(button.dataset.bg === backgroundChoice));
    });
}

document.querySelectorAll('.prefs-segment [data-bg]').forEach(button => {
    button.addEventListener('click', () => {
        backgroundChoice = button.dataset.bg;
        writePref('background', backgroundChoice);
        applyBackground();
    });
});

const reduceMotionBox = $('prefsReduceMotion');

if (reduceMotionBox) {
    reduceMotionBox.checked = Motion.reduced();
    if (Motion.systemReduced()) {
        reduceMotionBox.disabled = true;
        $('prefsReduceHint').textContent = 'Turned on by your system settings.';
    }
    reduceMotionBox.addEventListener('change', () => {
        Motion.setReduced(reduceMotionBox.checked);
        applyBackground();
    });
}

// ==================== SHARED SLIDER ====================
// Pointer-driven slider/scrubber. onInput fires continuously with a 0..1 fraction; onCommit once on release.

function bindSlider(el, { onStart, onInput, onCommit }) {
    if (!el) return;
    el.style.touchAction = 'none';
    let dragging = false;
    let fraction = 0;

    const read = e => {
        const rect = el.getBoundingClientRect();
        fraction = Motion.clamp((e.clientX - rect.left) / rect.width, 0, 1);
        return fraction;
    };

    el.addEventListener('pointerdown', e => {
        dragging = true;
        el.setPointerCapture(e.pointerId);
        onStart?.();
        onInput(read(e));
    });
    el.addEventListener('pointermove', e => {
        if (dragging) onInput(read(e));
    });
    const end = () => {
        if (!dragging) return;
        dragging = false;
        onCommit?.(fraction);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}

function swapIcon(icon, from, to) {
    if (icon) { icon.classList.remove(from); icon.classList.add(to); }
}

function setBar(prefix, fraction) {
    const fill = $(prefix + 'Fill');
    const knob = $(prefix + 'Knob');
    if (fill) fill.style.width = fraction * 100 + '%';
    if (knob) knob.style.left = fraction * 100 + '%';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

// ==================== YOUTUBE PLAYER ====================

let player = null;
let ytPlaying = false;
let ytScrubbing = false;
let ytFrame = 0;
let desktopActive = false;

function initYouTube() {
    if (player || !desktopActive || typeof YT === 'undefined' || !YT.Player) return;
    player = new YT.Player('youtubePlayer', {
        events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange },
    });
}

window.onYouTubeIframeAPIReady = initYouTube;

function onPlayerReady() {
    updateYTVolume(50);
}

function onPlayerStateChange(event) {
    const icon = $('ytPlayIcon');
    if (event.data === YT.PlayerState.PLAYING) {
        ytPlaying = true;
        startYTProgress();
        swapIcon(icon, 'ph-play', 'ph-pause');
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        ytPlaying = false;
        swapIcon(icon, 'ph-pause', 'ph-play');
    }
}

// Runs only while playing, on screen, and in a visible tab
function startYTProgress() {
    if (ytFrame || !ytPlaying) return;
    ytFrame = requestAnimationFrame(ytProgressTick);
}

let lastYTSecond = -1;

function ytProgressTick() {
    ytFrame = 0;
    if (!ytPlaying || document.hidden || windows.youtube.target === 0) return;

    if (!ytScrubbing && player?.getDuration) {
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        setBar('ytProgress', duration > 0 ? current / duration : 0);
        const second = Math.floor(current);
        if (second !== lastYTSecond) {
            lastYTSecond = second;
            $('ytTimeCurrent').textContent = formatTime(current);
            $('ytTimeTotal').textContent = formatTime(duration);
        }
    }
    ytFrame = requestAnimationFrame(ytProgressTick);
}

windows.youtube.onShow = startYTProgress;
document.addEventListener('visibilitychange', () => { if (!document.hidden) startYTProgress(); });

$('ytPlayBtn')?.addEventListener('click', () => {
    if (!player) return;
    if (player.getPlayerState?.() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
});

$('ytMuteBtn')?.addEventListener('click', () => {
    if (!player) return;
    const icon = $('ytSpeakerIcon');
    if (player.isMuted?.()) {
        player.unMute();
        swapIcon(icon, 'ph-speaker-slash', 'ph-speaker-high');
    } else {
        player.mute();
        swapIcon(icon, 'ph-speaker-high', 'ph-speaker-slash');
    }
});

$('ytRewindBtn')?.addEventListener('click', () => {
    if (player?.getCurrentTime) player.seekTo(Math.max(0, player.getCurrentTime() - 10));
});

$('ytForwardBtn')?.addEventListener('click', () => {
    if (player?.getCurrentTime) player.seekTo(Math.min(player.getDuration(), player.getCurrentTime() + 10));
});

bindSlider($('ytProgressBar'), {
    onStart() { ytScrubbing = true; },
    onInput(f) {
        setBar('ytProgress', f);
        if (player?.getDuration) $('ytTimeCurrent').textContent = formatTime(player.getDuration() * f);
    },
    onCommit(f) {
        ytScrubbing = false;
        if (player?.getDuration) player.seekTo(player.getDuration() * f);
    },
});

function updateYTVolume(percent) {
    player?.setVolume?.(percent);
    setBar('ytVolume', percent / 100);
}

bindSlider($('ytVolumeSlider'), { onInput: f => updateYTVolume(Math.round(f * 100)) });

// ==================== SOUNDCLOUD WIDGET ====================

let scWidget = null;
let scDuration = 0;
let scProgressInterval = 0;
let scMuted = false;
let scLastVolume = 80;

function formatSCTime(ms) {
    return formatTime(ms / 1000);
}

function initSoundCloud() {
    const iframe = $('soundcloudPlayer');
    if (scWidget || !iframe || typeof SC === 'undefined') return;

    scWidget = SC.Widget(iframe);

    scWidget.bind(SC.Widget.Events.READY, () => {
        scWidget.setVolume(scLastVolume);
        setBar('scVolume', scLastVolume / 100);
        scWidget.getCurrentSound(sound => {
            if (!sound) return;
            $('scTrackTitle').textContent = sound.title || 'Unknown Track';
            $('scTrackArtist').textContent = sound.user?.username || 'delicious ramyun';
            if (sound.artwork_url) {
                const art = $('scArtwork');
                art.onload = () => art.classList.add('loaded');
                art.src = sound.artwork_url.replace('-large', '-t500x500');
            }
        });
        scWidget.getDuration(d => {
            scDuration = d;
            $('scTimeTotal').textContent = formatSCTime(d);
        });
    });

    scWidget.bind(SC.Widget.Events.PLAY, () => {
        swapIcon($('scPlayIcon'), 'ph-play', 'ph-pause');
        clearInterval(scProgressInterval);
        scProgressInterval = setInterval(() => {
            if (scScrubbing || document.hidden || windows.music.target === 0 || !scDuration) return;
            scWidget.getPosition(pos => {
                setBar('scProgress', pos / scDuration);
                $('scTimeCurrent').textContent = formatSCTime(pos);
            });
        }, 250);
    });

    const onStop = () => {
        swapIcon($('scPlayIcon'), 'ph-pause', 'ph-play');
        clearInterval(scProgressInterval);
    };
    scWidget.bind(SC.Widget.Events.PAUSE, onStop);
    scWidget.bind(SC.Widget.Events.FINISH, onStop);
}

$('scPlayBtn')?.addEventListener('click', () => scWidget?.toggle());

$('scMuteBtn')?.addEventListener('click', () => {
    if (!scWidget) return;
    const icon = $('scSpeakerIcon');
    if (scMuted) {
        scWidget.setVolume(scLastVolume);
        setBar('scVolume', scLastVolume / 100);
        swapIcon(icon, 'ph-speaker-slash', 'ph-speaker-high');
        scMuted = false;
    } else {
        scWidget.getVolume(v => { if (v > 0) scLastVolume = v; });
        scWidget.setVolume(0);
        setBar('scVolume', 0);
        swapIcon(icon, 'ph-speaker-high', 'ph-speaker-slash');
        scMuted = true;
    }
});

$('scRewindBtn')?.addEventListener('click', () => {
    scWidget?.getPosition(pos => scWidget.seekTo(Math.max(0, pos - 10000)));
});

$('scForwardBtn')?.addEventListener('click', () => {
    scWidget?.getPosition(pos => scWidget.seekTo(Math.min(scDuration, pos + 10000)));
});

let scScrubbing = false;

bindSlider($('scProgressBar'), {
    onStart() { scScrubbing = true; },
    onInput(f) {
        setBar('scProgress', f);
        $('scTimeCurrent').textContent = formatSCTime(scDuration * f);
    },
    onCommit(f) {
        scScrubbing = false;
        if (scWidget && scDuration) scWidget.seekTo(Math.round(f * scDuration));
    },
});

bindSlider($('scVolumeSlider'), {
    onInput(f) {
        const pct = Math.round(f * 100);
        scWidget?.setVolume(pct);
        scMuted = pct === 0;
        if (pct > 0) scLastVolume = pct;
        setBar('scVolume', f);
    },
});

// ==================== MENU BAR TIME ====================

function updateMenuBarTime() {
    const now = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    const hours = now.getHours() % 12 || 12;
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    const mins = String(now.getMinutes()).padStart(2, '0');
    $('menuBarTime').textContent = `${day} ${hours}:${mins} ${ampm}`;
    // Wake on the next minute boundary instead of every second
    setTimeout(updateMenuBarTime, 60000 - (Date.now() % 60000) + 50);
}

updateMenuBarTime();

// ==================== INIT WHEN DESKTOP LAYOUT IS SHOWN ====================

onLayout('desktop', () => {
    desktopActive = true;
    applyBackground();
    initYouTube();
    initSoundCloud();
});
