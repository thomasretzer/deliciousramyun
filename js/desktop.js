// Window elements and dock items
const windows = {
    youtube: { el: document.getElementById('youtubeWindow'),  dock: document.getElementById('youtubeDock') },
    music:   { el: document.getElementById('musicWindow'),    dock: document.getElementById('musicDock') },
    about:   { el: document.getElementById('aboutWindow'),    dock: null },
    photos:  { el: document.getElementById('photosWindow'),   dock: document.getElementById('photosIcon') },
    video2:  { el: document.getElementById('videoWindow2'),   dock: null },
    notes:   { el: document.getElementById('notesWindow'),    dock: document.getElementById('notesIcon') },
};

// Called from inline onclick attributes on mac buttons
function handleWindowAction(windowName, action) {
    const { el: windowEl, dock: dockEl } = windows[windowName];
    if (!windowEl) return;

    if (action === 'close') {
        windowEl.classList.add('closed');
        if (dockEl) dockEl.classList.remove('active');
    } else if (action === 'minimize') {
        windowEl.classList.add('minimized');
    }
}

// ==================== DRAGGABLE WINDOWS ====================

function makeDraggable(windowEl) {
    let isDragging = false;
    let initialX, initialY;
    const titleBar = windowEl.querySelector('.title-bar');

    titleBar.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target.classList.contains('mac-button')) return;
        if (!titleBar.contains(e.target) && e.target !== titleBar) return;
        const rect = windowEl.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;
        isDragging = true;
        windowEl.classList.add('dragging');
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.clientX - initialX;
        const y = Math.max(28, e.clientY - initialY);
        windowEl.style.right = 'auto';
        windowEl.style.left = x + 'px';
        windowEl.style.top = y + 'px';
        windowEl.style.transform = 'none';
    }

    function dragEnd() {
        isDragging = false;
        windowEl.classList.remove('dragging');
    }
}

Object.values(windows).forEach(({ el }) => { if (el) makeDraggable(el); });

// ==================== WINDOW STACKING ====================

let zCounter = 10;

function bringWindowToFront(windowEl) {
    zCounter++;
    windowEl.style.zIndex = zCounter;
}

Object.values(windows).forEach(({ el }) => {
    if (el) el.addEventListener('mousedown', () => bringWindowToFront(el));
});

// ==================== DOCK CLICKS ====================

function setupDockToggle(dockId, windowName) {
    const dock = document.getElementById(dockId);
    if (!dock) return;
    dock.addEventListener('click', () => {
        const { el: win } = windows[windowName];
        if (win.classList.contains('minimized')) {
            win.classList.remove('minimized');
        } else if (win.classList.contains('closed')) {
            win.classList.remove('closed');
            dock.classList.add('active');
        }
    });
}

setupDockToggle('youtubeDock', 'youtube');
setupDockToggle('musicDock', 'music');

document.getElementById('photosIcon')?.addEventListener('click', () => {
    const { el: photosWin, dock: photosDock } = windows.photos;
    if (photosWin.classList.contains('minimized')) {
        photosWin.classList.remove('minimized');
    } else if (photosWin.classList.contains('closed')) {
        photosWin.classList.remove('closed');
        photosDock?.classList.add('active');
        photosWin.style.left = '20px';
        photosWin.style.top = '50px';
    }

    const { el: videoWin } = windows.video2;
    if (videoWin.classList.contains('closed')) {
        videoWin.classList.remove('closed');
        videoWin.style.right = '20px';
        videoWin.style.left = 'auto';
        videoWin.style.top = '50px';
        document.getElementById('mp4Video')?.play().catch(() => {});
    }
});

document.getElementById('notesIcon')?.addEventListener('click', () => {
    const { el: notesWin, dock: notesDock } = windows.notes;
    if (notesWin.classList.contains('minimized')) {
        notesWin.classList.remove('minimized');
    } else if (notesWin.classList.contains('closed')) {
        notesWin.classList.remove('closed');
        notesDock?.classList.add('active');
        notesWin.style.left = '50%';
        notesWin.style.top = '50%';
        notesWin.style.transform = 'translate(-50%, -50%)';
    }
});

document.getElementById('mailIcon')?.addEventListener('click', () => {
    window.location.href = 'mailto:deliciousramyun@gmail.com';
});

document.querySelector('.menu-bar-logo')?.addEventListener('click', () => {
    windows.about.el?.classList.remove('closed');
});

document.getElementById('trashIcon')?.addEventListener('click', () => {
    window.close();
});

// ==================== YOUTUBE PLAYER ====================

let player;
let progressInterval;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtubePlayer', {
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
        },
    });
}

