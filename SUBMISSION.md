# 模组提交 · 填写内容

> 这是给 <https://github.com/chthollyphile/folium-compound/issues/new?template=mod-submission.yml>
> 用的。逐项复制下面的值即可，**运行截图那栏必须你自己传**（要 Folia 里真实运行的截图）。

## 标题

```text
[模组提交] 桌面歌词 (AMLL)
```

## 表单字段

| 字段 | 值 |
| --- | --- |
| 模组 id / Mod id | `amll-desktop-lyric` |
| 源码仓库 / Source repository | `https://github.com/TypeDreamMoon/folia-desktop-lyric` ← **改成你自己的仓库地址** |
| 版本 / Version (tag or commit) | `v0.1.0` |
| 模组目录 / Mod directory | `mod` |
| 发布渠道 / Channel | **先行测试 / Beta**（建议；见下面说明） |
| 许可证 / License | `AGPL-3.0-only` |

### 模组说明 / Description

````text
独立的桌面歌词窗口，歌词用 applemusic-like-lyrics（AMLL）渲染，逐字擦除。

和 Folia 自带的托盘「桌面歌词」不同，它另开一扇自己的窗：无边框、透明、置顶、不进任务栏、
不抢焦点，位置与尺寸单独记着，主窗口该干什么干什么。

- 三种形态：单行、双行（当前句 + 下一句）、多行歌词板。单行 / 双行的高度跟着字号走，
  直接拖窗口高度也会反过来改字号。
- 顶部三栏控制条（歌名 / 上一首·播放·下一首 / 锁定·关闭），可选「悬停显示 / 常显 / 一直隐藏」。
- 锁定（鼠标穿透）时整扇窗穿透，只有指针压到锁定按钮上才临时解冻；另有「锁定位置」钉住不能拖，
  「忽略鼠标悬停」让它完全不接收指针（纯展示用）。
- 字体：独立分区 + 可搜索的本机字体选择器，主字体 / 西文字体 / 中文字体 / 回退字体分开选，
  按「西文 → 中文 → 主字体 → 回退」拼字体栈；主字体留空时用 Folia 主题解析出来的字体。
  本机字体列表由 main 入口解析 sfnt 的 name 表得到，缓存在模组缓存目录里 24 小时。
- 外观：窗口底色（透明 / 纯色 / 跟随主题背景）、不透明度、圆角、描边、已唱颜色、未唱亮度、
  描影、文字底色遮罩。
- 播放位置每 200ms 才跨一次进程，窗口自己按 rAF 外推，逐字动画仍是 60fps。

兼容 Folium 1.5–1.7：1.6 没有 main → client 推送通道（api.rpc.send），改由 client 每 150ms
主动取命令；globalShortcut 命令字段只在 1.7 上声明。
````

### 权限说明 / Permissions

````text
mod.json 声明了两个 permission，没有 embedOrigins，也没有 experimental。

- playback.control：窗口顶部控制条的上一首 / 播放暂停 / 下一首，经 folium.playback.previous /
  toggle / next 控制播放。只用这三个方法，不碰队列、音量、收藏、歌词搜索。
  （读播放状态用的是 folium.playback.getState()，它不需要权限。）

- filesystem.data：两处用途。
  1) api.storage 存这扇窗的开关状态和位置 / 尺寸，下次启动恢复原样；
  2) api.storage.paths.cache 存本机字体族列表的缓存（24 小时后重扫）。缓存目录用户可以随时
     在模组面板里清空，清空后下次打开设置面板会重扫。
  读写只经过 api.storage / api.storage.paths，不碰模组目录和数据目录以外的任何文件。
````

### 确认 / Confirmations

三条都勾上。

---

## 提交前你要做的事

1. **建仓库并推送**（当前目录已经是 git 仓库、打过首个 commit）：

   ```bash
   git remote add origin https://github.com/<你>/folia-desktop-lyric.git
   git push -u origin main
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **在 Folia 里跑一次并截图**。模组已经装在
   `%APPDATA%\Folia\mods\amll-desktop-lyric`，设置 → 模组 → 重载 → 启用（会弹一次确认）。
   开一首有逐字歌词的歌，命令面板「桌面歌词：开关」，截一张**能看到 Folia 版本号**的屏幕截图
   （设置 → 关于，或者标题栏），把图直接拖进「运行截图」框。
   截图这一步只有你能做，CI 会检查这一栏非空。

3. 打开 issue，按上表填，把截图拖进去，提交。

## 已经替你验证过的

用 folium-compound 自己的检查代码跑过（`npm run validate`）：

```
[info] 介绍图 preview.png：1280×720，439 KB，比例 1.78
[info] 12 个文件，959 KB
[validate] 通过（按社区提交的格式检查）
```

- 清单按 Folia 的规则校验通过，`main` / `client` 入口文件都在
- 介绍图 1280×720、16:9、< 1 MB（`preview.png` 随模组一起签名）
- 12 个文件 / 959 KB，远低于 300 个文件、16 MB 的上限
- 没有符号链接，没有 `folium.sig.json`
- 许可证与第三方声明在模组目录里：`LICENSE`（AGPL-3.0，AMLL 同为 AGPL-3.0-only）、
  `THIRD-PARTY-NOTICES.md`

## 两个提醒

- **id 不能叫 `desktop-lyric`**：`mods/beta/desktop-lyric` 已经被 aming2778 的模组占了
  （v1.0.5），重复 id 的提交会被直接拒。所以用的是 `amll-desktop-lyric`。
- **渠道建议先选「先行测试 / Beta」**：正式发布要通过功能审查（能正常工作、实现整洁），
  而目前只在离线 harness 里验证过，还没在你的 Folia 里跑通。等真机确认没问题，再按
  「模组更新」流程或请维护者升级到正式发布。
