// src/window/renderer.js
// 歌词窗口的渲染端：AMLL 的 LyricPlayer 负责画，这里管三件事——把 main 推进来的快照铺成
// 时间轴（自己用 rAF 外推，不逐帧跨进程）、把设置映射成 CSS 变量与布局、把鼠标/按键动作
// 送回 main。窗口里没有 Node，也没有 Folia 的 API。

import { LayoutReason, LyricPlayer } from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import './style.css';

const bridge = window.deskLyric;
const body = document.body;
const appEl = document.getElementById('app');
const lyricHost = document.getElementById('lyric');
const placeholderEl = document.getElementById('placeholder');
const songEl = document.getElementById('song');
const lockEl = document.getElementById('lock');
const playPauseEl = document.getElementById('playpause');

const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const ICON_LOCKED = 'M12 2a5 5 0 0 0-5 5v3H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z';
const ICON_UNLOCKED = 'M12 2a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0v3H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5z';

const setIcon = (button, path) => {
    const node = button && button.querySelector('path');
    if (node) node.setAttribute('d', path);
};

// ---------------------------------------------------------------- AMLL

const player = new LyricPlayer();
player.getElement().style.height = '100%';
lyricHost.appendChild(player.getElement());
player.setAlignAnchor('center');
player.setAlignPosition(0.5);
player.setEnableSpring(true);
player.setEnableBlur(true);
player.setEnableScale(true);
player.setHidePassedLines(false);
// 1 = Apple Music Android 的渐变宽度；0.5 是 iPad 的效果。
player.setWordFadeWidth(1);
player.pause();
player.calcLayout(LayoutReason.ConfigChange);

// ---------------------------------------------------------------- 状态

let settings = {
    mode: 'single',
    fontSize: 30,
    backgroundMode: 'color',
    backgroundColor: '#0b0b10',
    backgroundOpacity: 0.45,
    cornerRadius: 12,
    border: true,
    showTranslation: true,
    showRomanization: false,
    align: 'center',
    verticalPosition: 0.5,
    wordFadeWidth: 1,
    fontWeight: 400,
    translationScale: 0.5,
    enableSpring: true,
    blurUpcoming: true,
    hidePassedLines: false,
    skipTaskbar: true,
    pausedOpacity: 1,
    playedColor: '#ffffff',
    unplayedOpacity: 0.5,
    shadowColor: '#000000',
    textBackgroundMask: false,
    backgroundMaskColor: '#000000',
    alwaysShowPlayInfo: false,
    followTheme: false,
    fontFamily: '',
    fontLatin: '',
    fontCjk: '',
    fontFallback: 'sans-serif',
    opacity: 0.95,
    alwaysOnTop: true,
    lock: false,
    ignoreHover: false,
    lockPosition: false,
    headerMode: 'hover',
    springMass: 1,
    springStiffness: 100,
    springDamping: 10,
    wheelFontSize: false,
    translationOpacity: 0.3,
    hideWithoutLyrics: false,
    letterSpacing: 0,
};

let baseMs = 0;
let baseAt = performance.now();
let playing = false;
let linesVersion = -1;
let rawLines = [];
let themeColor = '';
let themeBackground = '';
let themeFontStack = '';
let lastPayload = null;
// 换歌后「歌词加载中」的窗口期，过了才显示「纯音乐」。
let loadingSince = 0;

const currentMs = () => Math.max(0, Math.round(playing ? baseMs + (performance.now() - baseAt) : baseMs));

// ---------------------------------------------------------------- 歌词投影

const toAmll = (raw) => {
    const words = (raw.w || []).map((word) => ({
        word: word.w,
        startTime: Math.round(word.s),
        endTime: Math.round(word.e),
    }));
    if (words.length === 0) {
        // 没有逐字时间的行也必须有一个词，否则 AMLL 会把整行丢掉。
        words.push({ word: raw.x || '♪', startTime: Math.round(raw.t), endTime: Math.round(Math.max(raw.e, raw.t + 1)) });
    }
    return {
        words,
        translatedLyric: settings.showTranslation ? raw.tr || '' : '',
        romanLyric: settings.showRomanization ? raw.ro || '' : '',
        startTime: Math.round(raw.t),
        endTime: Math.round(Math.max(raw.e, raw.t + 1)),
        isBG: Boolean(raw.bg),
        isDuet: Boolean(raw.d),
    };
};

