# EA855 evo 教学系统数值模型

## 边界与用途

`engine/systems/` 是纯 TypeScript、无 UI 依赖的确定性教学模型。所有求解器都以 `1/600 s` 固定步长推进；调用方只提交经过播放倍率换算后的**模拟时间**。普通热过程始终按提交的真实模拟秒数推进，本模块没有隐式暖机加速。

模型解释气路、燃烧相位、平均扭矩、热管理、润滑和 DCT 液压之间的因果关系，但不是 ECU、TCU 或制造级热流体标定。不模拟 CFD、爆震、排放、损坏和磨损。

## 模块

- `EngineSystems`：外部给定转速、节气门、负载和运行状态，输出公共 `EngineSystemsState`。节气门、歧管和涡轮分别有惯性；`chargeMassMg` 给出每缸每循环新鲜充气量；五缸按 `1→2→4→5→3` 每 144° 点火，一循环 720°。
- `EngineBench`：在 `EngineSystems` 外积分起动机、0.32 kg·m² 等效惯量、怠速/目标转速控制和 0–100% 台架吸收负载。`setCrankAngle()` 只改变 720° 相位，不回退时间、温度或累计状态。
- `DctHydraulics`：积分泵速、总管压力、K1/K2 活塞和四组拨叉压力。接合量只由越过触点压力后的活塞压力产生。滑摩功率按 `|T·Δω|` 计算，累计耗散不减；离合器片和油液可在滑摩停止后冷却。
- `PowertrainSystemsAdapter`：只读接入现有 `PowertrainState`，把转速、节气门、离合器和拨叉状态映射给新增观察模型；不接管或修改现有整车求解。

统一入口为 `engine/systems/index.ts`。例如：

```ts
import { PowertrainSystemsAdapter } from './engine/systems';

const observations = new PowertrainSystemsAdapter();

// 先由现有 Powertrain 推进，再用同一段模拟时间更新观察层。
powertrain.advance(simulatedSeconds);
const { engine, dct } = observations.advance(
  powertrain.state,
  simulatedSeconds,
);
```

独立台架冷启动：

```ts
import { EngineBench } from './engine/systems';

const bench = new EngineBench();
bench.configure({ ignition: true, starter: true, targetRpm: 800, load: 0 });
bench.advance(1 / 60); // 渲染帧只负责提交模拟时间
```

## 校准与教学估算

现有展品采用的公开性能锚点保持不变：2250–5600 rpm 为 500 Nm，5600–7000 rpm 为约 294 kW。`calibratedFullLoadTorqueNm()` 单独校准循环平均净扭矩；缸压曲线只服务于冲程、点火和压力变化教学，绝不从示意缸压反推平均扭矩。

`ENGINE_SYSTEMS_SPEC`、`ENGINE_BENCH_SPEC` 和 `DCT_HYDRAULICS_SPEC` 集中保存参数。带 `educationalEstimate: true` 的时间常数、等效惯量、泵比、压力阈值、热容量、散热系数、温度目标、空气效率和 AFR 均为教学估算，不声称是原厂标定。性能锚点的资料分级和链接见 `docs/POWERTRAIN.md`。

由于没有可靠的 EA855 evo 原厂涡轮绝对轴速资料，公共契约只暴露 `turboRpmNormalized: 0–1`，不输出虚假的绝对 rpm。

## 数值约束

- 压力均为绝对压力时保证大于零；油压、流量、温度、扭矩、能量和所有归一化量均有限并限幅。
- `advance(0)` 不改变状态；不足固定步长的余量留到下一次调用。
- 30/60/120 FPS、0.1× 慢放和不同时间分块只要累计提交相同模拟时间，就执行相同数量、相同顺序的固定步。
- 节温器在 93°C 开启、88°C 关闭，执行器开度带惯性，因此能显示滞回而不是温度阈值抖动。
- `slipEnergyJ` 是累计耗散，`slipPowerKw`、离合器片温度和油温是瞬时/状态量；停止滑摩后累计值保持，温度继续冷却。

## 验证

自动测试位于 `tests/engine-systems.test.ts`，覆盖点火顺序与相位、冷启动与油压、台架负载、涡轮迟滞、性能锚点、热循环与节温器滞回、DCT 压力/接合顺序、滑摩热、数值有限性、时间分块确定性和只读 Powertrain 接入。
