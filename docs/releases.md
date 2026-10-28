# Viz DEB 内测发布

Viz DEB 是架构无关的静态网页包（`Architecture: all`），安装到 `/opt/rocos/web`，与 App 默认 `web_root` 对齐。它不附带 Node、Vite 开发服务器或 nginx，也不单独监听端口。安装后通过运行中的 App HTTP 服务访问。

```bash
npm ci
node --test test/*.test.mjs
npm run build
python3 packaging/build_deb.py
cd build/packages
sha256sum -c SHA256SUMS
sudo apt install ./rocos-viz_3.1.0~rc.5_all.deb
```

打包前必须重新构建 `dist/`。包版本取 `package.json`，`3.1.0-rc.5` 转换为 Debian 版本 `3.1.0~rc.5`，Git 标签仍为 `v3.1.0-rc.5`。静态资源升级不自动重启 App；浏览器需刷新页面。

完成版本更新和提交后，推送同号标签会触发 `Build and release DEB`：安装锁定依赖、执行核心与浏览器回归测试、构建、生成 DEB，最后发布本仓库 Release。带 rc 的标签自动设置 **Prerelease**；上传安装包、`release.json`、`SHA256SUMS` 并验证摘要后才公开。手动运行工作流只保留 Actions 产物。

```bash
git tag -a v3.1.0-rc.5 -m 'Internal release 3.1.0-rc.5'
git push origin v3 v3.1.0-rc.5
```

随后由 `rocos-sia/rocos-releases` 每小时收录，也可手动同步。已发布版本不覆盖；API 契约版本与软件包版本相互独立。

当前全仓 ESLint 尚有既有的 `any` 和未使用变量问题；发布流水线以 TypeScript 构建、核心测试及浏览器回归作为门禁，不声称全仓 lint 已通过。
