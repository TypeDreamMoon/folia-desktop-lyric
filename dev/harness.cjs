// dev/harness.cjs
// 离线验证：不启动 Folia，直接用 main.cjs 的真实代码去开那扇歌词窗，喂进假的状态快照，
// 截图或跑探针，然后退出。
//
//   npx electron dev/harness.cjs                   单行 + 截图到 dev/shot-single.png
//   npx electron dev/harness.cjs double|board      双行 / 歌词板
//   npx electron dev/harness.cjs --hover           带上 hover 控制条
//   npx electron dev/harness.cjs --preview         生成 assets/preview.png（模组介绍图）
//   npx electron dev/harness.cjs --drag            自建拖动：窗口位移应当等于指针位移
//   npx electron dev/harness.cjs --lockprobe       穿透 / 锁定位置 / 忽略鼠标
//   npx electron dev/harness.cjs --cmdprobe        窗口按钮 → main → client 的命令链路
//   npx electron dev/harness.cjs --fonts           字体枚举 rpc
//   npx electron dev/harness.cjs --panel           字体选择器截图（独立窗口）
//
// 环境变量：FOLIUM_MINOR / LOCK / LOCKPOS / IGNOREHOVER / HEADER_MODE / ALIGN / VP / WEIGHT /
// TRAN / FADE / SUBOP / TRACK / ROMA / FONTSIZE / FONTFAMILY / FONTLATIN / FONTCJK /
// FONTFALLBACK / BG / BG_ALPHA / RADIUS / PAUSED / PAUSED_OPACITY / SPRING_MASS / SPRING_STIFF /
// SPRING_DAMP / HIDENOLYRIC

'use strict';

const path = require('path');
const nodeFs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');

let activate;
try {
    activate = require(path.join(__dirname, '..', 'dist', 'amll-desktop-lyric', 'main.cjs'));
} catch (error) {
    console.error('[harness] 先跑 npm run build：', error.message);
    process.exit(1);
}

const ARGS = process.argv.slice(1);
const has = (flag) => ARGS.includes(flag);
const env = (name, fallback) => process.env[name] || fallback;
const num = (name, fallback) => Number(process.env[name] || fallback);

const mode = has('board') || has('multi') ? 'board' : has('double') ? 'double' : 'single';

const store = {};
const handlers = {};
const harnessApi = {};

// ---------------------------------------------------------------- 假歌词

const buildLine = (text, start, words, translated) => ({
    x: text,
    t: start,
    e: start + words.reduce((sum, word) => sum + word[2], 0),
    tr: translated || '',
    ro: '',
    bg: 0,
    d: 0,
    w: words.map(([w, s, d]) => ({ w, s, e: s + d })),
});

const rawLines = [
    buildLine(
        '夜色漫过城市的边缘',
        12000,
        [
            ['夜色', 12000, 520],
            ['漫过', 12520, 480],
            ['城市', 13000, 460],
            ['的', 13460, 180],
            ['边缘', 13640, 700],
        ],
        'Night spills over the edge of the city',
    ),
    buildLine(
        '我把耳机音量调到最大',
        16000,
        [
            ['我', 16000, 220],
            ['把', 16220, 200],
            ['耳机', 16420, 420],
            ['音量', 16840, 420],
            ['调到', 17260, 380],
            ['最大', 17640, 520],
        ],
        'I turn the headphones all the way up',
    ),
    buildLine(
        '让鼓点盖住心跳的声音',
        19000,
        [
            ['让', 19000, 200],
            ['鼓点', 19200, 420],
            ['盖住', 19620, 400],
            ['心跳', 20020, 420],
            ['的', 20440, 160],
            ['声音', 20600, 640],
        ],
        'Let the drums drown out my heartbeat',
    ),
    buildLine(
        '这一刻世界只剩下我们',
        22000,
        [
            ['这', 22000, 180],
            ['一刻', 22180, 380],
            ['世界', 22560, 420],
            ['只', 22980, 160],
            ['剩下', 23140, 380],
            ['我们', 23520, 680],
        ],
        'In this moment only we are left',
    ),
];

