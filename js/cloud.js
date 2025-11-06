const cloudCursor = document.getElementById('cloudCursor');

document.addEventListener('mousemove', (e) => {
    cloudCursor.style.left = e.clientX + 10 + 'px';
    cloudCursor.style.top = e.clientY + 10 + 'px';
});

document.addEventListener('mouseleave', () => {
    cloudCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
    cloudCursor.style.opacity = '0.8';
});