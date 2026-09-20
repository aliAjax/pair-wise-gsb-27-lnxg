// 规则引擎冒烟测试（不进页面，不依赖 localStorage）
import { runBidding, chargeableWeight } from "../src/domain/rules";
import { verifySnapshot } from "../src/domain/verify";
import { seedCarriers, seedRateCards, seedRules } from "../src/data/seed";
import type { QuoteRecord, QuoteRequest } from "../src/domain/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const rule = seedRules[0];
const baseRequest: QuoteRequest = {
  customer: "测试客户",
  fromCity: "上海",
  toCity: "南京",
  actualWeightKg: 100,
  volumeM3: 1, // 体积重 250kg > 实重 100kg
  timeliness: "标准达",
  tempMode: "常温",
  shipDate: "2026-09-20"
};

console.log("1) 体积重取大");
check("计费重=max(100,250,10)=250", chargeableWeight(100, 1, rule) === 250);

console.log("2) 常温标准达竞价：最低价中标且仅合格者参与");
const r1 = runBidding({ request: baseRequest, carriers: seedCarriers, rule, rateCards: seedRateCards, onDate: "2026-09-20" });
check("合格2家（鼎力资质已过期、老牌停用）", r1.eligible.length === 2, `实际 ${r1.eligible.length}`);
check("中标=丰驰速运", r1.winner?.carrierId === "car-sf", r1.winner?.carrierId ?? "");
const totals = r1.eligible.map((b) => b.fee!.total);
check("eligible 已按总价升序", totals.every((t, i) => i === 0 || totals[i - 1] <= t));
check("落选列表含停用承运商", r1.ineligible.some((b) => b.reason === "carrier_inactive"));

console.log("3) 冷冻单：丰驰/鼎力缺冷链资质，仅北极冷链合格");
const r2 = runBidding({
  request: { ...baseRequest, tempMode: "冷冻" },
  carriers: seedCarriers, rule, rateCards: seedRateCards, onDate: "2026-09-20"
});
check("中标=北极冷链", r2.winner?.carrierId === "car-cold");
check("缺失资质汇总：丰驰缺 COLD",
  r2.missingQuals.some((g) => g.qualType === "COLD" && g.carriers.includes("丰驰速运")),
  JSON.stringify(r2.missingQuals));
check("缺失资质汇总：鼎力 GENERAL 已过期（先于 COLD 被拦）",
  r2.missingQuals.some((g) => g.qualType === "GENERAL" && g.carriers.includes("鼎力物流")),
  JSON.stringify(r2.missingQuals));

console.log("4) 资质过期：发货日 2026-09-20 鼎力普通资质 8-31 到期");
const dl = r1.ineligible.find((b) => b.carrierId === "car-debang");
check("鼎力在常温单因过期被淘汰", dl?.reason === "qual_expired", dl?.reason ?? "");

console.log("5) 无覆盖线路：阻止下单并列冲突线路");
const r3 = runBidding({
  request: { ...baseRequest, fromCity: "成都", toCity: "广州" },
  carriers: seedCarriers, rule, rateCards: seedRateCards, onDate: "2026-09-20"
});
check("winner 为 null", r3.winner === null);
check("列出冲突线路", r3.conflictingLanes.includes("成都-广州"), JSON.stringify(r3.conflictingLanes));
check("有效覆盖承运商数=0", r3.coveringCarrierCount === 0);

console.log("6) 快照核对：中标承运商停用后历史报价仍按快照");
const winner = r2.winner!;
const quote = {
  id: "q1", quoteNo: "BJ-1", chainId: "q1", seq: 1, status: "confirmed",
  customer: "测试客户", request: { ...baseRequest, tempMode: "冷冻" },
  winnerSnapshot: { carrierId: winner.carrierId, carrierName: winner.carrierName, fee: structuredClone(winner.fee) },
  bidsSnapshot: structuredClone([...r2.eligible, ...r2.ineligible]),
  ruleSnapshot: structuredClone(rule),
  carrierSnapshotAtFreeze: {},
  confirmedAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
} as QuoteRecord;

const carriersAfterDeactivate = seedCarriers.map((c) => ({ ...c, active: c.id === "car-cold" ? false : c.active }));
const v = verifySnapshot(quote, carriersAfterDeactivate, seedRules, seedRateCards)!;
check("能取出核对结果", Boolean(v));
check("快照金额不变", v.frozenTotal === winner.fee.total);
check("当前状态=停用", v.carrierActiveNow === false);
check("有停用提示", v.notes.some((n) => n.includes("停用")));
check("现行重算仍可对比（费率卡还在）", v.feeMatches === true, `feeMatches=${String(v.feeMatches)}`);

console.log("7) 费率卡改价后：快照与现行不一致，以快照为准");
const changedCards = structuredClone(seedRateCards).map((card) =>
  card.carrierId === "car-cold" ? { ...card, perKg: 9.9 } : card
);
const v2 = verifySnapshot(quote, seedCarriers, seedRules, changedCards)!;
check("重算金额不同", v2.feeMatches === false);
check("差异提示存在", v2.notes.some((n) => n.includes("不一致")));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