function onPlayerReady() {
    updateYTVolume(50);
}

function onPlayerStateChange(event) {
    const icon = document.getElementById('ytPlayIcon');
    if (event.data === YT.PlayerState.PLAYING) {
        startProgressUpdate();
        if (icon) { icon.classList.remove('ph-play'); icon.classList.add('ph-pause'); }
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        stopProgressUpdate();
        if (icon) { icon.classList.remove('ph-pause'); icon.classList.add('ph-play'); }
    }
}

function startProgressUpdate() {
    progressInterval = setInterval(() => {
        if (!player?.getDuration) return;
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        const percent = duration > 0 ? (current / duration) * 100 : 0;
        const progressFill = document.getElementById('ytProgressFill');
        const progressKnob = document.getElementById('ytProgressKnob');
        const timeCurrent = document.getElementById('ytTimeCurrent');
        const timeTotal = document.getElementById('ytTimeTotal');
        if (progressFill) progressFill.style.width = percent + '%';
        if (progressKnob) progressKnob.style.left = percent + '%';
        if (timeCurrent) timeCurrent.textContent = formatTime(current);
        if (timeTotal) timeTotal.textContent = formatTime(duration);
    }, 100);
}

function stopProgressUpdate() {
    clearInterval(progressInterval);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

if (typeof YT !== 'undefined' && YT.Player) {
    onYouTubeIframeAPIReady();
}

// YouTube Controls

document.getElementById('ytPlayBtn')?.addEventListener('click', () => {
    if (!player) return;
    const state = player.getPlayerState?.();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
});

document.getElementById('ytMuteBtn')?.addEventListener('click', () => {
    if (!player) return;
    const icon = document.getElementById('ytSpeakerIcon');
    if (player.isMuted?.()) {
        player.unMute();
        if (icon) { icon.classList.remove('ph-speaker-slash'); icon.classList.add('ph-speaker-high'); }
    } else {
        player.mute();
        if (icon) { icon.classList.remove('ph-speaker-high'); icon.classList.add('ph-speaker-slash'); }
    }
});

document.getElementById('ytRewindBtn')?.addEventListener('click', () => {
    if (player?.getCurrentTime) player.seekTo(Math.max(0, player.getCurrentTime() - 10));
});

document.getElementById('ytForwardBtn')?.addEventListener('click', () => {
    if (player?.getCurrentTime) player.seekTo(Math.min(player.getDuration(), player.getCurrentTime() + 10));
});

document.getElementById('ytProgressBar')?.addEventListener('click', (e) => {
    if (!player?.getDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    player.seekTo(player.getDuration() * ((e.clientX - rect.left) / rect.width));
});

// YouTube Volume

function updateYTVolume(percent) {
    player?.setVolume?.(percent);
    const volumeFill = document.getElementById('ytVolumeFill');
    const volumeKnob = document.getElementById('ytVolumeKnob');
    if (volumeFill) volumeFill.style.width = percent + '%';
    if (volumeKnob) volumeKnob.style.left = percent + '%';
}

let isDraggingVolume = false;
const ytVolumeSlider = document.getElementById('ytVolumeSlider');

ytVolumeSlider?.addEventListener('mousedown', (e) => {
    isDraggingVolume = true;
    const rect = e.currentTarget.getBoundingClientRect();
    updateYTVolume(Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))));
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingVolume) return;
    const slider = document.getElementById('ytVolumeSlider');
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    updateYTVolume(Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))));
});

document.addEventListener('mouseup', () => { isDraggingVolume = false; });

// ==================== SOUNDCLOUD WIDGET ====================

let scWidget;
let scDuration = 0;
let scProgressInterval;
let scMuted = false;
let scLastVolume = 80;

