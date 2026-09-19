# 属性管线

`game-config.js` 的不可变基础配置 → `stats.js` 的加成栈 → 结算属性。战斗、自动购买和 UI 共用结果；图鉴继续读取基础配置。

## 接口与数据

```js
import { createGame } from '../src/game.js';
import { createBonusStack, stat, attributes, explainStat } from '../src/stats.js';

const bonuses = createBonusStack([
  {
    target: { kind: 'unit', team: 'player', stat: 'damage' },
    type: 'multiply',
    value: 1.2,
    source: { kind: 'doctrine', id: 'assault', label: '进攻学说' },
  },
  {
    target: { kind: 'team', team: 'player', stat: 'canBuild' },
    type: 'override',
    value: false,
    source: { kind: 'challenge', id: 'no-towers', label: '无塔挑战' },
  },
]);
const game = createGame({ mode: 'incremental', bonuses });
const unit = { type: 'melee', team: 'player' }; // 也可直接传场上的部队对象
stat(game, unit, 'damage');                  // 14.4
attributes(game, unit);                    // 一份已结算的属性表，含模型元数据
explainStat(game, unit, 'damage');          // { base: 12, effects: [...], value: 14.4 }
stat(game, 'player', 'canBuild');           // false
```

每项加成仅有 `target`、`type`、`value`、`source` 四部分。`createBonusStack(...contributions)` 接收多个贡献数组，校验、复制并冻结它们。未知属性、运算、来源类别、非法数值或选择器会报错。

- `target.stat` 必填；可按 `kind`、`team`、具体 `type`、部队 `role`、`age` 筛选。省略某个条件意味着不限制它。
- `kind`：`unit`、`turret`、`ability`、`team`、`reward`、`civilization`。部队／炮塔可从 `type` 推导；大招需显式指定 `kind: 'ability'`。
- `role` 使用现有配置的 `melee`、`archer`、`heavy`；这里的前排招募位置是 `melee`，与模型的前后绘制层不同。
- 单位／炮塔的 `age` 指模型所属时代；`team` 的 `age` 指阵营当前时代。查询下一时代预览可传 `{ kind: 'team', team: 'player', age: 2 }`。
- `source` 保留稳定 `id`、显示用 `label` 和类别 `kind`：`doctrine`、`challenge`、`depth`、`milestone`、`age`、`status`。`legacy` 仅供旧调用转换。

现有档案、天赋、挑战由 `progression-bonuses.js:getRunBonuses(run)` 生成；时代为收入、基地生命和敌方起始金币贡献覆盖项。沸油减速作为临时 `status` 乘数进入速度管线。深度、里程碑可直接提交相同格式，本轮没有新增对应玩法或空的状态层。

## 运算顺序

1. 取基础值，依栈顺序执行覆盖，最后一个覆盖胜出。
2. 所有加法求和后加到该值。
3. 乘上所有乘法的乘积。
4. 按 `STAT_DEFINITIONS` 限幅、取整。

即 `(最后覆盖值或基础值 + Σ加法) × Π乘法`。覆盖不会吞掉其它来源的加法／乘法；想让最终伤害为 0，应使用乘 0。布尔限制只支持 `override`，最后一项决定允许或禁用。时代覆盖位于本轮其它贡献之前。

生命四舍五入；造价、起始金币、奖励和数量上限向下取整；收入、伤害、速度、距离和时间保留小数。单位自身的经验／赏金先结算，再作为 `reward` 的基础值传入接收方管线；阵亡经验仍先 `floor(单位经验 × 0.75)`，再结算接收方经验并向下取整。现有战争档案和挑战经验只作用于 `reward`，不会同时放大受害单位的基础奖励。

`damage` 的**乘法**覆盖主攻击、近身攻击、冲锋附加伤害、塔的持续伤害和大招对基地伤害。对副攻击做加法或覆盖时，显式指定 `meleeDamage`、`chargeDamage`、`tickDamage`、`baseDamage`，避免把一个固定加值重复叠到复合攻击的每部分。

## 属性表

完整定义与边界以 `src/stats.js:STAT_DEFINITIONS` 为准。标记 `quantity: true` 的成长属性返回 Quantity，必须使用 `Q` 运算；它们的加成值也支持科学计数字符串，不再受 `1e9` 限制。时间、坐标、数量上限等仍为 Number。详见 [数值维护说明](quantities.md)。

