# 资料、建模基准与近似项

基准车型：2021 年发布的 Audi RS3 8Y，欧洲 400 PS / 500 Nm 规格。不是美规 hp，也不混用 2017 DAZA 的 480 Nm 标定。

## 官方资料

- [Audi 2021 RS3 engine](https://www.audi.com/en/high-performance-redefined-audi-rs-3-sportback-and-rs-3-sedan-2021-14310/the-engine-legendary-five-cylinder-14313)：1-2-4-5-3，144°，294 kW/400 PS，5600–7000 rpm，铝缸体与空心曲轴。
- [Audi RS3 brochure](https://media.audi.com/is/content/audi/nemo/me/brochures/en/rs3-sedan.pdf)：2480 cm³，500 Nm / 2250–5600 rpm。
- [50 years of the Audi five-cylinder](https://www.audi.com/en/press-releases/50-years-of-the-audi-five-cylinder-16921)：82.5 × 92.8 mm，横置布局。
- [Audi training 920273 / EA855 evo, NHTSA copy](https://static.nhtsa.gov/odi/tsbs/2017/MC-10127901-9999.pdf)：PDF 第 7 页规格，第 9–11 页缸体/曲轴/活塞，第 20–21 页正时传动。较早的 EA855 evo 结构参考，不代表 8Y 完整标定。88 mm 缸距；两级链位于变速箱侧；曲轴25齿/中间40齿，中间24齿/凸轮30齿，总传动比1/2。
- [Audi official image A250065](https://www.audi.com/en/photos/detail/audi-rs-3-sedan-127100)：发动机饰盖的五道红色隆起、长条正面徽章、侧面进气管与总成布局的可见外观参考。原图著作权归 Audi；交付模型为自行建立的几何，未把照片打包作纹理。

## 精度等级

| 数据/部件 | 类型 | 说明 |
|---|---|---|
| 缸径82.5、行程92.8、曲柄半径46.4 mm | 官方 / 推导 | 机构计算使用真实毫米尺寸 |
| 88 mm缸距、20气门、两级链 | 同系列参考 | 来自早期EA855 evo资料 |
| 连杆中心距144 mm | 建模估算 | 为运动演示参数，不是官方确认值 |
| 外壳、附件、铸件轮廓、细管 | 照片重建 / 估算 | 缺少原厂CAD与多方向测量，保留主要布局与辨识特征，非制造级复刻 |
| 活塞冠高27 mm、气门升程8 mm | 教学估算 | 保留运动间隙；不作为维修依据 |
| 凸轮轮廓、配气曲线 | 教学近似 | 固定180°阶段，无重叠。凸轮可视几何近似，非可制造轮廓 |
| AVS/VVT | 未模拟标定 | 模型保留凸轮与链轮，不实现原厂可变正时控制 |
| 800 rpm | 演示默认 | 非官方怠速声明 |
| 7000 rpm | 演示上限 | 非原厂断油点声明 |
| 气流、火焰、声音、振动 | 视觉/合成示意 | 无缸压、热力学、涡轮转速或真实声学求解 |

## 坐标及动画约定

毫米单位，Y向上，X为曲轴轴线，Z正侧为进气/默认观察侧。1缸位于X负端（皮带端），5缸位于X正端（正时/变速箱端）。0°为1缸做功上止点。气缸物理排列1、2、3、4、5，点火角依次为0、144、576、288、432°。720°构成一周期。

活塞销Y = r cosθ + sqrt(L² − r² sin²θ)。曲柄销Y = r cosθ，Z = r sinθ。连杆以大端为旋转原点。720°内五次等间隔燃烧事件；声音差异由音色与共振近似产生，不改变点火间隔。