function formatSCTime(ms) {
    const total = Math.floor(ms / 1000);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function updateSCVolumeVisual(pct) {
    const fill = document.getElementById('scVolumeFill');
    const knob = document.getElementById('scVolumeKnob');
    if (fill) fill.style.width = pct + '%';
    if (knob) knob.style.left = pct + '%';
}

function initSoundCloud() {
    const iframe = document.getElementById('soundcloudPlayer');
    if (!iframe || typeof SC === 'undefined') return;

    scWidget = SC.Widget(iframe);

    scWidget.bind(SC.Widget.Events.READY, function () {
        scWidget.setVolume(scLastVolume);
        updateSCVolumeVisual(scLastVolume);
        scWidget.getCurrentSound(function (sound) {
            if (!sound) return;
            const titleEl = document.getElementById('scTrackTitle');
            const artistEl = document.getElementById('scTrackArtist');
            const artworkEl = document.getElementById('scArtwork');
            if (titleEl) titleEl.textContent = sound.title || 'Unknown Track';
            if (artistEl) artistEl.textContent = (sound.user && sound.user.username) ? sound.user.username : 'delicious ramyun';
            if (artworkEl && sound.artwork_url) {
                artworkEl.src = sound.artwork_url.replace('-large', '-t500x500');
            }
        });
        scWidget.getDuration(function (d) {
            scDuration = d;
            const el = document.getElementById('scTimeTotal');
            if (el) el.textContent = formatSCTime(d);
        });
    });

    scWidget.bind(SC.Widget.Events.PLAY, function () {
        const icon = document.getElementById('scPlayIcon');
        if (icon) { icon.classList.remove('ph-play'); icon.classList.add('ph-pause'); }
        clearInterval(scProgressInterval);
        scProgressInterval = setInterval(function () {
            scWidget.getPosition(function (pos) {
                if (!scDuration) return;
                const pct = (pos / scDuration) * 100;
                const fill = document.getElementById('scProgressFill');
                const knob = document.getElementById('scProgressKnob');
                const cur = document.getElementById('scTimeCurrent');
                if (fill) fill.style.width = pct + '%';
                if (knob) knob.style.left = pct + '%';
                if (cur) cur.textContent = formatSCTime(pos);
            });
        }, 250);
    });

    scWidget.bind(SC.Widget.Events.PAUSE, function () {
        const icon = document.getElementById('scPlayIcon');
        if (icon) { icon.classList.remove('ph-pause'); icon.classList.add('ph-play'); }
        clearInterval(scProgressInterval);
    });

    scWidget.bind(SC.Widget.Events.FINISH, function () {
        const icon = document.getElementById('scPlayIcon');
        if (icon) { icon.classList.remove('ph-pause'); icon.classList.add('ph-play'); }
        clearInterval(scProgressInterval);
    });
}

if (typeof SC !== 'undefined') {
    initSoundCloud();
} else {
    const scScript = document.createElement('script');
    scScript.src = 'https://w.soundcloud.com/player/api.js';
    scScript.onload = initSoundCloud;
    document.head.appendChild(scScript);
}

document.getElementById('scPlayBtn')?.addEventListener('click', () => scWidget?.toggle());

document.getElementById('scMuteBtn')?.addEventListener('click', () => {
    if (!scWidget) return;
    const icon = document.getElementById('scSpeakerIcon');
    if (scMuted) {
        scWidget.setVolume(scLastVolume);
        updateSCVolumeVisual(scLastVolume);
        if (icon) { icon.classList.remove('ph-speaker-slash'); icon.classList.add('ph-speaker-high'); }
        scMuted = false;
    } else {
        scWidget.getVolume(function (v) { if (v > 0) scLastVolume = v; });
        scWidget.setVolume(0);
        updateSCVolumeVisual(0);
        if (icon) { icon.classList.remove('ph-speaker-high'); icon.classList.add('ph-speaker-slash'); }
        scMuted = true;
    }
});

document.getElementById('scRewindBtn')?.addEventListener('click', () => {
    if (!scWidget) return;
    scWidget.getPosition(function (pos) { scWidget.seekTo(Math.max(0, pos - 10000)); });
});

document.getElementById('scForwardBtn')?.addEventListener('click', () => {
    if (!scWidget) return;
    scWidget.getPosition(function (pos) { scWidget.seekTo(Math.min(scDuration, pos + 10000)); });
});

document.getElementById('scProgressBar')?.addEventListener('click', (e) => {
    if (!scWidget || !scDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    scWidget.seekTo(Math.round(((e.clientX - rect.left) / rect.width) * scDuration));
});

const scVolumeSlider = document.getElementById('scVolumeSlider');
let isDraggingSCVolume = false;

scVolumeSlider?.addEventListener('mousedown', (e) => {
    isDraggingSCVolume = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    if (scWidget) scWidget.setVolume(pct);
    updateSCVolumeVisual(pct);
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingSCVolume) return;
    const slider = document.getElementById('scVolumeSlider');
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    if (scWidget) scWidget.setVolume(pct);
    updateSCVolumeVisual(pct);
});

document.addEventListener('mouseup', () => { isDraggingSCVolume = false; });

// ==================== MENU BAR TIME ====================

function updateMenuBarTime() {
    const now = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = String(now.getMinutes()).padStart(2, '0');
    const menuBarTime = document.getElementById('menuBarTime');
    if (menuBarTime) menuBarTime.textContent = `${day} ${hours}:${mins} ${ampm}`;
}

updateMenuBarTime();
setInterval(updateMenuBarTime, 1000);
