// Tiny pixel-art toolkit shared by Cloud Hopper and the screensaver:
// sprites from text maps, and procedurally built pixel clouds.

(function (global) {
    function canvasOf(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    // Each character in `rows` is one pixel; '.' is transparent.
    function fromMap(rows, palette) {
        const canvas = canvasOf(rows[0].length, rows.length);
        const ctx = canvas.getContext('2d');
        rows.forEach((row, y) => {
            [...row].forEach((ch, x) => {
                if (ch === '.' || !palette[ch]) return;
                ctx.fillStyle = palette[ch];
                ctx.fillRect(x, y, 1, 1);
            });
        });
        return canvas;
    }

    const CLOUD_STYLES = {
        white:    { body: '#ffffff', shade1: '#c3dcff', shade2: '#86aee8' },
        moving:   { body: '#e4f8ff', shade1: '#a4e0f7', shade2: '#5fb6e0', accent: '#2f9ad6' },
        fragile:  { body: '#efe8f5', shade1: '#c7b8dc', shade2: '#9482b8', crack: '#7a68a0' },
        scenery:  { body: '#8fd0ff', shade1: '#8fd0ff', shade2: '#8fd0ff' },
        night:    { body: '#cdd7f2', shade1: '#8d9bd0', shade2: '#5c6bb0' },
    };

    const cloudCache = new Map();

    // A cloud `width` pixels wide and 9 tall: bumps on top (rows 0-2), body (3-6), shaded underside (7-8).
    // The walkable surface is row 3.
    function cloud(width, style = 'white') {
        const key = style + ':' + width;
        if (cloudCache.has(key)) return cloudCache.get(key);

        const colors = CLOUD_STYLES[style];
        const canvas = canvasOf(width, 9);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = colors.body;
        for (let bx = 3; bx + 8 <= width - 3; bx += 9) {
            ctx.fillRect(bx + 1, 0, 6, 1);
            ctx.fillRect(bx, 1, 8, 2);
        }
        ctx.fillRect(1, 3, width - 2, 1);
        ctx.fillRect(0, 4, width, 3);

        ctx.fillStyle = colors.shade1;
        ctx.fillRect(1, 7, width - 2, 1);
        ctx.fillStyle = colors.shade2;
        ctx.fillRect(2, 8, width - 4, 1);

        if (colors.accent) {
            ctx.fillStyle = colors.accent;
            ctx.fillRect(2, 5, 1, 1);
            ctx.fillRect(width - 3, 5, 1, 1);
        }
        if (colors.crack) {
            ctx.fillStyle = colors.crack;
            const mid = Math.floor(width / 2);
            ctx.fillRect(mid - 1, 3, 1, 1);
            ctx.fillRect(mid, 4, 1, 1);
            ctx.fillRect(mid - 1, 5, 1, 1);
            ctx.fillRect(mid, 6, 1, 1);
        }

        cloudCache.set(key, canvas);
        return canvas;
    }

    global.Pixel = { canvasOf, fromMap, cloud };
})(window);
