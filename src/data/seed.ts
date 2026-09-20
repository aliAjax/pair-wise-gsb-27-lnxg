// 数据层：种子数据（与业务规则、页面完全分离）
// 首次进入时写入 localStorage，之后可在“数据管理”中维护，不影响规则代码。

import type { Carrier, City, PricingRule, QuoteRecord, RateCard } from "../domain/types";

export const STORAGE_KEYS = {
  cities: "lbd-cities",
  carriers: "lbd-carriers",
  rules: "lbd-rules",
  rateCards: "lbd-rate-cards",
  quotes: "lbd-quotes"
} as const;

export const seedCities: City[] = [
  { code: "SH", name: "上海" },
  { code: "NJ", name: "南京" },
  { code: "HZ", name: "杭州" },
  { code: "HF", name: "合肥" },
  { code: "BJ", name: "北京" },
  { code: "GZ", name: "广州" },
  { code: "SZ", name: "深圳" },
  { code: "CD", name: "成都" }
];

export const seedCarriers: Carrier[] = [
  {
    id: "car-sf",
    name: "丰驰速运",
    code: "FC",
    active: true,
    qualifications: [
      { type: "GENERAL", validFrom: "2025-01-01", validUntil: "2027-12-31" },
      { type: "EXPRESS", validFrom: "2025-01-01", validUntil: "2027-12-31" }
    ],
    lanes: ["上海-南京", "南京-上海", "上海-杭州", "杭州-上海", "北京-上海", "上海-北京"],
    note: "时效强，常温干线为主"
  },
  {
    id: "car-cold",
    name: "北极冷链",
    code: "BJ",
    active: true,
    qualifications: [
      { type: "GENERAL", validFrom: "2024-06-01", validUntil: "2027-06-30" },
      { type: "COLD", validFrom: "2024-06-01", validUntil: "2027-06-30", minTempC: -25, maxTempC: 8 }
    ],
    lanes: ["上海-南京", "杭州-合肥", "合肥-杭州", "上海-杭州", "广州-深圳", "深圳-广州"],
    note: "冷藏冷冻资质齐全"
  },
  {
    id: "car-debang",
    name: "鼎力物流",
    code: "DL",
    active: true,
    qualifications: [
      { type: "GENERAL", validFrom: "2023-03-01", validUntil: "2026-08-31" }
      // 冷链资质将于 2026-08-31 到期 —— 2026-09 已失效，用于演示缺失资质
    ],
    lanes: ["上海-南京", "南京-上海", "上海-杭州", "成都-上海", "北京-上海"],
    note: "大宗常温货主力"
  },
  {
    id: "car-old",
    name: "老牌快运",
    code: "LP",
    active: false, // 已停用：用于演示“停用后历史报价仍按快照核对”
    qualifications: [
      { type: "GENERAL", validFrom: "2022-01-01", validUntil: "2028-01-01" }
    ],
    lanes: ["上海-南京"],
    note: "2026-05 起停用，历史报价保留"
  }
];

export const seedRules: PricingRule[] = [
  {
    id: "rule-v1",
    version: "R2025.1",
    status: "active",
    effectiveFrom: "2025-01-01",
    volumetricFactor: 250, // 体积重 = 体积(m³) × 250kg/m³
    minChargeableKg: 10,
    currency: "CNY",
    note: "2025 年度计费口径：体积重系数 250kg/m³，最低计费重 10kg"
  }
];

