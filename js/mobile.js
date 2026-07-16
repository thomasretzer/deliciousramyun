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
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = String(minutes).padStart(2, '0');
    const fullTimeStr = `${hours}:${mins} ${ampm}`;

    const mobileStatusTime = document.getElementById('mobileStatusTime');
    if (mobileStatusTime) mobileStatusTime.textContent = fullTimeStr;

    for (let i = 1; i <= 8; i++) {
        const el = document.getElementById(`mobileModalStatusTime${i}`);
        if (el) el.textContent = fullTimeStr;
    }
}

updateMobileTime();
setInterval(updateMobileTime, 1000);

// ==================== APP OPEN / CLOSE ====================

function openMobileApp(appName) {
    const id = 'mobileModal' + appName.charAt(0).toUpperCase() + appName.slice(1);
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.classList.add('active');
    document.querySelector('.mobile-dock-container')?.classList.add('hidden');
    document.querySelector('.mobile-home-button')?.classList.add('moved-down');

    if (appName === 'media') {
        setTimeout(() => fetchYouTubeVideoInfo('lF6hv4qAKxI'), 500);
    }
}

window.closeAllModals = function () {
    document.querySelectorAll('.mobile-app-modal').forEach(m => m.classList.remove('active'));
    document.querySelector('.mobile-dock-container')?.classList.remove('hidden');
    document.querySelector('.mobile-home-button')?.classList.remove('moved-down');
};

document.querySelectorAll('.mobile-app').forEach(app => {
    app.addEventListener('click', () => {
        const appName = app.getAttribute('data-app');
        if (appName) openMobileApp(appName);
    });
});

const mobileHomeButton = document.querySelector('.mobile-home-button');
if (mobileHomeButton) {
    mobileHomeButton.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); closeAllModals(); });
    mobileHomeButton.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); closeAllModals(); });
}

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
                    ? `<img src="${v.thumbnail}" style="width:100%;height:100%;object-fit:cover;">`
                    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:32px;">📺</div>`}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;line-height:1.3;margin-bottom:4px;color:#0f0f0f;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                    ${v.title}
                </div>
                <div style="font-size:11px;color:#606060;">${channelName || 'delicious ramyun'}</div>
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
