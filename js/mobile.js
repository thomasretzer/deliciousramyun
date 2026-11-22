// ==================== BATTERY ====================

function updateBatteryLevel(level, isCharging) {
    const batteryPercent = Math.round(level * 100);
    const batteryFill = document.getElementById('mobileBatteryFill');
    const batteryPercentText = document.getElementById('mobileBatteryPercent');
    const chargingIcon = document.getElementById('mobileChargingIcon');

    if (batteryFill) batteryFill.style.width = batteryPercent + '%';
    if (batteryPercentText) batteryPercentText.textContent = batteryPercent + '%';
    if (chargingIcon) chargingIcon.style.display = isCharging ? 'inline' : 'none';

    for (let i = 1; i <= 8; i++) {
        const el = document.getElementById(`modalBatteryPercent${i}`);
        if (el) el.textContent = batteryPercent + '%';
    }

    document.querySelectorAll('.modal-charging-icon').forEach(icon => {
        icon.style.display = isCharging ? 'inline' : 'none';
    });

    let color;
    if (isCharging) {
        color = 'linear-gradient(to bottom, rgba(52,199,89,1), rgba(30,160,60,1))';
    } else if (batteryPercent <= 20) {
        color = 'linear-gradient(to bottom, rgba(255,59,48,1), rgba(200,40,30,1))';
    } else if (batteryPercent <= 50) {
        color = 'linear-gradient(to bottom, rgba(255,204,0,1), rgba(200,160,0,1))';
    } else {
        color = 'linear-gradient(to bottom, rgba(255,255,255,1), rgba(200,200,200,1))';
    }

    if (batteryFill) batteryFill.style.background = color;
    document.querySelectorAll('.battery-fill').forEach(fill => {
        if (fill.id !== 'mobileBatteryFill') {
            fill.style.background = color;
            fill.style.width = batteryPercent + '%';
        }
    });
}

if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
        updateBatteryLevel(battery.level, battery.charging);
        battery.addEventListener('levelchange', () => updateBatteryLevel(battery.level, battery.charging));
        battery.addEventListener('chargingchange', () => updateBatteryLevel(battery.level, battery.charging));
    });
} else {
    updateBatteryLevel(1.0, false);
}

// ==================== MOBILE TIME ====================

function updateMobileTime() {
    const now = new Date();
    const hours = now.getHours() % 12 || 12;
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    const mins = String(now.getMinutes()).padStart(2, '0');
    const fullTimeStr = `${hours}:${mins} ${ampm}`;

    const mobileStatusTime = document.getElementById('mobileStatusTime');
    if (mobileStatusTime) mobileStatusTime.textContent = fullTimeStr;

    for (let i = 1; i <= 8; i++) {
        const el = document.getElementById(`mobileModalStatusTime${i}`);
        if (el) el.textContent = fullTimeStr;
    }

    // Wake on the next minute boundary instead of every second
    setTimeout(updateMobileTime, 60000 - (Date.now() % 60000) + 50);
}

updateMobileTime();

// ==================== APP SHEETS ====================
// Each modal is a sheet that grows out of the tapped icon, can be swiped away, and is
// interruptible: every animation starts from the sheet's current on-screen state.

const sheets = new Map();
let currentSheet = null;

function sheetFor(modal) {
    if (!sheets.has(modal)) {
        sheets.set(modal, { el: modal, p: 0, dy: 0, target: 0, anim: null, dyAnim: null, releaseVelocity: 0 });
        bindSheetDrag(sheets.get(modal));
    }
    return sheets.get(modal);
}

function renderSheet(s) {
    const style = s.el.style;
    if (s.p >= 1 && s.target === 1 && s.dy === 0) {
        style.opacity = '';
        style.transform = '';
        style.borderRadius = '';
        return;
    }
    if (Motion.reduced()) {
        style.opacity = Motion.clamp(s.p, 0, 1);
        style.transform = s.dy ? `translate3d(0, ${s.dy}px, 0)` : '';
        return;
    }
    style.opacity = Math.min(1, s.p * 2);
    style.borderRadius = (1 - Math.min(s.p, 1)) * 48 + 'px';
    style.transform = `translate3d(0, ${s.dy}px, 0) scale(${0.12 + 0.88 * s.p})`;
}

