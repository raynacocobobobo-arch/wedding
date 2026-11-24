# 恩万婚礼拍摄手册 V5.0

GitHub 原生重建版，独立于根目录作品展示网站，无需 ZIP 或 Node 后端。

- 10 个阶段、110 个流程拍摄点。
- 10 个镜头分类、102 张镜头卡。
- 男方、女方、全部筛选，搜索、必拍进度、未完成、不适用。
- 多项目本地保存、JSON 备份与恢复。
- 参考图库和流程清单分开，选拍不计入必拍完成率。
- 本机参考图保存在 IndexedDB，不向服务器上传。
- HTTPS / localhost 支持 Service Worker 离线缓存。

## 参考图

新版本不是旧 ZIP 的无损恢复；旧图没有迁移。所有卡片初始 images 数组为空，不用占位图充数。按卡片逐张将图片提交至 assets/references/<卡片ID>/，并在 data.js 对应 images 数组中填写相对路径，例如 assets/references/C01-01/01.jpg。每张卡目标 4–5 张真实参考图，连续运镜按同一镜头帧顺序排列。

## 部署与测试

本目录可独立部署到任意静态网站 /shotlist/ 子路径。GitHub 源码提交不等同于正式域名上线。原根目录站点不变。已移除 ZIP 导入工具与对应工作流；历史提交仍保留。

使用 node shotlist/check-data.cjs 验证数据及引用路径；node --check shotlist/app.js 和 node --check shotlist/sw.js 检查语法。浏览器交互、真实离线和域名仍需实测。