| 对象 | 主要属性 |
| --- | --- |
| 部队 | `damage`、`meleeDamage`、`chargeDamage`、`health`、`armor`、`armorPierce`、`rangedReduction`、`speed`、`range`、`baseRange`、`meleeRange`、`attackInterval`、`attackSpeed`、`trainTime`、`cost`、`bounty`、`experience`、`enabled` |
| 炮塔 | `damage`、`cost`、`range`、`attackInterval`、`attackSpeed`、`chargeTime`、`burstInterval`、`splash`、`fieldRadius`、`fieldDuration`、`tickDamage`、`tickInterval`、`slow`、`enabled` |
| 大招 | `damage`、`baseDamage`、`radius`、`cooldown`、`healing`、`enabled` |
| 阵营 | `startingGold`、`income`、`baseHealth`、`armyLimit`、`queueLimit`、`initialTurretSlots`、`maxTurretSlots`、`expansionCost`、`canRecruit`、`canBuild`、`canExpand`、`canEvolve`、`canCast` |
| 奖励接收方 | `bounty`、`experience`，调用 `stat(game, { kind: 'reward', team }, key, 基础奖励)` |
| 文明 | `legacy` |

`attackSpeed` 是攻速倍率，基础为 1；实际攻击间隔为结算后的 `attackInterval / attackSpeed`，最低一帧。炮塔配置里的 `interval` 映射为同一个 `attackInterval`，结算表保留 `interval` 别名供既有逻辑使用。技能冷却以秒为单位。

当前模型最多支持 4 个炮位，管线允许在 0–4 之间设定；部队上限安全边界为 256、队列为 64。默认仍为 16 人、5 单、4 个可购买炮位。自动购买自设队列／炮位目标与实际限制取较小值。降低容量不会删除已存在的付费订单、部队或炮塔，新操作会检查新上限；存档按安全边界校验，以保留合法的旧资产。

## 限制规则与扩展

“不能建塔”使用 `team.canBuild = false`；它同时阻止购买和扩容。“只能招前排”可为 `unit.role = 'archer'` 和 `unit.role = 'heavy'` 分别贡献 `enabled = false`。限制进入正常 `getRecruitState` / `getTurretState` 等路径，手动操作、快捷键、自动购买和 AI 都遵守。均衡编队跳过禁用类别，单一目标被禁用时等待玩家更改设置。

增量模式的正式新规则应在 `getRunBonuses()` 对应来源处生成，不在 `game.js`、转场或 UI 再乘一次。用于实验时，`createCivilizationRun(permanent, challengeLevel, extraBonuses)` 或 `simulateRun({ ..., bonuses })` 可提交附加规则；它们按快照保存于本轮，随普通战役转场和主动重开保留。正常重建／开始下一难度时，重新由正式配置生成新一轮的来源。

## 生命周期、兼容与验证

- 新开局与转场共用 `createConflict()`；初始资源、生命和炮位统一结算。转场覆写为已保留的玩家金币与订单退款，不再发一次起始补贴。
- 订单记录实际 `paid` 和 `duration`；拆塔退还实际支付价的一半，变化后的折扣不改变既有退款。
- 弹药、附带火焰／沸油及已施放大招在发射时记录结算快照。命中只处理目标的护甲／盾牌，不再读取伤害加成。出售来源炮塔、进化和刷新不改变已发射攻击。
- 缓存按战斗对象、不可变加成栈引用与时代失效，不写进存档。临时减速单独读取实体状态。新栈必须通过 `createBonusStack()` 替换，不能原地修改。
- 存档 v7 保存栈及来源，成长数值编码为规范字符串，验证其与本轮快照一致；v1–v6 先按原格式校验，再迁移。v5 的原始弹药／地面伤害仅在迁移时转换一次，不重放奖励或资源发放。
- `createGame()` 仍为经典模式，忽略永久加成；旧 `modifiers` / `enemyModifiers` 参数只保留一次性输入适配。新战斗状态不保存这两个字段；旧 `getBaseHealth()` 等导出仅作为 `stat()` 的兼容别名。

`npm test` 覆盖共享战斗及管线逻辑；`/tests/` 另外验证卡片价格、训练时长、队列、禁用按钮和来源提示。`tests/fixtures/v5-battle.js` 来自重构前模拟器，核对迁移后的在途伤害。参数扫描可对比重构前后的胜负、时长、金币、经验与遗产。
