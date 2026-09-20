import type {
  BidLine,
  Carrier,
  FeeItem,
  QualificationType,
  RateTable,
  ReconcileResult,
  RuleBook,
  ShipmentInput,
  AuctionResult,
  OrderRevision,
} from "../types";

/** 体积重 kg = 体积 m³ × 规则系数；实重与体积重取大 */
export function calcWeights(
  actualWeightKg: number,
  volumeM3: number,
  rule: RuleBook
): { volumeWeightKg: number; chargeableWeightKg: number } {
  const volumeWeightKg = round2(volumeM3 * rule.volumeFactorKgPerM3);
  return {
    volumeWeightKg,
    chargeableWeightKg: round2(Math.max(actualWeightKg, volumeWeightKg)),
  };
}

/** 计价明细，全部依据入参快照计算，历史核对与实时竞价走同一条路径 */
export function priceShipment(
  chargeableWeightKg: number,
  serviceLevel: ShipmentInput["serviceLevel"],
  tempMode: ShipmentInput["tempMode"],
  rates: RateTable
): { items: FeeItem[]; total: number } {
  const billableOverBase = Math.max(0, round2(chargeableWeightKg - rates.baseWeightKg));
  const lineHaul = round2(rates.baseFee + billableOverBase * rates.perKgRate);
  const coldFee = tempMode === "常温" ? 0 : round2(chargeableWeightKg * rates.coldFeePerKg);
  const timedFee =
    serviceLevel === "次日达" ? round2((lineHaul + coldFee) * rates.nextDaySurchargeRate) : 0;
  const fuelFee = round2((lineHaul + coldFee) * rates.fuelSurchargeRate);

  const items: FeeItem[] = [
    {
      name: "运费",
      basis: `起步价¥${rates.baseFee}（含${rates.baseWeightKg}kg）+ 续重${billableOverBase}kg × ¥${rates.perKgRate}/kg`,
      amount: lineHaul,
    },
    {
      name: "冷链附加",
      basis:
        tempMode === "常温"
          ? "温控=常温，免收"
          : `${tempMode}：计费重${chargeableWeightKg}kg × ¥${rates.coldFeePerKg}/kg`,
      amount: coldFee,
    },
    {
      name: "次日达时效附加",
      basis:
        serviceLevel === "次日达"
          ? `（运费+冷链附加）× ${(rates.nextDaySurchargeRate * 100).toFixed(1)}%`
          : "时效=标准达，免收",
      amount: timedFee,
    },
    {
      name: "燃油附加",
      basis: `（运费+冷链附加）× ${(rates.fuelSurchargeRate * 100).toFixed(1)}%`,
      amount: fuelFee,
    },
  ];
  return { items, total: round2(items.reduce((sum, item) => sum + item.amount, 0)) };
}

function requiredQualifications(tempMode: ShipmentInput["tempMode"]): QualificationType[] {
  return tempMode === "常温" ? ["普通货运"] : ["普通货运", "冷链运输"];
}

/** 资质是否在指定日期有效 */
export function certValid(type: QualificationType, carrier: Carrier, asOf: string): boolean {
  const cert = carrier.qualifications.find((item) => item.type === type);
  return Boolean(cert && cert.validFrom <= asOf && asOf <= cert.validUntil);
}

/** 线路冲突描述；空数组表示该承运商覆盖本线路 */
export function laneConflicts(carrier: Carrier, shipment: ShipmentInput): string[] {
  const conflicts: string[] = [];
  const lane = carrier.lanes.find(
    (item) => item.from === shipment.origin && item.to === shipment.destination
  );
  if (!lane) {
    conflicts.push(`未覆盖线路 ${shipment.origin} → ${shipment.destination}`);
    return conflicts;
  }
  if (!lane.services.includes(shipment.serviceLevel)) {
    conflicts.push(`线路不支持时效「${shipment.serviceLevel}」`);
  }
  if (!lane.tempModes.includes(shipment.tempMode)) {
    conflicts.push(`线路不支持温控「${shipment.tempMode}」`);
  }
  if (shipment.actualWeightKg < lane.minWeightKg) {
    conflicts.push(`实重 ${shipment.actualWeightKg}kg 低于线路起运 ${lane.minWeightKg}kg`);
  }
  if (shipment.actualWeightKg > lane.maxWeightKg) {
    conflicts.push(`实重 ${shipment.actualWeightKg}kg 超过线路限重 ${lane.maxWeightKg}kg`);
  }
  return conflicts;
}