const applyLines = () => {
    const mapped = rawLines.map(toAmll);
    player.setLyricLines(mapped, currentMs());
    player.update();
    player.calcLayout(LayoutReason.ConfigChange);
    updatePlaceholder();
};

// ---------------------------------------------------------------- 占位文案

const updatePlaceholder = () => {
    body.classList.toggle('no-lyrics', settings.hideWithoutLyrics && rawLines.length === 0);
    if (rawLines.length > 0) {
        placeholderEl.hidden = true;
        return;
    }
    placeholderEl.hidden = false;
    const payload = lastPayload;
    if (!payload) {
        placeholderEl.textContent = '正在连接 Folia…';
        return;
    }
    if (!payload.title) {
        placeholderEl.textContent = '未在播放';
        return;
    }
    placeholderEl.textContent = Date.now() - loadingSince < 4000 ? '歌词加载中…' : '纯音乐，请欣赏';
};

// ---------------------------------------------------------------- 设置

// #rrggbb → rgba()，底色不透明度单独可调（设置里的 color 只收 #rrggbb）。
const withAlpha = (hex, alpha) => {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!match) return `rgba(11, 11, 16, ${alpha})`;
    const value = Number.parseInt(match[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

// 字体栈：西文 → 中文 → 主字体（空则用 Folia 主题解析出来的那份）→ 回退字族。
// 浏览器是逐字形找字体的，所以纯西文字体排最前面时，中文字形会自然落到后面的中文字体。
const quoteFamily = (name) => (/^[A-Za-z0-9_-]+$/.test(name) ? name : `'${String(name).replace(/'/g, "\'")}'`);

const resolveFontFamily = () => {
    const parts = [];
    const push = (value) => {
        if (value && !parts.includes(value)) parts.push(value);
    };
    if (settings.fontLatin) push(quoteFamily(settings.fontLatin));
    if (settings.fontCjk) push(quoteFamily(settings.fontCjk));
    push(settings.fontFamily ? quoteFamily(settings.fontFamily) : themeFontStack);
    push(settings.fontFallback);
    return parts.join(', ') || 'sans-serif';
};

const resolveBackground = () => {
    if (settings.backgroundMode === 'none') return 'transparent';
    if (settings.backgroundMode === 'theme' && themeBackground) return withAlpha(themeBackground, settings.backgroundOpacity);
    return withAlpha(settings.backgroundColor, settings.backgroundOpacity);
};

const applyOpacity = () => {
    const target = playing ? settings.opacity : Math.min(settings.opacity, settings.pausedOpacity);
    appEl.style.opacity = String(target);
};

const applySettings = () => {
    const root = document.documentElement.style;
    root.setProperty('--dl-bg', resolveBackground());
    // 「左右交替」靠对唱标记实现，容器本身靠左，非对唱行才不会被居中。
    root.setProperty('--dl-align', settings.align === 'both' ? 'left' : settings.align);
    root.setProperty('--dl-weight', String(settings.fontWeight));
    root.setProperty('--dl-tran-scale', String(settings.translationScale));
    // 单行 / 双行的可见带：按字号和翻译字号算高度，再按纵向位置整条带挪动。
    const fontSize = Math.round(settings.fontSize);
    const lineHeight = fontSize * 1.35 * (1 + settings.translationScale * 0.55);
    const band = settings.mode === 'double' ? lineHeight * 3 : lineHeight * 1.25;
    root.setProperty('--dl-band', `${Math.round(band)}px`);
    root.setProperty('--dl-vp', String(settings.verticalPosition));
    root.setProperty('--dl-radius', `${Math.round(settings.cornerRadius)}px`);
    body.classList.toggle('has-backdrop', settings.backgroundMode !== 'none');
    body.classList.toggle('has-border', settings.border);
    applyOpacity();
    root.setProperty('--amll-lp-font-size', `${Math.round(settings.fontSize)}px`);
    root.setProperty('--amll-lp-color', settings.followTheme && themeColor ? themeColor : settings.playedColor);
    root.setProperty('--dl-played', settings.followTheme && themeColor ? themeColor : settings.playedColor);
    root.setProperty('--dl-unplayed', String(settings.unplayedOpacity));
    root.setProperty('--dl-shadow', settings.shadowColor);
    root.setProperty('--dl-mask', settings.backgroundMaskColor);
    lyricHost.style.fontFamily = resolveFontFamily();
    body.classList.toggle('mask', settings.textBackgroundMask);
    body.classList.toggle('pin-info', settings.alwaysShowPlayInfo);
    body.classList.toggle('mode-single', settings.mode === 'single');
    body.classList.toggle('mode-double', settings.mode === 'double');
    body.classList.toggle('mode-board', settings.mode === 'board');
    player.setHidePassedLines(settings.hidePassedLines || settings.mode !== 'board');
    // 带式形态里纵向位置挪的是整条带（CSS 的 --dl-vp），带内始终居中；歌词板形态直接交给 AMLL。
    player.setAlignPosition(settings.mode === 'board' ? settings.verticalPosition : 0.5);
    player.setWordFadeWidth(settings.wordFadeWidth);
    player.setEnableSpring(settings.enableSpring);
    // AMLL 的弹簧参数：mass / stiffness / damping，位置和缩放两套都吃这一份。
    const spring = {
        mass: settings.springMass,
        stiffness: settings.springStiffness,
        damping: settings.springDamping,
    };
    player.setLinePosYSpringParams(spring);
    player.setLineScaleSpringParams(spring);
    player.setEnableBlur(settings.blurUpcoming);
    root.setProperty('--dl-sub-opacity', String(settings.translationOpacity));
    root.setProperty('--dl-tracking', `${settings.letterSpacing}em`);
    body.classList.toggle('locked', settings.lock || settings.ignoreHover);
    if (settings.ignoreHover && hovered) {
        hovered = false;
        body.classList.remove('hover');
    }
    body.classList.toggle('header-hover', settings.headerMode === 'hover');
    body.classList.toggle('header-always', settings.headerMode === 'always');
    body.classList.toggle('header-never', settings.headerMode === 'never');
    body.classList.toggle('no-lyrics', settings.hideWithoutLyrics && rawLines.length === 0);
    setIcon(lockEl, settings.lock ? ICON_LOCKED : ICON_UNLOCKED);
    lockEl.classList.toggle('unlocked', !settings.lock);
    player.calcLayout(LayoutReason.ConfigChange);
};

// ---------------------------------------------------------------- 快照

bridge.onState((payload) => {
    if (!payload || typeof payload !== 'object') return;
    lastPayload = payload;

    baseMs = Math.round((Number(payload.position) || 0) * 1000);
    baseAt = performance.now();

    const wasPlaying = playing;
    playing = payload.state === 'playing';
    if (playing !== wasPlaying) {
        if (playing) player.resume();
        else player.pause();
        applyOpacity();
    }

    songEl.textContent = [payload.title, payload.artist].filter(Boolean).join(' — ');
    setIcon(playPauseEl, playing ? ICON_PAUSE : ICON_PLAY);

    if (payload.theme) {
        const nextColor = typeof payload.theme.color === 'string' ? payload.theme.color : themeColor;
        const nextBackground = typeof payload.theme.background === 'string' ? payload.theme.background : themeBackground;
        const nextFontStack = typeof payload.theme.fontStack === 'string' ? payload.theme.fontStack : themeFontStack;
        if (nextColor !== themeColor || nextBackground !== themeBackground || nextFontStack !== themeFontStack) {
            themeColor = nextColor;
            themeBackground = nextBackground;
            themeFontStack = nextFontStack;
            applySettings();
        }
    }

    if (payload.linesVersion !== linesVersion) {
        if (!Array.isArray(payload.lines)) {
            // client 只在歌词变了的时候才随快照带行；版本对不上说明这次没带，问它要一次。
            tell({ type: 'sync' });
        } else {
            const hadLines = rawLines.length > 0;
            linesVersion = payload.linesVersion;
            rawLines = payload.lines;
            if (!hadLines || rawLines.length === 0) loadingSince = Date.now();
            applyLines();
        }
    }

    updatePlaceholder();
});

bridge.onSettings((next) => {
    if (!next || typeof next !== 'object') return;
    const relayout =
        settings.showTranslation !== next.showTranslation || settings.showRomanization !== next.showRomanization;
    settings = { ...settings, ...next };
    applySettings();
    // 只有翻译 / 音译开关变了才需要重铺歌词，否则切个锁定也会把歌词滚回去。
    if (relayout) applyLines();
});

// ---------------------------------------------------------------- 逐帧推进

let lastFrame = -1;
const frame = (now) => {
    if (lastFrame < 0) lastFrame = now;
    // 标签页被系统挂起过的话 delta 会很大，夹一下免得弹簧算法炸掉。
    const delta = Math.min(now - lastFrame, 250);
    lastFrame = now;
    if (rawLines.length > 0) {
        player.setCurrentTime(currentMs());
        player.update(delta);
    }
    requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// ---------------------------------------------------------------- 交互

const tell = (message) => bridge.send(message);

// 锁定（鼠标穿透）时，main 用 forward 把指针移动送进来，这里据此临时解冻，好点到控制条。
// 和 SPlayer 一样：移动就显示控制条，停住一秒后自己收起来。
let hovered = false;
let hideTimer = null;
const setHover = (over) => {
    if (hovered === over) return;
    hovered = over;
    body.classList.toggle('hover', over);
    tell({ type: 'hover', over });
};

const bumpHover = () => {
    setHover(true);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        hideTimer = null;
        setHover(false);
    }, 1200);
};

// 锁定时整窗穿透，只有指针压在锁定按钮上才解冻，好让人能用鼠标解锁。
let overLockButton = false;
const updateLockHit = (x, y) => {
    if (settings.ignoreHover || settings.headerMode === 'never') {
        if (!overLockButton) return;
        overLockButton = false;
        tell({ type: 'hit', onLock: false });
        return;
    }
    const rect = lockEl.getBoundingClientRect();
    const pad = 6;
    const inside =
        x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
    if (inside === overLockButton) return;
    overLockButton = inside;
    tell({ type: 'hit', onLock: inside });
};

document.addEventListener('mousemove', (event) => {
    // 忽略鼠标：连悬停都不做，控制条永远不浮出来。
    if (settings.ignoreHover) return;
    bumpHover();
    updateLockHit(event.clientX, event.clientY);
}, { passive: true });
document.addEventListener('mouseleave', () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    setHover(false);
    if (overLockButton) {
        overLockButton = false;
        tell({ type: 'hit', onLock: false });
    }
});
window.addEventListener('blur', () => setHover(false));