function moveSheet(s, target) {
    s.target = target;
    s.anim?.stop();
    s.dyAnim?.stop();
    if (target === 1) s.el.classList.add('active');
    renderSheet(s);

    s.anim = Motion.spring({
        from: s.p,
        to: target,
        response: 0.42,
        damping: 1,
        restDelta: 0.002,
        onUpdate(p) { s.p = p; renderSheet(s); },
        onDone() {
            s.anim = null;
            if (target === 0) {
                s.el.classList.remove('active');
                if (currentSheet === s) currentSheet = null;
            }
            renderSheet(s);
        },
    });

    if (s.dy !== 0) {
        // Only a gesture that carried momentum earns a little bounce
        const bouncy = Math.abs(s.releaseVelocity) > 300;
        s.dyAnim = Motion.spring({
            from: s.dy,
            to: 0,
            velocity: s.releaseVelocity,
            response: 0.4,
            damping: bouncy ? 0.85 : 1,
            restDelta: 0.3,
            restSpeed: 3,
            onUpdate(dy) { s.dy = dy; renderSheet(s); },
            onDone() { s.dyAnim = null; s.dy = 0; renderSheet(s); },
        });
    }
}

function bindSheetDrag(s) {
    s.el.querySelectorAll('.mobile-status-bar, .mobile-modal-header').forEach(handle => {
        let drag = null;

        handle.addEventListener('pointerdown', e => {
            // Pointer capture would swallow the click, so leave buttons (Done) alone
            if (e.target.closest('button')) return;
            s.anim?.stop();
            s.dyAnim?.stop();
            s.anim = null;
            s.dyAnim = null;
            drag = { startY: e.clientY, startDy: s.dy, ys: [] };
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', e => {
            if (!drag) return;
            // 1:1 with the finger, with resistance if pulled upward past the top
            s.dy = Motion.rubber(drag.startDy + e.clientY - drag.startY, 0, Infinity, window.innerHeight);
            renderSheet(s);
            drag.ys.push({ v: e.clientY, t: performance.now() });
            if (drag.ys.length > 8) drag.ys.shift();
        });

        function release() {
            if (!drag) return;
            const vy = Motion.velocityFrom(drag.ys);
            drag = null;
            s.releaseVelocity = vy;
            // Dismiss based on where the flick is heading; an upward flick never dismisses
            const projected = s.dy + Motion.project(vy, 0.99);
            if (vy >= 0 && projected > window.innerHeight * 0.3) closeSheet(s);
            else moveSheet(s, 1);
        }

        handle.addEventListener('pointerup', release);
        handle.addEventListener('pointercancel', release);
    });
}

function closeSheet(s) {
    if (s.el.id === 'mobileModalGame') hopperMobile?.pause();
    document.querySelector('.mobile-dock-container')?.classList.remove('hidden');
    document.querySelector('.mobile-home-button')?.classList.remove('moved-down');
    moveSheet(s, 0);
}

function openMobileApp(appName, tapped) {
    const id = 'mobileModal' + appName.charAt(0).toUpperCase() + appName.slice(1);
    const modal = document.getElementById(id);
    if (!modal) return;

    const s = sheetFor(modal);
    if (currentSheet && currentSheet !== s) closeSheet(currentSheet);
    currentSheet = s;

    loadOnOpen(modal);

    // Grow out of the tapped icon, and shrink back into it
    const icon = tapped?.querySelector('.mobile-app-icon') ?? tapped;
    const rect = icon?.getBoundingClientRect();
    modal.style.transformOrigin = rect
        ? `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`
        : '50% 100%';

    document.querySelector('.mobile-dock-container')?.classList.add('hidden');
    document.querySelector('.mobile-home-button')?.classList.add('moved-down');
    moveSheet(s, 1);

    if (appName === 'game') hopperMobile?.resume();

    if (appName === 'media') {
        setTimeout(() => fetchYouTubeVideoInfo('lF6hv4qAKxI'), 500);
    }
}

