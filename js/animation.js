// Slow down background videos
const bgVideo = document.querySelector('.video-background');
if (bgVideo) {
    bgVideo.playbackRate = 0.5; // adjust speed here
}

const menuVideo = document.querySelector('.menu-video-background');
if (menuVideo) {
    menuVideo.playbackRate = 0.5;
}