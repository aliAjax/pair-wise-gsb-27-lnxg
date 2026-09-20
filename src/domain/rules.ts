// 规则层：竞价与计费规则。全部为纯函数，不依赖 Vue、localStorage，便于追溯与测试。
// 规则版本仅作为数据参与运算；引擎本身不区分“新旧”，传入哪个版本就按哪个版本算。

import type {
  Bid,
  BiddingResult,
  Carrier,
  FeeBreakdown,
  PricingRule,
  Qualification,
  QualType,
  QuoteRequest,
  RateCard,
  RejectReason,
  TempMode,
  Timeliness
} from "./types";

export const TIMELINESS_OPTIONS: Timeliness[] = ["标准达", "次日达", "当日达"];
export const TEMP_OPTIONS: TempMode[] = ["常温", "冷藏", "冷冻"];

/** 各温控模式要求的箱内目标温度，用于核对冷链资质温区是否覆盖 */
export const TEMP_TARGET_C: Record<TempMode, number | null> = {
  常温: null,
  冷藏: 5,
  冷冻: -18
};

export const QUAL_LABEL: Record<QualType, string> = {
  GENERAL: "普通货运资质",
  EXPRESS: "限时快件资质",
  COLD: "冷链运输资质"
};

export const REJECT_LABEL: Record<RejectReason, string> = {
  carrier_inactive: "承运商已停用",
  lane_not_covered: "不覆盖该线路",
  qual_missing: "缺少资质",
  qual_expired: "资质已过期/未生效",
  temp_unsupported: "温区不满足温控要求",
  no_rate_card: "当前规则版本下无费率卡"
};

export function laneKey(fromName: string, toName: string): string {
  return `${fromName}-${toName}`;
}

export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 时效 + 温控 → 参与竞价所需资质集合 */
export function requiredQualifications(request: Pick<QuoteRequest, "timeliness" | "tempMode">): QualType[] {
  const need: QualType[] = ["GENERAL"];
  if (request.timeliness === "当日达") need.push("EXPRESS");
  if (request.tempMode === "冷藏" || request.tempMode === "冷冻") need.push("COLD");
  return need;
}

export function isQualValidOn(qual: Qualification, onDate: string): boolean {
  return qual.validFrom <= onDate && onDate <= qual.validUntil;
}

/** 体积重（kg）= 体积(m³) × 规则体积重系数 */
export function volumetricWeight(volumeM3: number, rule: PricingRule): number {
  return round2(volumeM3 * rule.volumetricFactor);
}

