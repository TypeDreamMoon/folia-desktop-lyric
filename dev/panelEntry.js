// dev/panelEntry.js
// 把「主设置面板」和「字体选择器」挂到一页里看效果，不用启动 Folia。由 `npm run dev:panel`
// 打包后用 electron 打开 dev/panel.html。

import { createFontPanel, createSettingsPanel, MAIN_FIELDS } from '../src/client.mjs';

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

const listeners = [];
const store = Object.fromEntries(MAIN_FIELDS.map((field) => [field.key, field.defaultValue]));
Object.assign(store, {
    fontFamily: '',
    fontLatin: '',
    fontCjk: '思源黑体',
    fontFallback: 'sans-serif',
    fontSize: 34,
    backgroundOpacity: 0.5,
    playedColor: '#ffffff',
});

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
            return () => {
                const index = listeners.indexOf(listener);
                if (index >= 0) listeners.splice(index, 1);
            };
        },
        reset: () => {},
        schema: MAIN_FIELDS,
    },
    getTheme: () => ({ name: 'test', primaryColor: '#fff', backgroundColor: '#000', accentColor: '#7cd0ff', secondaryColor: '#999', fontStyle: 'sans' }),
    onChange: () => () => {},
    onFrame: () => () => {},
    onResize: () => () => {},
    every: () => () => {},
    onDispose: () => {},
};

const settingsMount = createSettingsPanel({ fields: MAIN_FIELDS });
settingsMount(document.getElementById('settings'), ctx);

const fontMount = createFontPanel({
    loadFamilies: () => new Promise((resolve) => setTimeout(() => resolve(FAMILIES), 400)),
    resolveFontStack: () => "'Microsoft YaHei', sans-serif",
});
fontMount(document.getElementById('app'), ctx);
