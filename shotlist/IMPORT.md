# 恩万婚礼拍摄手册 / Shotlist

本目录与根目录婚礼作品展示站隔离。网站源码和图库最终存放在 `shotlist/`。

## 自动导入 V4.0（推荐）

已配置 GitHub Actions：`Import wedding shotlist V4`。本次提交只包含导入工具和自动化，两个 ZIP 尚未上传到 GitHub，手册尚未部署。

1. 将 V3.0 完整源码 ZIP 重命名为 `v3.zip`；将 V4.0 增量完整版 ZIP 重命名为 `v4.zip`。
2. 在本仓库 [新建 Release](https://github.com/raynacocobobobo-arch/wedding/releases/new)，创建新 tag，例如 `shotlist-import-v4`，目标分支选择 main。
3. 上传两个 ZIP 为 Release 附件，确认上传成功后发布 Release。
4. 在 [Actions](https://github.com/raynacocobobobo-arch/wedding/actions) 查看 `Import wedding shotlist V4`。也可手动运行该 workflow，输入包含这两个附件的 Release tag。

工作流先读取 ZIP、比较 V3 原始资源 SHA-256、核验图片路径和编号，再导入。之后生成手机缩略图、独立分类导航、大图浏览和 V4 专用离线缓存，并执行新增 JavaScript 的语法检查。只有检查通过才提交 `shotlist/`；发现冲突或错误时停止，不覆盖根目录站点。

本仓库是公开仓库；Release ZIP 与最终提交的资源均公开可见。请仅上传有权公开发布的素材。

## 本地导入备选方法

在仓库根目录执行：

```bash
python3 shotlist/import_v4.py /path/to/v4.zip --baseline /path/to/v3.zip
python3 shotlist/import_v4.py /path/to/v4.zip --baseline /path/to/v3.zip --apply
python3 -m pip install Pillow
python3 shotlist/prepare_v4.py
node --check shotlist/v4/app.js
node --check shotlist/v4/sw.js
git add shotlist/
git commit -m "Import and prepare Enwan V4 shotlist"
git push origin main
```

## 验收

- 检查 `v4-audit.json` 中原版文件保留、图片数量、重复及缺图情况。
- 检查 `v4-preparation.json` 中缩略图及分类数量。
- 人工核对每张参考图的动作匹配和连续运镜帧顺序；自动程序不替代审图。
- 新增补充库仍独立于原有标准库，跨库语义去重和卡片合并需要读取实际导入后的数据再处理。
- 手机和电脑实测导航、搜索、放大、原版进度及离线下载；GitHub 提交不代表正式域名已经部署。
