# SystemLayers 交付与复现

本层用于 EA855 evo / DQ500 展陈空间解释，不是原厂内部 CAD。只新增顶层空对象 `SystemLayers` 及其子树：`AirSystem`（含排气）、`OilSystem`、`CoolantSystem`、`HydraulicSystem`、`SystemMotionAnchors`。系统管路颜色为固定类别色，不表示温度；没有粒子、火焰或烘焙动画。

## 复现

从仓库根目录运行（Blender 4.5 LTS）：

```powershell
$env:BLENDER = 'Z:/CODE/engine-simulation/work/blender-4.5.3-windows-x64/blender.exe'
& $env:BLENDER --background --python-exit-code 1 --python scripts/build_system_layers.py
python scripts/test_system_layers.py
python scripts/test_system_preservation.py
& $env:BLENDER --background --python-exit-code 1 --python scripts/render_system_layers.py
python scripts/compose_system_renders.py
node --import tsx --test tests/model.test.ts tests/transmission-model.test.ts tests/system-layers-model.test.ts tests/physics.test.ts tests/powertrain.test.ts tests/engine-systems.test.ts
```

合成对照图需要 Pillow；Blender 渲染本身不需要外部依赖。总重建脚本未接入本层，由 Agent 4 在现有最后阶段之后接入。构建只删除旧 SystemLayers 子树及其不再使用的网格数据，不做全局 orphan purge。材料使用固定 SYS_MAT 名称复用。保存压缩 blend 后立即导出 GLB，`export_yup=False`、`export_extras=True`、`export_animations=False`，保留 UV、法线和原有纹理。导出后仅按字节相同内容合并 bufferView 存储，不量化、不用 Draco、不需要前端解码器。

## 坐标、锚点与路径

毫米，Y 向上，X 为曲轴方向，Z 正侧为进气侧。根与系统组均为单位变换。路径点直接处于此坐标系，命名 `SYS_<DOMAIN>_<PATH>_<NN>`，从 00 起编号，extras 恰为 system / path / order / direction / role；order 从零连续，direction=1，role=anchor。可见管线另命名 SYS_ROUTE_<path>，role=route，不能误当作路径点。按 system 和 path 筛选后按 order 排序，按 direction 沿线运行。

26 条 canonical path：

- air_intake；air_cylinder_1、2、3、4、5。
- exhaust_cylinder_1、2、3、4、5；exhaust_turbo。
- oil_main、oil_crank、oil_head、oil_turbo。
- coolant_block、coolant_head、coolant_turbo。
- hydraulic_k1、hydraulic_k2、hydraulic_fork_15、hydraulic_fork_37、hydraulic_fork_4r、hydraulic_fork_26、hydraulic_return。

进气主线依次经过入口、压气机、绕皮带端的外置增压/中冷示意、节气门和歧管；五个支路从歧管到进气门。排气从五缸气门外侧汇流至涡轮与下行出口。燃烧视图利用原有活塞和气门表达气缸位置，不新增燃烧特效。油主线为油底壳—泵—主油道；曲轴、缸盖、涡轮路径带供油和回油段。冷却主线经过泵和缸体，缸盖与涡轮支路经节温器/外置回路回泵。液压线路从泵和阀块分至两组离合器及四个拨叉，另有回流线。多条路径共享端点或干线是有意的拓扑连接，不表示必须同时流动。

| 运动空对象 | ptMotion | 局部原点 mm | 本地旋转轴 |
|---|---|---|---|
| SYSTurboRotor | turbo | 95,158,-159 | Z |
| SYSStarterRotor | starter | 299,-112,0 | X |
| SYSStarterRingGear | engine | 299,0,0 | X |
| SYSHydraulicPump | hydraulicPump | 365,-115,-90 | X |
| SYSWaterPump | waterPump | -240,105,90 | X |
| SYSOilPump | oilPump | -235,25,95 | X |

所有转子可见几何以锚点为父对象，轴几何以局部零点对称，不把世界坐标烘进转子网格。起动齿圈与 DCTFlywheel 同轴同平面，起动机中心距112 mm、示意半径12 mm与齿圈半径100 mm相接。叶片、齿圈见证环是运动示意，不模拟啮合齿形或 Bendix 轴向动作。前端尚未在本任务接入这些新 motion 值。

## 参考与教学近似

来源沿用 [SOURCES.md](SOURCES.md) 与 [POWERTRAIN.md](POWERTRAIN.md)，本次没有新增实测或原厂 CAD 来源。

| 尺寸/布局 | 性质 |
|---|---|
| 88 mm 五缸间距；82.5 mm 缸径、92.8 mm 行程 | 既有参考数据，系统支路沿既有缸中心布置；未改变机构尺寸 |
| 涡轮中心95,158,-159、飞轮299,0,0、离合器和拨叉位置 | 从当前交付模型继承的布局；该模型附件/传动尺寸本身为教学估算 |
| 全部新增管径2.5–13 mm半径、弯折、长度、泵半径、阀块、节温器、中冷示意尺寸 | 本任务教学近似，无原厂尺寸依据 |
| 内部油道、水套、液压钻孔、汇流与回流 | 外置示意路线，不声称还原真实内部走向；端点进入所属组件是有意连接 |

## 验收记录

- 新增270节点（含根），其中167路径锚点、6运动锚点；26 canonical path。
- 新增5,012三角面，低于100,000上限。最终GLB 13,291,460字节（13.29 MB）；blend 4,211,211字节。Blender保存的内部元数据可能导致blend压缩字节数稍变，不作为幂等判据。
- 连续两次构建：节点、父级、局部矩阵、extras、网格命名的签名一致；GLB逐字节SHA-256一致：`1715d063b2e2d7422fd754354aa47614eda93252267902a839f54b539ebac524`。
- 系统语义签名：`d2c20622343fe43cac7346cf462e50c07c7f3909df8389f877b97029b63f234a`。
- 对比系统层之前资产提交 `e3f77f171e70c98018059360bb4d5fccec459025`：原1,622节点的局部变换、子节点名称、extras不变；1,431网格节点的顶点属性（含UV/法线）和三角索引逐字节一致，原纹理数量保留。
- 33项测试通过，包含原模型、传动、物理、动力总成、发动机系统及新增锚点测试。原点测试核对位置、轴、无烘焙旋转以及局部轴网格边界对称。
- 五组离线对照图，每组左侧机构、右侧剖切。渲染脚本仅在内存切除外壳Z正侧，退出不保存，原交付外壳不变。检查中修正了后半壳遮挡和排气出口裁切；外部干线没有可见地穿越不相关旋转机构。背面支路在某些角度仍会被机构遮挡，对照视图用于辅助辨认；此检查不等于全工况CAD干涉分析。

## 交付文件

- `models/rs3-ea855-evo.blend`
- `public/models/rs3-ea855-evo.glb`
- `outputs/system-layers/01-air-turbo-qa.png`
- `outputs/system-layers/02-combustion-exhaust-qa.png`
- `outputs/system-layers/03-lubrication-qa.png`
- `outputs/system-layers/04-cooling-qa.png`
- `outputs/system-layers/05-dct-hydraulics-qa.png`

同目录JSON报告和model-tests.txt保存验证结果；原始十张渲染可按脚本重新生成。未修改app、engine、package.json、hosting配置或现有总重建脚本。
