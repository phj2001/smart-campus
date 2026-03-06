# Smart Campus 项目结构说明

本次整理目标是仅优化目录结构与模块归类，不改变现有功能行为。

## 当前目录结构

```text
smart-campus/
├─ public/
│  └─ data/                     # 地图静态资源（GeoJSON、纹理、模型、瓦片等）
├─ src/
│  ├─ app/
│  │  └─ App.tsx                # 应用壳层：布局、侧栏、路由挂载
│  ├─ features/
│  │  └─ map/
│  │     ├─ components/
│  │     │  └─ CesiumViewer.tsx # 地图主渲染与交互逻辑
│  │     ├─ pages/
│  │     │  └─ MapPage.tsx      # 地图页面容器
│  │     ├─ store/
│  │     │  └─ appStore.ts      # 地图状态管理（图层、导航、选中要素）
│  │     ├─ constants/
│  │     │  └─ campus.ts        # 校园边界、相机初始参数等常量
│  │     └─ utils/
│  │        ├─ cesiumHelpers.ts     # Cesium 相关辅助函数
│  │        ├─ roadNetwork.ts       # 路网图构建
│  │        ├─ pathfinding.ts       # 路径规划（Dijkstra）
│  │        └─ roadBeautification.ts# 道路贴图与树木美化
│  ├─ shared/
│  │  └─ styles/
│  │     └─ global.css          # 全局样式
│  ├─ main.tsx                  # 应用入口（Provider 装配）
│  └─ vite-env.d.ts
├─ index.html
├─ package.json
├─ vite.config.ts
└─ tsconfig.json
```

## 核心运行链路

1. `src/main.tsx` 初始化 React、路由与全局 Provider。
2. `src/app/App.tsx` 提供外层 UI 框架并挂载路由。
3. `src/features/map/pages/MapPage.tsx` 挂载 `CesiumViewer`。
4. `src/features/map/components/CesiumViewer.tsx` 负责地图渲染、数据加载、点选、导航可视化。
5. `src/features/map/store/appStore.ts` 在 UI 与地图之间同步交互状态。

## 结构规范建议（后续开发）

- 新地图能力优先放在 `src/features/map/` 内按 `components/pages/store/utils/constants` 分层。
- 可复用且跨功能使用的内容放入 `src/shared/`。
- `public/data/` 仅存放静态资源，不放业务逻辑代码。
- 避免在 `src/` 根目录直接堆叠业务文件，统一通过 `app` 与 `features` 组织。

