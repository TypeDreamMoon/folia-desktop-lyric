// dev/validate-submission.mjs
// 用 folium-compound 自己的检查代码，把 mod/ 按社区提交的标准过一遍：
// 清单校验、介绍图片格式/尺寸/比例/体积、id 与目录名一致、入口文件存在、体积上限、
// 不含符号链接和签名文件。
//
//   node dev/validate-submission.mjs /path/to/folium-compound

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const compound = process.argv[2];
if (!compound) {
    console.error('用法: node dev/validate-submission.mjs <folium-compound 仓库路径>');
    process.exit(2);
}

const modDir = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', 'mod');
const require = createRequire(import.meta.url);
const { validateManifest } = require(path.join(compound, 'tools/vendor/folia-manifest.cjs'));
const { checkPreview } = await import(pathToFileURL(path.join(compound, 'tools/lib/image.mjs')).href);

const LABELS = ['error', 'warn'];
const report = { error: [], warn: [], info: [] };
const fail = (message) => report.error.push(message);

if (!fs.existsSync(modDir)) {
    console.error('没有 mod/ 目录，先 npm run package');
    process.exit(2);
}

const manifestPath = path.join(modDir, 'mod.json');
if (!fs.existsSync(manifestPath)) {
    fail('缺少 mod.json');
} else {
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        fail(`mod.json 不是合法 JSON：${error.message}`);
    }

    if (manifest) {
        const result = validateManifest(manifest);
        if (result && result.ok === false) {
            for (const error of result.errors || []) fail(`清单：${error}`);
        }
        // 目录名不必等于 id：提交时可把 mod.json 所在目录写成 path（例如 mod/），
        // CI 会按 id 重新命名后收录。
        for (const entry of [manifest.main, manifest.client]) {
            if (entry && !fs.existsSync(path.join(modDir, entry))) fail(`入口文件不存在：${entry}`);
        }
        const preview = checkPreview(modDir, manifest);
        for (const error of preview.errors) fail(`介绍图片：${error}`);
        if (preview.info) {
            const info = preview.info;
            report.info.push(
                `介绍图 ${info.file}：${info.width}×${info.height}，${(info.bytes / 1024).toFixed(0)} KB，比例 ${(info.width / info.height).toFixed(2)}`,
            );
        }
    }
}

// 文件树：数量 / 体积 / 符号链接 / 签名文件
let files = 0;
let bytes = 0;
const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) fail(`不允许符号链接：${relative}`);
        else if (entry.isDirectory()) walk(full, relative);
        else if (entry.isFile()) {
            files += 1;
            bytes += fs.statSync(full).size;
            if (entry.name === 'folium.sig.json') fail(`模组目录里不能有 folium.sig.json：${relative}`);
            if (relative.startsWith('.')) report.warn.push(`以 . 开头的文件不会被收录：${relative}`);
        }
    }
};
walk(modDir, '');

if (files > 300) fail(`文件太多：${files}（上限 300）`);
if (bytes > 16 * 1024 * 1024) fail(`体积超限：${(bytes / 1024 / 1024).toFixed(1)} MB（上限 16 MB）`);
report.info.push(`${files} 个文件，${(bytes / 1024).toFixed(0)} KB`);

for (const level of LABELS) {
    for (const message of report[level]) console.log(`  [${level}] ${message}`);
}
for (const message of report.info) console.log(`  [info] ${message}`);
console.log(report.error.length === 0 ? '[validate] 通过（按社区提交的格式检查）' : `[validate] ${report.error.length} 个问题`);
process.exit(report.error.length === 0 ? 0 : 1);