window.closeAllModals = function () {
    sheets.forEach(s => { if (s.target === 1) closeSheet(s); });
    document.querySelector('.mobile-dock-container')?.classList.remove('hidden');
    document.querySelector('.mobile-home-button')?.classList.remove('moved-down');
};

document.querySelectorAll('.mobile-app').forEach(app => {
    app.tabIndex = 0;
    app.setAttribute('role', 'button');
    app.addEventListener('click', () => {
        const appName = app.getAttribute('data-app');
        if (appName) openMobileApp(appName, app);
    });
    app.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            app.click();
        }
    });
});

document.querySelector('.mobile-home-button')?.addEventListener('click', e => {
    e.preventDefault();
    closeAllModals();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
});

// ==================== CLOUD HOPPER (easter egg) ====================

let hopperMobile = null;

function revealGameApp() {
    const app = document.getElementById('mobileGameApp');
    if (app) app.hidden = false;
}

if (Secrets.unlocked()) revealGameApp();
window.addEventListener('hopper-unlocked', revealGameApp);

onLayout('mobile', () => {
    hopperMobile = CloudHopper.create(document.getElementById('hopperCanvasMobile'));
});

document.querySelectorAll('.mobile-modal-done').forEach(button => {
    button.addEventListener('click', closeAllModals);
});

// ==================== YOUTUBE (MOBILE MEDIA MODAL) ====================

async function fetchYouTubeVideoInfo(videoId) {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        const data = await res.json();

        const titleEl = document.getElementById('videoTitle');
        if (titleEl && data.title) titleEl.textContent = data.title;

        const channelEl = document.getElementById('channelName');
        if (channelEl && data.author_name) channelEl.textContent = data.author_name;

        const subEl = document.getElementById('subscriberCount');
        if (subEl) subEl.textContent = 'Subscribe for more';

        loadRelatedVideos(data.author_name);
    } catch {
        const titleEl = document.getElementById('videoTitle');
        if (titleEl) titleEl.textContent = 'Video from delicious ramyun';
        loadRelatedVideos('delicious ramyun');
    }
}

const channelVideos = [
    { id: 'JhhIffH7O-A' },
    { id: 'BY4EpYYW17I' },
    { id: 'XEXva7UaBmc' },
];

async function fetchVideoDetails(videoId) {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        const data = await res.json();
        return { title: data.title || 'Video', thumbnail: data.thumbnail_url || '' };
    } catch {
        return { title: 'Video', thumbnail: '' };
    }
}

function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadRelatedVideos(channelName) {
    const container = document.getElementById('relatedVideos');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:12px;">Loading videos...</div>';

    const videos = await Promise.all(channelVideos.map(async v => {
        const details = await fetchVideoDetails(v.id);
        return { ...v, ...details };
    }));

    container.innerHTML = videos.map(v => `
        <div style="display:flex;gap:10px;cursor:pointer;padding:8px;border-radius:8px;"
             onclick="loadMobileVideo('${v.id}')">
            <div style="width:168px;height:94px;background:#000;border-radius:8px;flex-shrink:0;overflow:hidden;">
                ${v.thumbnail
                    ? `<img src="${escapeHTML(v.thumbnail)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:32px;">📺</div>`}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;line-height:1.3;margin-bottom:4px;color:#0f0f0f;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                    ${escapeHTML(v.title)}
                </div>
                <div style="font-size:11px;color:#606060;">${escapeHTML(channelName || 'delicious ramyun')}</div>
            </div>
        </div>
    `).join('');
}

window.loadMobileVideo = function (videoId) {
    const iframe = document.getElementById('mobileYoutubePlayer');
    if (!iframe) return;
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&rel=1`;
    fetchYouTubeVideoInfo(videoId);
    iframe.closest('.mobile-modal-content')?.scrollTo(0, 0);
};
