// build.mjs
// 把模组打成一个可以直接拖进 Folia 模组面板的文件夹：dist/desktop-lyric/。
//
// 歌词窗口走 file:// + 经典 <script>（file:// 下 ES module 会被 CORS 挡掉），所以渲染端必须
// 打成 IIFE；client.mjs 由宿主以原生 ESM 直接加载，原样拷贝，不打进任何 bundle。

import * as esbuild from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = async (file) => {
    const text = await readFile(file, 'utf8');
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${path.basename(file)} 不是合法 JSON: ${error.message}`);
    }
};

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist', 'amll-desktop-lyric');
const watch = process.argv.includes('--watch');

const copy = async (from, to) => {
    await mkdir(path.dirname(to), { recursive: true });
    await cp(path.join(root, from), to);
};

const buildOptions = {
    entryPoints: [path.join(root, 'src/window/renderer.js')],
    outfile: path.join(out, 'window/bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'info',
};

const prepare = async () => {
    await rm(out, { recursive: true, force: true });
    await mkdir(path.join(out, 'window'), { recursive: true });
    await cp(path.join(root, 'mod.json'), path.join(out, 'mod.json'));
    await copy('src/client.mjs', path.join(out, 'client.mjs'));
    await copy('src/main.cjs', path.join(out, 'main.cjs'));
    await copy('src/preload.cjs', path.join(out, 'preload.cjs'));
    await copy('src/fonts.cjs', path.join(out, 'fonts.cjs'));
    await copy('src/window/index.html', path.join(out, 'window/index.html'));
    await copy('README.md', path.join(out, 'README.md'));
    await copy('assets/preview.png', path.join(out, 'preview.png'));
    await copy('LICENSE', path.join(out, 'LICENSE'));
    await copy('THIRD-PARTY-NOTICES.md', path.join(out, 'THIRD-PARTY-NOTICES.md'));

    // 版本号对齐：mod.json 的 version 就是 package.json 的 version。
    const pkg = await readJson(path.join(root, 'package.json'));
    const manifestPath = path.join(out, 'mod.json');
    const manifest = await readJson(manifestPath);
    manifest.version = pkg.version;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};

await prepare();

if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log('[build] watching src/window →', path.relative(root, out));
    console.log('[build] 改了 client/main/preload 记得重跑一次完整构建');
} else {
    await esbuild.build(buildOptions);
    const files = [];
    const walk = async (dir) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else files.push(path.relative(out, full));
        }
    };
    await walk(out);
    console.log(`[build] ${path.relative(root, out)} (${files.length} files)`);
    for (const file of files) console.log('  ', file);
}
