# 多承运商物流竞价台

- 行业：物流
- 技术栈：Vue 3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

## 业务闭环

1. 录入客户、始发/目的城市、实重、体积、时效、温控；
2. 按当前规则书计算体积重（`体积 m³ × 系数`），与实重取大作为计费重；
3. 仅**当前资质有效**且**覆盖该线路**（时效/温控/重量区间）的承运商获得出价资格，取总价最低者中标；
4. 没有合格承运商时**阻止下单**，页面逐家列出缺失资质、过期资质与线路冲突；
5. 确认后冻结中标承运商费率、规则版本、费用明细与当时整张竞价表；
6. 换价不允许改旧记录，只能**新建带原因的修订**，修订按当前规则重新竞价，旧版本原样保留成链；
7. 承运商停用只影响后续竞价，历史报价单仍可按快照逐项重算核对，页面同时回显其停用状态；
8. 全部状态持久化在 localStorage（键 `logistics-bidding-v1`），刷新后报价链与停用状态一致。

## 分层结构（数据 / 规则 / 页面分开）

```
src/
├── types.ts                 # 领域模型
├── data/
│   ├── seed.ts              # 承运商、规则书版本、历史报价单种子
│   └── storage.ts           # localStorage 仓储，不含业务规则
├── rules/
│   └── engine.ts            # 纯函数规则引擎：体积重、资质/线路筛选、计价、快照核对
├── stores/
│   └── bidding.ts           # Pinia：编排竞价、快照冻结、修订链、停用与发版
├── components/
│   ├── AuctionForm.vue      # 运单录入
│   ├── AuctionResultPanel.vue # 出价表 / 落选原因 / 阻断提示
│   ├── QuoteDesk.vue        # 竞价台
│   ├── OrdersView.vue       # 报价单链与换价修订
│   ├── ReconcileBadge.vue   # 快照核对结果
│   └── AdminView.vue        # 承运商启停、规则书发布
└── utils/format.ts
```

规则引擎不依赖 Pinia 与 DOM，输入快照即可重算，实时竞价与历史核对走同一条 `priceShipment` 路径。
