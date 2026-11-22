// Cloud Hopper: a one-finger endless jumper in 8-bit style. Steer with the pointer (or arrow
// keys / A, D), hop between clouds, grab ramen bowls. The game runs on a tiny 160x240 canvas that
// is scaled up in whole-number steps so every pixel stays crisp. Each canvas gets its own instance
// and only runs while it is on screen.

(function (global) {
    const W = 160;
    const H = 240;
    const PLAYER_R = 6;
    const GRAVITY = 0.21;           // per frame at 60fps
    const JUMP = 5.7;               // apex is roughly 77px
    const SCROLL_LINE = H * 0.42;
    const GROUND_Y = H - 24;
    const FONT = "8px 'Press Start 2P', monospace";
    const instances = new Set();

    const SKY = ['#2a7de1', '#3d8ef0', '#58a2f7', '#74b6fb', '#92c9fd', '#b3dcff'];

    const PLAYER_MAP = [
        '...KKKKKK...',
        '..KyyyyyyK..',
        '.KyyyyyyyyK.',
        'KyyyyyyyyyyK',
        'KyydyyyydyyK',
        'KyydyyyydyyK',
        'KyyyyyyyyyyK',
        'KydyyyyyydyK',
        'KyyddddddyyK',
        'KooyyyyyyooK',
        '.KooooooooK.',
        '..KKKKKKKK..',
    ];
    const PLAYER_PALETTE = { K: '#3a2a00', y: '#ffe94d', o: '#e6b800', d: '#3a2a00' };

    const BOWL_FRAMES = [
        ['...w..w...', '..w..w....', '.KKKKKKKK.', 'KyyyyyyyyK', 'KyoyoyoyyK', 'KrrrrrrrrK', '.KrrrrrrK.', '..KrrrrK..', '...KKKK...'],
        ['..w..w....', '...w..w...', '.KKKKKKKK.', 'KyyyyyyyyK', 'KyoyoyoyyK', 'KrrrrrrrrK', '.KrrrrrrK.', '..KrrrrK..', '...KKKK...'],
    ];
    const BOWL_PALETTE = { K: '#3a1a1a', y: '#ffe28a', o: '#e0b050', r: '#ff5a4a', w: '#ffffff' };

    let sprites = null;

    function buildSprites() {
        if (sprites) return sprites;
        sprites = {
            player: Pixel.fromMap(PLAYER_MAP, PLAYER_PALETTE),
            bowls: BOWL_FRAMES.map(rows => Pixel.fromMap(rows, BOWL_PALETTE)),
        };
        return sprites;
    }

    function readBest() {
        try { return Number(localStorage.getItem('hopperBest')) || 0; } catch { return 0; }
    }

    function writeBest(value) {
        try { localStorage.setItem('hopperBest', String(value)); } catch {}
    }

    function create(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        canvas.width = W;
        canvas.height = H;
        canvas.style.touchAction = 'none';
        buildSprites();

        const coarse = global.matchMedia('(pointer: coarse)').matches;
        const verb = coarse ? 'TAP' : 'CLICK';

        let state = 'ready';        // ready | playing | paused | over
        let wanted = false;         // the host window/sheet is showing us
        let running = false;        // the frame loop is ticking
        let raf = 0;
        let last = 0;
        let tick = 0;
        let keyDir = 0;
        let best = readBest();
        let newBest = false;
        let player, platforms, scenery, popups, particles, climbed, bowls, score;

        // Whole-number scale only, so pixels never blur or shimmer
        function fit() {
            const parent = canvas.parentElement;
            if (!parent) return;
            let scale = Math.floor(parent.clientWidth / W);
            if (canvas.dataset.fit === 'contain') scale = Math.floor(Math.min(parent.clientWidth / W, parent.clientHeight / H));
            scale = Math.max(1, scale);
            canvas.style.width = W * scale + 'px';
            canvas.style.height = H * scale + 'px';
        }

        function difficulty() {
            return Math.min(1, climbed / 2000);
        }

        function makePlatform(y, previousType) {
            const d = difficulty();
            const w = Math.round((31 - d * 9 + Math.random() * 4) / 2) * 2;
            let type = 'normal';
            if (climbed > 400 && Math.random() < 0.15 + d * 0.25) type = 'moving';
            else if (climbed > 750 && previousType !== 'fragile' && Math.random() < 0.14) type = 'fragile';
            return {
                x: Math.round(Math.random() * (W - w)),
                y,
                w,
                type,
                dir: Math.random() < 0.5 ? -1 : 1,
                speed: 0.3 + d * 0.45,
                broken: false,
                fade: 1,
                bowl: type === 'normal' && Math.random() < 0.13,
            };
        }

        function nextGap() {
            return 26 + Math.random() * (17 + difficulty() * 13);   // always well under the jump height
        }

        function reset() {
            climbed = 0;
            bowls = 0;
            score = 0;
            newBest = false;
            popups = [];
            particles = [];
            player = { x: W / 2, y: GROUND_Y - 20, vy: -JUMP, targetX: W / 2, squash: 0 };
            platforms = [{ x: 0, y: GROUND_Y, w: W, type: 'ground', broken: false, fade: 1, bowl: false }];
            let y = GROUND_Y;
            let previous = 'ground';
            while (y > -30) {
                y -= nextGap();
                const p = makePlatform(y, previous);
                previous = p.type;
                platforms.push(p);
            }
            scenery = Array.from({ length: 4 }, (_, i) => ({
                x: Math.random() * W,
                y: (i / 4) * H,
                w: 30 + Math.round(Math.random() * 15) * 2,
                depth: 0.15 + Math.random() * 0.25,
                drift: 0.03 + Math.random() * 0.04,
            }));
        }

        function gameOver() {
            state = 'over';
            if (score > best) {
                best = score;
                newBest = true;
                writeBest(best);
            }
        }

        function activate() {
            if (state === 'over') reset();
            if (state === 'ready' || state === 'paused' || state === 'over') state = 'playing';
        }

        function burst(x, y) {
            if (Motion.reduced()) return;
            for (let i = 0; i < 5; i++) {
                particles.push({ x, y, vx: (Math.random() - 0.5) * 2.4, vy: -0.3 - Math.random() * 1.2, life: 1 });
            }
        }

        function step(dt) {
            const prevBottom = player.y + PLAYER_R;
            if (keyDir) player.targetX = Motion.clamp(player.targetX + keyDir * 3.5 * dt, PLAYER_R, W - PLAYER_R);
            player.x += (player.targetX - player.x) * Math.min(1, 0.35 * dt);
            player.vy += GRAVITY * dt;
            player.y += player.vy * dt;
            player.squash = Math.max(0, player.squash - 0.08 * dt);

            for (const p of platforms) {
                if (p.type === 'moving') {
                    p.x += p.dir * p.speed * dt;
                    if (p.x < 0 || p.x + p.w > W) {
                        p.dir *= -1;
                        p.x = Motion.clamp(p.x, 0, W - p.w);
                    }
                }
                if (p.broken) p.fade -= 0.05 * dt;
            }

            if (player.vy > 0) {
                const bottom = player.y + PLAYER_R;
                for (const p of platforms) {
                    if (p.broken) continue;
                    if (prevBottom <= p.y + 2 && bottom >= p.y && player.x > p.x - 3 && player.x < p.x + p.w + 3) {
                        player.y = p.y - PLAYER_R;
                        player.vy = -JUMP;
                        player.squash = Motion.reduced() ? 0 : 1;
                        burst(player.x, p.y);
                        if (p.type === 'fragile') p.broken = true;
                        break;
                    }
                }
            }

            for (const p of platforms) {
                if (!p.bowl) continue;
                const bx = p.x + p.w / 2;
                const by = p.y - 12;
                if (Math.hypot(player.x - bx, player.y - by) < PLAYER_R + 6) {
                    p.bowl = false;
                    bowls++;
                    popups.push({ x: bx, y: by, text: '+50', life: 1 });
                }
            }

            if (player.y < SCROLL_LINE) {
                const dy = SCROLL_LINE - player.y;
                player.y = SCROLL_LINE;
                climbed += dy;
                for (const p of platforms) p.y += dy;
                for (const pop of popups) pop.y += dy;
                for (const part of particles) part.y += dy;
                for (const s of scenery) s.y += dy * s.depth;
            }

            platforms = platforms.filter(p => p.y < H + 15 && p.fade > -1);
            let top = Math.min(...platforms.map(p => p.y));
            let previous = 'normal';
            while (top > -20) {
                top -= nextGap();
                const p = makePlatform(top, previous);
                previous = p.type;
                platforms.push(p);
            }

            for (const s of scenery) {
                if (!Motion.reduced()) s.x += s.drift * dt;
                if (s.x > W + 20) s.x = -s.w - 10;
                if (s.y > H + 20) { s.y = -20; s.x = Math.random() * W; }
            }

            for (const part of particles) {
                part.x += part.vx * dt;
                part.y += part.vy * dt;
                part.vy += 0.1 * dt;
                part.life -= 0.07 * dt;
            }
            particles = particles.filter(part => part.life > 0);

            for (const pop of popups) {
                pop.y -= 0.3 * dt;
                pop.life -= 0.02 * dt;
            }
            popups = popups.filter(pop => pop.life > 0);

            score = Math.floor(climbed / 4) + bowls * 50;
            if (player.y - PLAYER_R > H + 10) gameOver();
        }

        // ---------- drawing ----------

        function text(str, x, y, color, align = 'left') {
            ctx.textAlign = align;
            ctx.fillStyle = '#0b1233';
            ctx.fillText(str, x + 1, y + 1);
            ctx.fillStyle = color;
            ctx.fillText(str, x, y);
        }

        function panel(x, y, w, h) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 2, y, w + 4, h);
            ctx.fillRect(x, y - 2, w, h + 4);
            ctx.fillStyle = '#16224a';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#2d4296';
            ctx.fillRect(x + 2, y + 2, w - 4, 1);
        }

        function drawSky() {
            const band = H / SKY.length;
            SKY.forEach((color, i) => {
                ctx.fillStyle = color;
                ctx.fillRect(0, Math.round(i * band), W, Math.ceil(band) + 1);
            });
            // Checkerboard dither where one band melts into the next
            for (let i = 1; i < SKY.length; i++) {
                const y = Math.round(i * band);
                ctx.fillStyle = SKY[i];
                for (let x = 0; x < W; x += 2) {
                    ctx.fillRect(x, y - 2, 1, 1);
                    ctx.fillRect(x + 1, y - 1, 1, 1);
                }
            }
        }

        function drawGround(p) {
            ctx.fillStyle = '#ffffff';
            for (let x = -4; x < W; x += 16) {
                ctx.fillRect(x + 2, p.y - 2, 10, 2);
                ctx.fillRect(x, p.y, 14, 4);
            }
            ctx.fillRect(0, p.y + 4, W, 4);
            // Cloud bank deepening into shadow, in hard bands like everything else
            ctx.fillStyle = '#c3dcff';
            ctx.fillRect(0, p.y + 8, W, 4);
            ctx.fillStyle = '#86aee8';
            ctx.fillRect(0, p.y + 12, W, 4);
            ctx.fillStyle = '#5a86d4';
            ctx.fillRect(0, p.y + 16, W, H);
        }

        function drawPlayer() {
            let w = 12;
            let h = 12;
            if (player.squash > 0.5) { w = 14; h = 10; }
            else if (player.vy < -2) { w = 10; h = 14; }
            else if (player.vy > 3) { w = 11; h = 13; }
            const x = Math.round(player.x - w / 2);
            const y = Math.round(player.y + PLAYER_R - h);
            ctx.drawImage(sprites.player, x, y, w, h);
        }

        function banner(lines) {
            const lineH = 14;
            const h = lines.length * lineH + 18;
            const y = Math.round(H / 2 - h / 2);
            panel(12, y, W - 24, h);
            lines.forEach(([str, color, blink], i) => {
                if (blink && Math.floor(tick / 30) % 2) return;
                text(str, W / 2, y + 11 + i * lineH, color, 'center');
            });
        }

        function pad(n) {
            return String(n).padStart(4, '0');
        }

        function draw() {
            drawSky();

            for (const s of scenery) {
                ctx.drawImage(Pixel.cloud(s.w, 'scenery'), Math.round(s.x), Math.round(s.y));
            }

            for (const p of platforms) {
                if (p.type === 'ground') {
                    drawGround(p);
                    continue;
                }
                const blinkOff = p.broken && Math.floor(p.fade * 10) % 2 === 0;
                if (!blinkOff && p.fade > 0) {
                    ctx.drawImage(Pixel.cloud(p.w, p.type === 'normal' ? 'white' : p.type), Math.round(p.x), Math.round(p.y) - 3);
                }
                if (p.bowl) {
                    const frame = sprites.bowls[Math.floor(tick / 20) % 2];
                    ctx.drawImage(frame, Math.round(p.x + p.w / 2 - 5), Math.round(p.y - 14 + (Math.floor(tick / 20) % 2)));
                }
            }

            ctx.fillStyle = '#ffffff';
            for (const part of particles) {
                ctx.globalAlpha = Motion.clamp(part.life, 0, 1);
                ctx.fillRect(Math.round(part.x), Math.round(part.y), 2, 2);
            }
            ctx.globalAlpha = 1;

            drawPlayer();

            ctx.font = FONT;
            ctx.textBaseline = 'top';
            for (const pop of popups) {
                ctx.globalAlpha = Motion.clamp(pop.life * 2, 0, 1);
                text(pop.text, Math.round(pop.x), Math.round(pop.y), '#ffe94d', 'center');
            }
            ctx.globalAlpha = 1;

            text(pad(score), 4, 4, '#ffffff');
            text('HI ' + pad(Math.max(best, score)), W - 4, 4, '#ffe94d', 'right');

            if (state === 'ready') {
                banner([['CLOUD HOPPER', '#ffe94d'], ['MOVE TO STEER', '#ffffff'], [verb + ' TO PLAY', '#9fd0ff', true]]);
            } else if (state === 'paused') {
                banner([['PAUSED', '#ffe94d'], [verb + ' TO GO ON', '#9fd0ff', true]]);
            } else if (state === 'over') {
                banner([
                    ['GAME OVER', '#ff7a59'],
                    ['SCORE ' + pad(score), '#ffffff'],
                    [newBest ? 'NEW BEST!' : 'BEST ' + pad(best), newBest ? '#ffe94d' : '#9fd0ff'],
                    [verb + ' TO RETRY', '#9fd0ff', true],
                ]);
            }
        }

        // ---------- loop ----------

        function frame(now) {
            if (!running) return;
            const dt = Math.min((now - last) / 16.667, 2.5);
            last = now;
            tick += dt;
            if (state === 'playing') step(dt);
            draw();
            raf = requestAnimationFrame(frame);
        }

        function startLoop() {
            if (running) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }

        function stopLoop() {
            running = false;
            cancelAnimationFrame(raf);
            if (state === 'playing') state = 'paused';
            draw();
        }

        function resume() {
            wanted = true;
            fit();
            if (!document.hidden) startLoop();
        }

        function pause() {
            wanted = false;
            stopLoop();
        }

        // ---------- input ----------

        function aim(e) {
            const rect = canvas.getBoundingClientRect();
            player.targetX = Motion.clamp(((e.clientX - rect.left) / rect.width) * W, PLAYER_R, W - PLAYER_R);
        }

        canvas.addEventListener('pointerdown', e => {
            aim(e);
            activate();
        });
        canvas.addEventListener('pointermove', aim);

        document.addEventListener('keydown', e => {
            if (!running) return;
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyDir = -1; e.preventDefault(); }
            else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyDir = 1; e.preventDefault(); }
            else if (e.key === ' ' || e.key === 'Enter') { activate(); e.preventDefault(); }
        });
        document.addEventListener('keyup', e => {
            if ((keyDir === -1 && (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A')) ||
                (keyDir === 1 && (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'))) keyDir = 0;
        });

        // Don't burn battery in a background tab; come back paused, not mid-fall
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopLoop();
            else if (wanted) startLoop();
        });

        global.addEventListener('resize', fit);

        // The pixel font may arrive after the first frame
        if (document.fonts?.load) document.fonts.load(FONT).then(() => { if (!running) draw(); });

        reset();
        fit();
        draw();

        const instance = {
            resume,
            pause,
            get state() { return state; },
            get score() { return score; },
            get running() { return running; },
            debug() { return { player, platforms }; },
        };
        instances.add(instance);
        return instance;
    }

    function isPlaying() {
        return [...instances].some(i => i.running && i.state === 'playing');
    }

    global.CloudHopper = { create, isPlaying };
})(window);