export const seedRateCards: RateCard[] = [
  {
    id: "rate-sf-sh-nj",
    ruleVersionId: "rule-v1",
    carrierId: "car-sf",
    lane: "上海-南京",
    baseFee: 80,
    perKg: 4.2,
    fuelRate: 0.09,
    timelinessSurcharge: { 标准达: 0, 次日达: 120, 当日达: 260 },
    tempSurcharge: { 常温: 0 }
  },
  {
    id: "rate-cold-sh-nj",
    ruleVersionId: "rule-v1",
    carrierId: "car-cold",
    lane: "上海-南京",
    baseFee: 120,
    perKg: 5.1,
    fuelRate: 0.1,
    timelinessSurcharge: { 标准达: 0, 次日达: 150, 当日达: 320 },
    tempSurcharge: { 常温: 0, 冷藏: 180, 冷冻: 260 }
  },
  {
    id: "rate-dl-sh-nj",
    ruleVersionId: "rule-v1",
    carrierId: "car-debang",
    lane: "上海-南京",
    baseFee: 70,
    perKg: 3.8,
    fuelRate: 0.08,
    timelinessSurcharge: { 标准达: 0, 次日达: 140, 当日达: 300 },
    tempSurcharge: { 常温: 0 }
  },
  {
    id: "rate-old-sh-nj",
    ruleVersionId: "rule-v1",
    carrierId: "car-old",
    lane: "上海-南京",
    baseFee: 65,
    perKg: 3.5,
    fuelRate: 0.08,
    timelinessSurcharge: { 标准达: 0, 次日达: 130 },
    tempSurcharge: { 常温: 0 }
  },
  {
    id: "rate-cold-hz-hf",
    ruleVersionId: "rule-v1",
    carrierId: "car-cold",
    lane: "杭州-合肥",
    baseFee: 150,
    perKg: 5.6,
    fuelRate: 0.1,
    timelinessSurcharge: { 标准达: 0, 次日达: 180 },
    tempSurcharge: { 常温: 0, 冷藏: 200, 冷冻: 300 }
  },
  {
    id: "rate-sf-sh-hz",
    ruleVersionId: "rule-v1",
    carrierId: "car-sf",
    lane: "上海-杭州",
    baseFee: 70,
    perKg: 3.9,
    fuelRate: 0.09,
    timelinessSurcharge: { 标准达: 0, 次日达: 100, 当日达: 220 },
    tempSurcharge: { 常温: 0 }
  }
];

// 一条历史报价：中标方为现已停用的「老牌快运」，用于演示停用后仍按冻结快照核对
// 费用（按 rule-v1 / rate-old-sh-nj 手工冻结）：
// 计费重 max(80, 0.5×250=125, 10)=125kg；65 + 3.5×125=437.5 + (65+437.5)×8%=40.2 = 542.7
export const seedQuotes: QuoteRecord[] = [
  {
    id: "seed-q1",
    quoteNo: "BJ-20260410-001",
    chainId: "seed-q1",
    seq: 1,
    status: "confirmed",
    customer: "海沃商贸",
    request: {
      customer: "海沃商贸",
      fromCity: "上海",
      toCity: "南京",
      actualWeightKg: 80,
      volumeM3: 0.5,
      timeliness: "标准达",
      tempMode: "常温",
      tempRangeC: "",
      shipDate: "2026-04-12"
    },
    winnerSnapshot: {
      carrierId: "car-old",
      carrierName: "老牌快运",
      fee: {
        chargeableWeightKg: 125,
        lines: [
          { key: "base", label: "起重价", amount: 65 },
          { key: "weight", label: "计重运费（3.5元/kg × 125kg）", amount: 437.5 },
          { key: "timeliness", label: "时效附加（标准达）", amount: 0 },
          { key: "temp", label: "温控附加（常温）", amount: 0 },
          { key: "fuel", label: "燃油附加（8%）", amount: 40.2 }
        ],
        total: 542.7
      }
    },
    bidsSnapshot: [
      {
        carrierId: "car-old",
        carrierName: "老牌快运",
        eligible: true,
        reason: null,
        reasonDetail: null,
        fee: {
          chargeableWeightKg: 125,
          lines: [
            { key: "base", label: "起重价", amount: 65 },
            { key: "weight", label: "计重运费（3.5元/kg × 125kg）", amount: 437.5 },
            { key: "timeliness", label: "时效附加（标准达）", amount: 0 },
            { key: "temp", label: "温控附加（常温）", amount: 0 },
            { key: "fuel", label: "燃油附加（8%）", amount: 40.2 }
          ],
          total: 542.7
        }
      }
    ],
    ruleSnapshot: seedRules[0],
    carrierSnapshotAtFreeze: {
      "car-sf": { active: true, name: "丰驰速运" },
      "car-cold": { active: true, name: "北极冷链" },
      "car-debang": { active: true, name: "鼎力物流" },
      "car-old": { active: true, name: "老牌快运" }
    },
    confirmedAt: "2026-04-10T09:30:00.000Z",
    createdAt: "2026-04-10T09:30:00.000Z"
  }
];