const lines =
    env('ALIGN') === 'both' ? rawLines.map((line, index) => ({ ...line, d: index % 2 })) : rawLines;

const snapshot = (positionSec, state = 'playing') => ({
    title: '夜航',
    artist: 'Harness',
    album: 'dev',
    state,
    position: positionSec,
    duration: 240,
    lines,
    linesVersion: 1,
    theme: { color: '#ffffff', background: '#141320', fontStack: "'Segoe UI', sans-serif" },
});

const settingsPayload = () => ({
    mode,
    fontSize: num('FONTSIZE', 30),
    opacity: 0.95,
    showTranslation: true,
    showRomanization: env('ROMA') === '1',
    align: env('ALIGN', 'center'),
    verticalPosition: num('VP', 0.5),
    fontWeight: num('WEIGHT', 400),
    translationScale: num('TRAN', 0.5),
    translationOpacity: num('SUBOP', 0.3),
    letterSpacing: num('TRACK', 0),
    wordFadeWidth: num('FADE', 1),
    enableSpring: true,
    blurUpcoming: true,
    hidePassedLines: false,
    springMass: num('SPRING_MASS', 1),
    springStiffness: num('SPRING_STIFF', 100),
    springDamping: num('SPRING_DAMP', 10),
    backgroundMode: env('BG', 'color'),
    backgroundOpacity: num('BG_ALPHA', 0.45),
    backgroundColor: '#0b0b10',
    cornerRadius: num('RADIUS', 12),
    border: true,
    playedColor: '#ffffff',
    unplayedOpacity: num('UNPLAYED', 0.5),
    shadowColor: '#000000',
    textBackgroundMask: false,
    backgroundMaskColor: '#000000',
    alwaysShowPlayInfo: true,
    followTheme: false,
    fontFamily: env('FONTFAMILY', ''),
    fontLatin: env('FONTLATIN', ''),
    fontCjk: env('FONTCJK', ''),
    fontFallback: env('FONTFALLBACK', 'sans-serif'),
    headerMode: env('HEADER_MODE', 'hover'),
    wheelFontSize: false,
    hideWithoutLyrics: env('HIDENOLYRIC') === '1',
    skipTaskbar: true,
    pausedOpacity: num('PAUSED_OPACITY', 1),
    alwaysOnTop: true,
    lock: env('LOCK') === '1',
    ignoreHover: env('IGNOREHOVER') === '1',
    lockPosition: env('LOCKPOS') === '1',
});

// ---------------------------------------------------------------- 启动

const shoot = async (win, name) => {
    const image = await win.webContents.capturePage();
    const file = path.join(__dirname, name);
    nodeFs.writeFileSync(file, image.toPNG());
    console.log('[harness]', file, image.getSize());
    return file;
};

const fire = (win, script) => win.webContents.executeJavaScript(script);

const clickPlay = (win) =>
    fire(
        win,
        `(() => {
            const button = document.getElementById('playpause');
            for (const type of ['pointerdown', 'pointerup', 'click']) {
                button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
            }
        })()`,
    );

