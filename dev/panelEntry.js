// dev/panelEntry.js
// 单独把字体选择器挂到一个空页面里看效果，不用启动 Folia。由 `npm run dev:panel` 打包后
// 用 electron 打开 dev/panel.html。

import { createFontPanel } from '../src/client.mjs';

const FAMILIES = [
    'Segoe UI',
    'Microsoft YaHei',
    '微软雅黑',
    '等线',
    '宋体',
    '楷体',
    '思源黑体',
    '霞鹜文楷',
    'Inter',
    'Georgia',
    'Times New Roman',
    'JetBrains Mono',
];

const store = { fontFamily: '', fontLatin: '', fontCjk: '思源黑体', fontFallback: 'sans-serif' };

const mount = createFontPanel({
    loadFamilies: () => new Promise((resolve) => setTimeout(() => resolve(FAMILIES), 400)),
});

const container = document.getElementById('app');
const ctx = {
    locale: 'zh-CN',
    settings: {
        get: () => store,
        set: (patch) => {
            Object.assign(store, patch);
            for (const listener of listeners) listener();
        },
        onChange: (listener) => {
            listeners.push(listener);
            return () => {};
        },
        reset: () => {},
        schema: [],
    },
    getTheme: () => ({ name: 'test', primaryColor: '#fff', backgroundColor: '#000', fontStyle: 'sans' }),
    resolveFontStack: () => "'Microsoft YaHei', sans-serif",
    onChange: () => () => {},
    onFrame: () => () => {},
    onResize: () => () => {},
    every: () => () => {},
    onDispose: () => {},
};
const listeners = [];

mount(container, ctx);