/** 计费重 = max(实重, 体积重, 最低计费重) */
export function chargeableWeight(actualWeightKg: number, volumeM3: number, rule: PricingRule): number {
  return round2(Math.max(actualWeightKg, volumetricWeight(volumeM3, rule), rule.minChargeableKg));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 找到承运商在指定规则版本 + 线路上的费率卡 */
export function findRateCard(
  cards: RateCard[],
  rule: PricingRule,
  carrierId: string,
  lane: string
): RateCard | undefined {
  return cards.find((c) => c.ruleVersionId === rule.id && c.carrierId === carrierId && c.lane === lane);
}

/** 按费率卡试算费用明细 */
export function calculateFee(
  card: RateCard,
  request: QuoteRequest,
  rule: PricingRule
): FeeBreakdown {
  const chargeable = chargeableWeight(request.actualWeightKg, request.volumeM3, rule);
  const baseFee = round2(card.baseFee);
  const weightFee = round2(card.perKg * chargeable);
  const timelinessFee = card.timelinessSurcharge[request.timeliness] ?? 0;
  const tempFee = card.tempSurcharge[request.tempMode] ?? 0;
  const fuelFee = round2((baseFee + weightFee) * card.fuelRate);

  const lines = [
    { key: "base", label: "起重价", amount: baseFee },
    { key: "weight", label: `计重运费（${card.perKg}元/kg × ${chargeable}kg）`, amount: weightFee },
    { key: "timeliness", label: `时效附加（${request.timeliness}）`, amount: timelinessFee },
    { key: "temp", label: `温控附加（${request.tempMode}）`, amount: tempFee },
    { key: "fuel", label: `燃油附加（${(card.fuelRate * 100).toFixed(0)}%）`, amount: fuelFee }
  ];
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return { chargeableWeightKg: chargeable, lines, total };
}

/**
 * 评估单个承运商。
 * 淘汰顺序：停用 → 不覆盖线路 → 资质缺失/失效 → 温区不足 → 无费率卡。
 */
export function evaluateCarrier(
  carrier: Carrier,
  request: QuoteRequest,
  lane: string,
  rule: PricingRule,
  cards: RateCard[],
  onDate: string
): Bid {
  const reject = (reason: RejectReason, detail: string): Bid => ({
    carrierId: carrier.id,
    carrierName: carrier.name,
    eligible: false,
    reason,
    reasonDetail: detail,
    fee: null
  });

  if (!carrier.active) return reject("carrier_inactive", "承运商处于停用状态，不参与竞价");
  if (!carrier.lanes.includes(lane)) return reject("lane_not_covered", `未覆盖线路 ${lane}`);

  for (const qualType of requiredQualifications(request)) {
    const qual = carrier.qualifications.find((q) => q.type === qualType);
    if (!qual) {
      return { ...reject("qual_missing", `缺少${QUAL_LABEL[qualType]}`), qualType };
    }
    if (!isQualValidOn(qual, onDate)) {
      return {
        ...reject(
          "qual_expired",
          `${QUAL_LABEL[qualType]}不在有效期内（有效期 ${qual.validFrom} ~ ${qual.validUntil}，核对日 ${onDate}）`
        ),
        qualType
      };
    }
    if (qualType === "COLD") {
      const target = TEMP_TARGET_C[request.tempMode];
      if (target !== null) {
        const min = qual.minTempC ?? Number.NEGATIVE_INFINITY;
        const max = qual.maxTempC ?? Number.POSITIVE_INFINITY;
        if (target < min || target > max) {
          return reject(
            "temp_unsupported",
            `冷链资质温区 ${min}℃~${max}℃ 不满足${request.tempMode}目标 ${target}℃`
          );
        }
      }
    }
  }

  const card = findRateCard(cards, rule, carrier.id, lane);
  if (!card) {
    return reject("no_rate_card", `规则版本 ${rule.version} 下缺少线路 ${lane} 的费率卡`);
  }

  return {
    carrierId: carrier.id,
    carrierName: carrier.name,
    eligible: true,
    reason: null,
    reasonDetail: null,
    fee: calculateFee(card, request, rule)
  };
}

/**
 * 对全部承运商竞价：仅“资质有效且覆盖线路”的候选可参与最低价选择。
 * 无合格承运商时返回 winner=null，并汇总缺失资质与冲突线路供页面阻止下单。
 */
export function runBidding(params: {
  request: QuoteRequest;
  carriers: Carrier[];
  rule: PricingRule;
  rateCards: RateCard[];
  onDate?: string;
  evaluatedAt?: string;
}): BiddingResult {
  const { request, carriers, rule, rateCards } = params;
  const onDate = params.onDate ?? todayISO();
  const evaluatedAt = params.evaluatedAt ?? new Date().toISOString();
  const lane = laneKey(request.fromCity, request.toCity);

  const bids = carriers.map((carrier) =>
    evaluateCarrier(carrier, request, lane, rule, rateCards, onDate)
  );

  const eligible = bids
    .filter((bid) => bid.eligible)
    .sort((a, b) => (a.fee!.total > b.fee!.total ? 1 : -1));
  const ineligible = bids.filter((bid) => !bid.eligible);

  // 缺失资质汇总：仅统计“在用且覆盖线路”的候选（线路不覆盖的承运商不在候选池内）
  const qualGroups = new Map<QualType, Set<string>>();
  for (const bid of ineligible) {
    if (!bid.qualType) continue;
    if (!qualGroups.has(bid.qualType)) qualGroups.set(bid.qualType, new Set());
    qualGroups.get(bid.qualType)!.add(bid.carrierName);
  }

  const coveringCarrierCount = carriers.filter(
    (c) => c.active && c.lanes.includes(lane)
  ).length;

  return {
    request,
    ruleVersionId: rule.id,
    ruleVersion: rule.version,
    evaluatedAt,
    eligible,
    ineligible,
    winner: eligible[0] ?? null,
    missingQuals: [...qualGroups.entries()].map(([qualType, set]) => ({
      qualType,
      carriers: [...set]
    })),
    conflictingLanes: coveringCarrierCount === 0 ? [lane] : [],
    coveringCarrierCount
  };
}
