# 界面、存档与文明流程

继续使用原生 ES modules、Canvas 和静态服务器；本轮没有引入 UI 框架、构建步骤或新玩法。

## 状态 → 视图模型 → DOM

- `view-model.js` 的 `buildViewModel(session, uiState)` 投影战场。经典模式传 `{ game }`；增量模式传完整 session。暂停、选中炮位、瞄准和已分配队列位数属于显式 UI 输入。
- `civilization-view-model.js`、`automation-view-model.js`、`talent-view-model.js` 分别描述档案／结算、自动购买、天赋节点／连线。它们不访问 `window`、`document`，不购买、不发奖、不写存档。
- 视图模型的 `bindings`（其余面板直接返回映射）是普通对象，键描述 DOM 位置，值是字符串、数字、布尔值或 null。界面数值从实际属性管线获取，使用同一套 Quantity 格式化。
- `dom-bindings.js` 集中查找并缓存元素，逐绑定比较原始值，仅写入变化的属性。支持文本、value/checked/hidden/disabled、ARIA、data 属性、class、style，以及显式图标／画像写入器。一个选择器可绑定多个同值元素。

也可以使用声明式读取函数：

```js
const sync = createBindings(document, {
  '#gold': vm => vm.gold,
  '#evolve@disabled': vm => !vm.canEvolve,
  '#evolve@class:ready': vm => vm.canEvolve,
});
sync({ gold: '180', canEvolve: false });
```

元素只创建一次、事件只绑定一次。新增动态队列元素后才投影对应绑定；以后缩容时隐藏多余元素。绑定层缓存的是元素身份，替换整块 DOM 时应创建新的绑定实例。画布画像按兵种类型更新，常规帧不重绘；战场 Canvas 仍按原循环绘制。

输入框编辑途中，模型未变不会覆盖正在输入的文本。`change` 通过正常配置逻辑校验后，用 `invalidate()` 恢复或规范化值。DOM 不充当其他控件的数值来源。开关弹窗、焦点、音画反馈和动画布局仍由控制器负责。

每帧仍会生成轻量视图模型；这次解决的是散落的 DOM diff 和不可测试的显示逻辑，没有引入响应式依赖跟踪。将来若测出投影本身昂贵，再按明确的领域修订号做局部计算缓存。

## CSS 令牌

四个组件样式表统一导入 `tokens.css`。现有颜色逐一保留，以文本、表面、边框、阵营、货币及组件角色命名；共享入口包括 `--color-text-primary`、`--color-surface-page`、`--player`、`--enemy`、`--gold`。星图路线和购买闪光也读取 `--route-*`、`--purchase-flash`。

默认调色板位于 `:root, [data-civilization-layer="surface"]`。未来可在另一主题根上覆盖这些变量，无需改组件选择器。本轮只提供地表配色。Canvas 场景／人物本身仍使用美术模块中的画布配色。

## 存档 v10：输入与必要快照

运行时 session 结构保持兼容。持久化记录省去可由输入推导的字段：

| 保存 | 读取时推导 |
| --- | --- |
| 累计已获 Legacy、购买等级、历史免费赠予 | 可消费 Legacy = 累计获得 − 已付购买价格 |
| 有效循环次数、旧版自动化保留标记、用户偏好 | automation.unlocked |
| runId、battleNumber | battleId |
| 本轮升级／天赋／挑战／额外来源 | mode、完整加成栈 |
| 基地当前 HP 与命中表现、战斗时代 | 基地最大生命、阵营、固定坐标 |

仍保存完整战斗：金币、经验、单位位置和 HP、已付训练订单、炮位／炮塔、技能冷却、飞行弹药及其发射时属性、地面效果、AI、模拟时钟。伤害和支付快照已经发生，不能按当前属性重算。本轮天赋和升级快照也保留，因为结算页购买只影响下一轮。

`settled`、`processedBattleId`、`earnedLegacy` 与永久数据在同一记录内保存；这些是结算凭据，不能当作可丢弃的显示缓存。读档不会执行流程事件，也不会调用创建新局来补发资源。

购买等级是当前不可洗点、固定价格树的购买次数。以后改价、删节点或加入配装时，必须显式迁移已付费用／赠予，不能直接用新价格重算老存档。此处没有加入尚不存在的购买历史、免费洗点或定理货币。