// 自己拖窗口：按下记起点，移动只发累计位移，main 用「拖起点 + 位移」设位置，
// 这样不会被逐帧取整拖出漂移，也能顺便夹在屏幕工作区里。
let drag = null;
document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // 锁定位置：窗口钉在原地，只有设置里解锁才能拖。
    if (settings.lockPosition) return;
    const target = event.target;
    if (target instanceof Element && target.closest('#header button')) return;
    drag = { id: event.pointerId, x: event.screenX, y: event.screenY };
    tell({ type: 'drag-start' });
    document.documentElement.setPointerCapture?.(event.pointerId);
});

document.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    tell({ type: 'drag-move', dx: Math.round(event.screenX - drag.x), dy: Math.round(event.screenY - drag.y) });
});

const endDrag = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    drag = null;
    tell({ type: 'drag-end' });
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

document.getElementById('header').addEventListener('click', (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('button[data-cmd]') : null;
    if (!button) return;
    const cmd = button.dataset.cmd;
    if (cmd === 'close') {
        tell({ type: 'close' });
    } else if (cmd === 'lock') {
        tell({ type: 'lock', locked: !settings.lock });
    } else {
        tell({ type: 'cmd', name: cmd });
    }
});

// 滚轮调字号：只在设置里打开时生效，滚一格 1px。
window.addEventListener('wheel', (event) => {
    if (!settings.wheelFontSize) return;
    event.preventDefault();
    const step = event.deltaY < 0 ? 1 : -1;
    tell({ type: 'font-size', value: settings.fontSize + step });
}, { passive: false });

window.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
        event.preventDefault();
        tell({ type: 'cmd', name: 'playpause' });
    } else if (event.key === 'ArrowRight' && event.altKey) {
        tell({ type: 'cmd', name: 'next' });
    } else if (event.key === 'ArrowLeft' && event.altKey) {
        tell({ type: 'cmd', name: 'previous' });
    } else if (event.key === 'Escape') {
        tell({ type: 'close' });
    }
});

// 先订阅再报到：main 收到 ready 才会补发一次当前设置与最后一帧快照。
tell({ type: 'ready' });
applySettings();
updatePlaceholder();
