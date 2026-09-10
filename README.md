# RS 3 · 五缸机械实验室

以 2021 Audi RS3 8Y / EA855 evo 为参考的本地交互式 3D 发动机模拟。React + TypeScript + Three.js，附可编辑 Blender 源模型。

## 运行

需要 Node.js 22.13 或更新版本，建议 Node.js 22/24 LTS。

```sh
npm ci
npm run dev
```

打开开发服务器输出的本地地址（默认 http://localhost:3000）。运行网页不需要 Blender；GLB 已随项目交付，大小 13.29 MB。模拟在浏览器本地运行，无应用账号、数据库、外部模型 CDN 或遥测。Sites 发布仅限所有者访问。

集成版本默认播放可跳过的冷启动，提供五个观察层、九个策展工况、实时缸压曲线、台架负载和液压双离合联动。完整验收及未覆盖项见 [集成 QA](docs/INTEGRATION-QA.md)，该文档优先于历史验收记录。

生产构建：

```sh
npm run build
npm start
```

生产服务地址以终端输出为准（Wrangler 默认使用 8787 端口）。

## 如何观察

- **实物**：参考实物重建的外部总成，可移除饰盖；拖动旋转、滚轮缩放。
- **剖切**：移除观察侧缸体与遮挡附件，保留后半缸体及完整运动机构。
- **机构**：隐藏壳体，仅看五缸、曲轴、凸轮、气门与链传动。
- **观察模式**：默认显示曲轴 30 rpm，工况转速独立；也可选 0.01× / 0.05× / 0.1×。
- **实时模式**：曲轴按工况转速运行。高转速可因显示器采样出现频闪；用观察模式辨认阶段。
- 拖动 0–720° 时间轴会暂停。`+1°`逐度前进，下一次点火按144°推进。滑块支持方向键、Home/End。
- 点击模型上方缸号或侧栏顺序按钮选择单缸。九个预设视角包括进气侧、排气侧、正时侧、变速箱、顶部和五缸剖面。
- 声音默认关闭，点击后启用合成声浪或慢放提示音。暂停立即停止声音；离开页面自动暂停。
- 四阶段：橙=做功，灰=排气，蓝=进气，紫=压缩。颜色始终伴随文字说明。

## 交付文件

- `models/rs3-ea855-evo.blend`：可编辑 Blender 4.5 LTS 工程，毫米单位，Y向上。
- `public/models/rs3-ea855-evo.glb`：网页使用的分件 glTF 2.0 模型。
- `scripts/rebuild_model.py`：在临时目录执行完整程序化建模检查，再保留已交付 Blender 手工细化，以系统层重建作为最后阶段；通过验证后更新资产。最终几何以仓库 `.blend` 为准，不能仅靠早期脚本逐字节还原手工细化。
- `scripts/detail_powertrain.py`：可重复运行的附件细化与静态变速箱外观建模。
- `scripts/render_powertrain.py`：生成总成、变速箱、排气侧三张离线验收渲染。
- `engine/powertrain.ts`：纯 TypeScript 固定步长动力系统、齿比配置及可序列化状态。
- `scripts/build_transmission.py`：可重复执行的双离合内部建模阶段。
- `scripts/render_transmission.py`：总成、剖切、机构与离合器交接四张离线渲染。
- `docs/POWERTRAIN.md`：资料分级、数值方法、参数和本次验收记录。
- `engine/physics.ts`：纯机械求解、五缸相位、帧率无关调速、跨帧点火事件。
- `engine/scene.ts`：模型加载、动画、摄像机、实例化链条、粒子与资源释放。
- `engine/audio.ts`：等间隔点火脉冲驱动的 Web Audio 合成器。
- `docs/SOURCES.md`：官方资料、同系列参考及估算尺寸清单。
- `docs/QA.md`：测试与浏览器验收记录。

GLB 不包含预烘焙动画，网页按统一曲轴角实时计算运动。Blender 源工程保留零件和初始装配，方便继续细化外形。

顶部“动力系统联动”打开七挡双离合面板。N 可空挡轰油，D/S 自动相邻换挡，M 使用升降挡按钮；R 与前进方向切换要求接近静止并踩刹车。K1 橙色、K2 蓝色，箭头亮度表示传递扭矩，预选不显示发动机承载箭头。面板同时显示滑差、扭矩、车速、换挡阶段和最近换挡曲线。

联动模式由同一固定模拟时钟驱动发动机、车辆、离合器及轴角。播放、暂停、0.01/0.02/0.05/0.1×慢放和1/60秒单步作用于整个系统；转速与720°拖动只读。切回“发动机独立观察”恢复原有转速与曲轴角控制。教学默认慢放为0.02×，点击“实时1×”可正常驾驶。

变速箱实物模式保留原有外壳，剖切模式显示后半壳，机构模式显示内部组。“双离合特写”和“齿轮路径”便于观察。几何齿数、鼓体观察开口、片数、轴距及主减速器位置均为教学近似。

重新生成模型（安装官方 Blender 4.5 LTS 后）：

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender npm run model:build
```

本机已配置官方 Blender 4.5.3 LTS 便携版于 `work/blender-4.5.3-windows-x64`，重建脚本可自动发现。Windows 示例：

```powershell
$env:BLENDER="Z:\CODE\engine-simulation\work\blender-4.5.3-windows-x64\blender.exe"
npm run model:build
& $env:BLENDER --background --python scripts/build_transmission.py
& $env:BLENDER --background --python scripts/render_transmission.py
```

`model:build` 使用 `python`，避免 Windows Store 的 `python3` 启动别名；Python 脚本本身可跨平台运行。便携运行时在被忽略的 `work/` 中，分发源码到其他机器后需自行配置 Blender。

Windows/Linux 可把 `BLENDER` 指向对应可执行文件；如果 `blender` 已在 PATH，无需设置。建模脚本顺序执行，不单独重复执行中间几何修正阶段。

## 验证

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

测试覆盖完整720°点火序列、连杆约束、92.8mm行程、气门间隙、半速凸轮轴、30/60/120fps及掉帧等价性、GLB动画节点完整性和链条外包络。lint检查应用、模拟引擎和测试源码；初始化工具附带、未使用的UI组件库保持原样。

## 精度范围

这是依据公开资料重建的机械可视化，外形和附件几何为近似，非原厂 CAD。缸径、行程、点火顺序采用官方数值；88mm缸距来自同系列培训资料；144mm连杆中心距与8mm气门升程为教学估算。固定配气不包含原厂AVS/VVT标定。气流、燃烧、声音、振动为示意，不求解真实缸压、热力学或涡轮响应。800–7000 rpm是演示范围，不声称原厂怠速或断油阈值。

## 可选代理接口

支持 `document.modelContext` 的浏览器会注册 `read_engine_state`、`configure_engine`、`read_powertrain_state` 和 `configure_powertrain`，使用与控件相同的状态和范围校验。不支持此实验接口时，所有人工操作功能仍正常工作。

动力系统写入格式：`{throttle:0.4, brake:0, mode:"M", shift:1}`，踏板为0–1，shift为±1，可省略。联动模式下独立rpm/angle设置返回模式冲突。动态读取含 m/s 车速、rpm、Nm、秒、J耗散及弧度轴角（发动机angle为度）。