/** 评估单个承运商：资质有效性 → 线路覆盖 → 费率可得，全部通过才给出价 */
export function evaluateCarrier(
  carrier: Carrier,
  shipment: ShipmentInput,
  chargeableWeightKg: number,
  asOf: string
): BidLine {
  const line: BidLine = {
    carrierId: carrier.id,
    carrierCode: carrier.code,
    carrierName: carrier.name,
    inactive: !carrier.active,
    eligible: false,
    missingQualifications: [],
    expiredQualifications: [],
    laneConflicts: [],
    volumeWeightKg: 0,
    chargeableWeightKg,
    feeItems: [],
    totalFee: null,
    rateSnapshot: null,
  };

  if (!carrier.active) {
    return line; // 停用承运商不参与竞价，也不展开资质/线路判断
  }

  for (const type of requiredQualifications(shipment.tempMode)) {
    const cert = carrier.qualifications.find((item) => item.type === type);
    if (!cert) {
      line.missingQualifications.push(type);
    } else if (!(cert.validFrom <= asOf && asOf <= cert.validUntil)) {
      line.expiredQualifications.push({ type, validUntil: cert.validUntil });
    }
  }

  line.laneConflicts = laneConflicts(carrier, shipment);

  if (line.missingQualifications.length || line.expiredQualifications.length || line.laneConflicts.length) {
    return line;
  }

  const priced = priceShipment(
    chargeableWeightKg,
    shipment.serviceLevel,
    shipment.tempMode,
    carrier.rates
  );
  line.feeItems = priced.items;
  line.totalFee = priced.total;
  line.rateSnapshot = { ...carrier.rates };
  line.eligible = true;
  return line;
}

/** 竞价：仅当前资质有效且覆盖线路的承运商参与最低价选择 */
export function runAuction(
  carriers: Carrier[],
  rule: RuleBook,
  shipment: ShipmentInput,
  asOf: string
): AuctionResult {
  const { volumeWeightKg, chargeableWeightKg } = calcWeights(
    shipment.actualWeightKg,
    shipment.volumeM3,
    rule
  );
  const bids = carriers.map((carrier) =>
    evaluateCarrier(carrier, shipment, chargeableWeightKg, asOf)
  );
  bids.forEach((bid) => (bid.volumeWeightKg = volumeWeightKg));

  const eligibleBids = bids
    .filter((bid) => bid.eligible && bid.totalFee !== null)
    .sort((a, b) => (a.totalFee! - b.totalFee! || a.carrierCode.localeCompare(b.carrierCode)));
  const rejectedBids = bids.filter((bid) => !bid.eligible);

  return {
    asOf,
    ruleVersion: rule.version,
    shipment,
    volumeWeightKg,
    chargeableWeightKg,
    eligibleBids,
    rejectedBids,
    winner: eligibleBids[0] ?? null,
  };
}

/**
 * 历史报价核对：按快照里的规则书与费率重算，与冻结金额逐项比对。
 * 承运商当前是否停用只作状态回显，不影响快照核对。
 */
export function reconcileRevision(
  revision: OrderRevision,
  currentCarrier: Carrier | undefined
): ReconcileResult {
  const { chargeableWeightKg } = calcWeights(
    revision.shipment.actualWeightKg,
    revision.shipment.volumeM3,
    revision.ruleSnapshot
  );
  const recomputed = priceShipment(
    revision.chargeableWeightKg,
    revision.shipment.serviceLevel,
    revision.shipment.tempMode,
    revision.rateSnapshot
  );
  const itemDiffs = revision.feeItems.map((frozen) => {
    const live = recomputed.items.find((item) => item.name === frozen.name);
    return {
      name: frozen.name,
      frozenAmount: frozen.amount,
      recomputedAmount: live?.amount ?? 0,
    };
  });
  return {
    ok:
      itemDiffs.every((diff) => diff.frozenAmount === diff.recomputedAmount) &&
      revision.totalFee === recomputed.total &&
      chargeableWeightKg === revision.chargeableWeightKg,
    carrierActive: currentCarrier ? currentCarrier.active : null,
    chargeableMatch: chargeableWeightKg === revision.chargeableWeightKg,
    frozenTotal: revision.totalFee,
    recomputedTotal: recomputed.total,
    itemDiffs,
    checkedAt: new Date().toISOString(),
  };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
