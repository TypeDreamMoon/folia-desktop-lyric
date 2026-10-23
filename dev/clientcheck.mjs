// dev/clientcheck.mjs
// 不开 Folia，直接把模组的 client 入口跑一遍：用一套会校验形状的假 folium 对象充当宿主，
// 注册表受理解析成真实的规范（比如 settingsPanel 必须是挂载函数本身，不是 { mount }），
// 参数不对就在这里报出来，而不是等到应用里「界面代码出错」。
//
//   node dev/clientcheck.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import activate from '../src/client.mjs';

// Folia 只给 client 入口的 URL 加摘要版本号，相对导入没有 —— 拆出去的文件在渲染进程的
// 模块表里永远是第一次加载的那份，改了也跑旧代码。所以 client 必须是单文件。
const clientSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client.mjs'),
    'utf8',
);
const relativeImports = [...clientSource.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)].map(
    (match) => match[1],
);

const problems = [];
const check = (condition, message) => {
    if (!condition) problems.push(message);
};

const sections = [];
const commands = [];
const handlers = new Map();
const everyListeners = [];
// 1.6 路径下 client 会来取命令；这个变量就是「main 里排队的命令」。
let queuedCommands = [];
const playbackCalls = [];
const listeners = new Map();

const makeAccess = (def) => {
    const defaults = {};
    for (const field of def.settings || []) {
        if (field && typeof field.key === 'string' && field.defaultValue !== undefined) {
            defaults[field.key] = field.defaultValue;
        }
    }
    let values = { ...defaults };
    const changeListeners = new Set();
    return {
        schema: def.settings || [],
        get: () => values,
        set: (patch) => {
            values = { ...values, ...patch };
            for (const listener of changeListeners) listener();
        },
        reset: () => {
            values = { ...defaults };
            for (const listener of changeListeners) listener();
        },
        onChange: (listener) => {
            changeListeners.add(listener);
            return () => changeListeners.delete(listener);
        },
    };
};

const lines = [
    {
        startTime: 1,
        endTime: 3,
        fullText: '夜色漫过城市的边缘',
        words: [
            { text: '夜色', startTime: 1, endTime: 1.6 },
            { text: '漫过', startTime: 1.6, endTime: 2.2 },
            { text: '城市的边缘', startTime: 2.2, endTime: 3 },
        ],
        translation: 'Night spills over the edge of the city',
        romanization: '',
        renderHints: { rawDuration: 2, timingClass: 'normal', renderEndTime: 3.2, lineTransitionMode: 'normal', wordRevealMode: 'normal' },
    },
];

const folium = {
    modId: 'desktop-lyric',
    host: { folia: '0.7.22', folium: { major: 1, minor: 7 } },
    env: { context: 'main' },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    registries: {
        settingsSections: {
            register: (def) => {
                check(def && typeof def.id === 'string', 'settingsSections: 缺 id');
                check(Array.isArray(def.settings), `${def && def.id}: settings 必须是数组`);
                if (def.settingsPanel !== undefined) {
                    check(
                        typeof def.settingsPanel === 'function',
                        `${def.id}: settingsPanel 必须是挂载函数本身（不是 { mount }）`,
                    );
                }
                for (const field of def.settings || []) {
                    check(typeof field.key === 'string', `${def.id}: 有设置项缺 key`);
                    check(typeof field.type === 'string', `${def.id}.${field.key}: 缺 type`);
                    if (field.type === 'select') {
                        check(Array.isArray(field.options) && field.options.length > 0, `${def.id}.${field.key}: select 没有 options`);
                    }
                }
                const access = makeAccess(def);
                sections.push({ def, access });
                return { id: `desktop-lyric:${def.id}`, unregister: () => {}, settings: access };
            },
        },
        commands: {
            register: (def) => {
                check(typeof def.run === 'function', `${def && def.id}: 命令缺 run`);
                check(def.label !== undefined, `${def && def.id}: 命令缺 label`);
                commands.push(def);
                return { id: `desktop-lyric:${def.id}`, unregister: () => {} };
            },
        },
    },
    events: {
        on: (type, handler) => {
            check(typeof type === 'string' && type.length > 0, 'events.on: 事件名');
            check(typeof handler === 'function', `${type}: 监听器必须是函数`);
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
            return () => listeners.get(type)?.delete(handler);
        },
    },
    playback: {
        getState: () => ({
            song: { id: '1', title: '夜航', artist: 'Harness', album: 'dev', source: 'netease', ref: 'r1' },
            state: 'playing',
            position: 12.5,
            duration: 210,
            liked: false,
            canLike: true,
        }),
        toggle: () => playbackCalls.push('toggle'),
        next: () => playbackCalls.push('next'),
        previous: () => playbackCalls.push('previous'),
    },
    lyrics: { getLines: () => lines },
    theme: { resolveFontStack: () => "'Segoe UI', sans-serif" },
    rpc: {
        call: async (name) => {
            handlers.set(name, (handlers.get(name) || 0) + 1);
            if (name === 'fonts') return ['Segoe UI', 'Microsoft YaHei'];
            if (name === 'take-commands') {
                const drained = queuedCommands;
                queuedCommands = [];
                return drained;
            }
            return { ok: true };
        },
        on: (name, listener) => {
            check(typeof listener === 'function', `rpc.on ${name}: 监听器必须是函数`);
            return () => {};
        },
    },
    every: (ms, listener) => {
        everyListeners.push({ ms, listener });
        return () => {};
    },
    onDispose: () => {},
};