### 文件职责

- `save.js`：导入／导出入口、同记录提交、备份、存储不可用及跨标签冲突保护。
- `save-record.js`：输入记录与完整运行时状态之间的投影／恢复；`toV8Record` 固定 v8 格式。
- `save-schema.js`：字段谓词与实体 schema；`save-primitives.js`：范围、结构深度等基本检查。
- `save-validation.js`：schema 后的领域约束，例如目标 ID、支付快照、HP 上限、天赋前置、账本和阶段／胜负一致性。
- `save-quantities.js`：指定成长字段的规范字符串编解码。
- `save-history.js`：独立于当前天赋配置的旧购买规则。
- `save-migrations.js`：每个旧版本一个纯函数，返回新对象；迁移器在每一步前验证旧记录。

v1–v9 有效存档逐版本升级到 v10，原有效记录仍保留为备份。未知版本或损坏存档阻止自动覆盖。新格式不接受冗余的派生字段，防止两份属性互相矛盾；本地存档并不承担服务器反作弊职责。

新增版本时保留已有迁移函数及历史规则，添加下一步纯数据迁移，加入真实旧格式 fixture 和不修改输入的测试。不要让旧迁移通过更新后的 `SAVE_VERSION` 跳过中间版本。

v9 用 `settings.speed` 保存正式倍速偏好，`automationRetained` 保存旧版已获得的自动化资格。旧 Autobuyer 支出从历史账本移除、文明火种免费赠予，差额由同一个账本派生；没有第二处发奖逻辑。已购精锐征召的旧玩家免费获得新的超级士兵计划门槛，历史赠予可以豁免新加入的层级门槛。当前购买仍必须遵守每层前置。

单位特性状态由 `traits.js` 声明，并通过 `validTraitState` 验证兵种、阵营、字段类型和范围。投射物的 ricochet／slow／pierce／field 等效果在发射时保存；读档不重放接敌动作或重新生成攻击。

## 显式文明状态机

`progression-machine.js` 定义 `PHASE`、转换表、守卫和所需 token；`progression.js` 的 `transitionCivilization` 是统一执行入口，执行表中指定的同步副作用。

| 事件 | 来源 | 目标／效果 |
| --- | --- | --- |
| resolve | battle | 早期敌军胜利 → victory；未来敌军胜利 → destruction 并结算；失败／平局 → defeat |
| continue | victory | 同 run 新 battle，资产转移、一次性退款 |
| rebuild | destruction / defeat | 常规新 run |
| challenge | destruction / defeat | 已解锁时进入下一难度或重试当前挑战 |
| abandon | battle / victory | 同难度新 run；控制器先提示放弃 |

resolve / continue 必须匹配 battleId；其余转换必须匹配 runId。错误阶段、未知事件、旧 ID 和已处理结算直接返回 false，不发生效果。继续、重建等原有函数保留为这些事件的兼容包装。状态机不控制战斗中的动画，不依赖动画结束来发奖。

## 回归验证

```sh
npm test
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/tests/
node sim/batch.js --out sim/results/scan.csv
```

`tests/architecture-cases.js` 覆盖纯视图模型、全部阶段／事件组合、陈旧 token、迁移纯度、捕获的 v7 记录、v8 往返、结算后购买和重建恢复、冗余／错误字段。浏览器专项检查无变化绑定零写入、输入编辑保留、非法编辑恢复、画像身份与单次点击。原有经典模式、三种模式键盘、320px 布局、星图与减少动态效果回归仍保留。

### v10 遗产经济

- 追加遗产天赋等级，不修改历史已付价格；v9 购买 schema 保存在历史表中。
- `run.legacyRules` 保留旧轮次的奖励约定，重建后采用 10；迁移不重算已结算奖励。
- `permanent.legacyMachine = { progress, produced }` 保存不足一批的进度（0 ≤ progress < 1）及累计生产所得；实际收入加入同一 `totalLegacy` 账本。
- `legacy-machine.js` 仅由 `updateProgression` 的有效战斗步调用，产能读取属性栈；不存在独立定时器或离线推进。UI 是纯投影，不发奖励。
- `legacy`、`legacyProduction` 使用 Quantity；生产周期仍为有界 Number。机器不会增加 `completedCycles` 或改变终局结算凭据。