app.whenReady().then(async () => {
    activate(
        Object.assign(harnessApi, {
            manifest: { id: 'amll-desktop-lyric' },
            host: { folia: '0.7.22', folium: { major: 1, minor: num('FOLIUM_MINOR', 7) } },
            log: { info: () => {}, warn: console.warn, error: console.error },
            storage: {
                get: async (key) => store[key],
                set: async (key, value) => {
                    store[key] = value;
                },
                has: async (key) => key in store,
                delete: async (key) => {
                    delete store[key];
                },
                keys: async () => Object.keys(store),
                paths: {
                    get cache() {
                        return path.join(os.tmpdir(), 'amll-desktop-lyric-harness');
                    },
                    get data() {
                        return path.join(os.tmpdir(), 'amll-desktop-lyric-harness-data');
                    },
                },
            },
            rpc: {
                handle: (name, fn) => {
                    handlers[name] = fn;
                },
                send: () => {},
            },
            onDispose: () => {},
        }),
    );

    // 字体选择器单独一扇窗，不需要歌词窗。
    if (has('--panel')) {
        const panelWin = new BrowserWindow({ width: 720, height: 620, show: true });
        await panelWin.loadFile(path.join(__dirname, 'panel.html'));
        setTimeout(async () => {
            await fire(panelWin, `(() => {
                const button = document.querySelectorAll('.dlf-btn')[0];
                if (button) button.click();
                return Boolean(button);
            })()`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await shoot(panelWin, 'shot-panel.png');
            app.exit(0);
        }, 1600);
        setTimeout(() => {
            console.error('[panel] 超时');
            app.exit(2);
        }, 15000);
        return;
    }

    handlers.settings(settingsPayload());
    handlers.toggle();

    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
        console.error('[harness] 没有开出来的窗口');
        app.exit(1);
        return;
    }
    win.setAlwaysOnTop(false);
    win.setPosition(120, 160);

    // 第 17.2 秒落在第二句中间，逐字渐变看得出来。
    setTimeout(() => handlers.state(snapshot(17.2, env('PAUSED') === '1' ? 'paused' : 'playing')), 900);

    if (has('--fonts')) {
        setTimeout(async () => {
            const list = await handlers.fonts();
            console.log('[fonts]', Array.isArray(list) ? list.length : 'not-an-array', (list || []).slice(0, 6).join(' | '));
            app.exit(0);
        }, 800);
        return;
    }

    if (has('--cmdprobe')) {
        setTimeout(async () => {
            const sent = [];
            const originalSend = harnessApi.rpc.send;
            harnessApi.rpc.send = (name, payload) => {
                sent.push({ name, payload });
            };
            await clickPlay(win);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const take = handlers['take-commands'];
            const queued = typeof take === 'function' ? await take() : 'NO take-commands HANDLER';
            harnessApi.rpc.send = originalSend;
            console.log('[cmdprobe]', JSON.stringify({ pushed: sent, queued }, null, 2));
            app.exit(0);
        }, 2200);
        setTimeout(() => {
            console.error('[cmdprobe] 超时');
            app.exit(2);
        }, 9000);
        return;
    }

    if (has('--drag')) {
        setTimeout(async () => {
            const before = win.getPosition();
            await fire(
                win,
                `(() => {
                    const stage = document.getElementById('stage');
                    const send = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, {
                        bubbles: true, cancelable: true, button: 0, pointerId: 1,
                        clientX: x, clientY: y, screenX: x, screenY: y,
                    }));
                    send('pointerdown', 400, 200);
                    for (let step = 1; step <= 6; step += 1) send('pointermove', 400 + step * 10, 200 + step * 5);
                    send('pointerup', 460, 230);
                })()`,
            );
            await new Promise((resolve) => setTimeout(resolve, 300));
            const after = win.getPosition();
            console.log('[drag] before', before, 'after', after, 'delta', after[0] - before[0], after[1] - before[1]);
            app.exit(0);
        }, 2400);
        return;
    }

    if (has('--lockprobe')) {
        setTimeout(async () => {
            const calls = [];
            const positions = [];
            const realIgnore = win.setIgnoreMouseEvents.bind(win);
            const realSetPosition = win.setPosition.bind(win);
            win.setIgnoreMouseEvents = (ignore, options) => {
                calls.push({ ignore, forward: Boolean(options && options.forward) });
                realIgnore(ignore, options);
            };
            win.setPosition = (...args) => {
                positions.push(args.slice(0, 2));
                realSetPosition(...args);
            };

            const moveTo = (x, y, type = 'pointermove') =>
                fire(
                    win,
                    `(() => {
                        const node = document.getElementById('stage');
                        node.dispatchEvent(new PointerEvent('${type}', {
                            bubbles: true, cancelable: true, button: 0, pointerId: 1,
                            clientX: ${x}, clientY: ${y}, screenX: ${x}, screenY: ${y},
                        }));
                        node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: ${x}, clientY: ${y} }));
                    })()`,
                );

            await moveTo(400, 100);
            await new Promise((resolve) => setTimeout(resolve, 150));
            const middle = calls[calls.length - 1] || 'no change (仍然穿透)';

            const rect = await fire(win, 'document.getElementById("lock").getBoundingClientRect().toJSON()');
            const lockX = Math.round(rect.x + rect.width / 2);
            const lockY = Math.round(rect.y + rect.height / 2);
            await moveTo(lockX, lockY);
            await new Promise((resolve) => setTimeout(resolve, 150));
            const onButton = calls[calls.length - 1];

            await moveTo(400, 100);
            await new Promise((resolve) => setTimeout(resolve, 150));
            const back = calls[calls.length - 1];

            handlers.settings({ ...settingsPayload(), lockPosition: true });
            await new Promise((resolve) => setTimeout(resolve, 150));
            const beforePin = positions.length;
            await moveTo(300, 100, 'pointerdown');
            await moveTo(340, 130, 'pointermove');
            await moveTo(340, 130, 'pointerup');
            await new Promise((resolve) => setTimeout(resolve, 250));
            const pinned = positions.slice(beforePin);

            handlers.settings({ ...settingsPayload(), lockPosition: false });
            await new Promise((resolve) => setTimeout(resolve, 150));
            const beforeFree = positions.length;
            await moveTo(300, 100, 'pointerdown');
            await moveTo(340, 130, 'pointermove');
            await moveTo(340, 130, 'pointerup');
            await new Promise((resolve) => setTimeout(resolve, 250));
            const free = positions.slice(beforeFree);

            handlers.settings({ ...settingsPayload(), lock: true, ignoreHover: true });
            await new Promise((resolve) => setTimeout(resolve, 150));
            await moveTo(lockX, lockY);
            await new Promise((resolve) => setTimeout(resolve, 150));
            const ignored = calls[calls.length - 1];

            console.log(
                '[lockprobe]',
                JSON.stringify(
                    {
                        middleHover: middle,
                        onLockButton: onButton,
                        movedBack: back,
                        lockedPos: settingsPayload().lock,
                        pinnedMoves: pinned.length,
                        unpinnedMoves: free.length,
                        ignoredHover: ignored,
                    },
                    null,
                    2,
                ),
            );
            app.exit(0);
        }, 2200);
        setTimeout(() => {
            console.error('[lockprobe] 超时');
            app.exit(2);
        }, 12000);
        return;
    }

    if (has('--preview')) {
        setTimeout(async () => {
            // 挑一句唱到一半的：介绍图上逐字高亮看得出来。
            handlers.state(snapshot(20.6));
            await fire(win, "document.body.classList.add('hover')");
            await new Promise((resolve) => setTimeout(resolve, 700));
            const shot = await win.webContents.capturePage();
            nodeFs.writeFileSync(path.join(__dirname, 'preview-shot.png'), shot.toPNG());

            // 贴到 1280×720 的「壁纸」上：模组市场要求介绍图接近 16:9、至少 640×360。
            const previewWin = new BrowserWindow({
                width: 1280,
                height: 720,
                show: true,
                frame: false,
                webPreferences: { nodeIntegration: false },
            });
            await previewWin.loadFile(path.join(__dirname, 'preview-composite.html'));
            await new Promise((resolve) => setTimeout(resolve, 400));
            const image = await previewWin.webContents.capturePage();
            nodeFs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
            const file = path.join(__dirname, '..', 'assets', 'preview.png');
            nodeFs.writeFileSync(file, image.toPNG());
            console.log('[harness] 介绍图:', file, image.getSize(), nodeFs.statSync(file).size, 'bytes');
            app.exit(0);
        }, 2600);
        setTimeout(() => {
            console.error('[preview] 超时');
            app.exit(2);
        }, 15000);
        return;
    }

    if (has('--hover')) {
        setTimeout(() => {
            void fire(win, "document.body.classList.add('hover')");
        }, 2400);
    }

    setTimeout(async () => {
        await shoot(win, `shot-${mode}${has('--hover') ? '-hover' : ''}.png`);
        app.exit(0);
    }, 3200);
});