const fail = (error) => {
    console.error('[clientcheck] activate 抛错：', error);
    problems.push(`activate threw: ${error && error.message}`);
};

try {
    activate(folium);
} catch (error) {
    fail(error);
}

// 走一遍各条路径：设置变化、歌词加载、换歌、事件通知。
try {
    const emit = (type, payload) => {
        for (const handler of listeners.get(type) || []) handler(payload);
    };
    emit('lyrics.loaded', { song: null, lines });
    emit('playback.songChanged', { song: null });
    emit('playback.stateChanged', { state: 'paused' });
    emit('playback.seeked', { position: 4 });
    emit('theme.changed', { theme: { primaryColor: '#fff', backgroundColor: '#000', fontStyle: 'sans' } });

    for (const entry of sections) entry.access.set({ ...entry.access.get() });
    for (const entry of sections) entry.access.reset();

    // 字体面板：真的挂一次，看它能不能画出来（这里给个最小 DOM 替身）。
    const panel = sections.find((entry) => entry.def.settingsPanel);
    if (panel && typeof document !== 'undefined') {
        const nodes = [];
        const fakeNode = () => ({
            className: '',
            style: {},
            textContent: '',
            children: [],
            dataset: {},
            append: (...kids) => nodes.push(...kids),
            appendChild: (kid) => nodes.push(kid),
            remove: () => {},
            querySelector: () => null,
            addEventListener: () => {},
            after: () => {},
            focus: () => {},
        });
        const container = fakeNode();
        container.append = (...kids) => nodes.push(...kids);
        // 只给 FoliumSettingsPanelContext 文档里有的成员；越界访问直接抛，抓的就是
        // 「面板用了 ctx 上没有的东西」这一类错误（比如 ctx.resolveFontStack）。
        const documented = {
            locale: 'zh-CN',
            settings: panel.access,
            getTheme: () => ({ primaryColor: '#fff', backgroundColor: '#000', fontStyle: 'sans' }),
            onChange: () => () => {},
            onFrame: () => () => {},
            onResize: () => () => {},
            every: (ms, listener) => {
        everyListeners.push({ ms, listener });
        return () => {};
    },
            onDispose: () => {},
        };
        const panelCtx = new Proxy(documented, {
            get(target, prop) {
                if (!(prop in target)) {
                    throw new Error(`settings panel ctx has no "${String(prop)}"`);
                }
                return target[prop];
            },
        });
        const disposer = panel.def.settingsPanel(container, panelCtx);
        check(typeof disposer === 'function' || disposer === undefined, 'settingsPanel 应当返回清理函数或不返回');
    }
} catch (error) {
    console.error('[clientcheck] 运行时抛错：', error);
    problems.push(`runtime threw: ${error && error.message}`);
}

// Folium 1.6：没有 main → client 推送，client 靠 every(150) 来取命令。
try {
    const folium16 = { ...folium, host: { folia: '0.7.21', folium: { major: 1, minor: 6 } } };
    everyListeners.length = 0;
    activate(folium16);
    const poll = everyListeners.find((entry) => entry.ms === 150);
    check(Boolean(poll), '1.6 上应当注册 every(150) 去取命令');
    if (poll) {
        queuedCommands = [{ name: 'cmd', payload: { name: 'playpause' } }];
        poll.listener();
        await new Promise((resolve) => setTimeout(resolve, 30));
        check(playbackCalls.includes('toggle'), '1.6 上取到的命令应当真的执行 playback.toggle()');
    }
} catch (error) {
    problems.push(`1.6 轮询路径抛错：${error && error.message}`);
}

await new Promise((resolve) => setTimeout(resolve, 50));

console.log('[clientcheck] 设置分区:', sections.map((entry) => `${entry.def.id}(${entry.def.settings.length} 项)`).join(', '));
console.log('[clientcheck] 命令:', commands.map((entry) => entry.id).join(', '));
console.log('[clientcheck] rpc:', [...handlers.keys()].join(', '));
console.log('[clientcheck] 事件监听:', [...listeners.keys()].join(', '));

if (relativeImports.length > 0) {
    problems.push(`client.mjs 不能有相对导入（重载会拿到旧模块）：${relativeImports.join(', ')}`);
}

if (problems.length > 0) {
    console.error('[clientcheck] 问题:');
    for (const problem of problems) console.error('  -', problem);
    process.exit(1);
}
console.log('[clientcheck] OK');
