import type { Carrier, Order, RuleBook, ShipmentInput } from "../types";
import { priceShipment, round2 } from "../rules/engine";

/**
 * 规则书发布历史。旧版本永不修改，新版本带变更说明发布；
 * 竞价只用当前版本，历史报价单按冻结版本核对。
 */
export const seedRuleBooks: RuleBook[] = [
  {
    version: "v2025.1",
    publishedAt: "2025-01-05",
    changeNote: "初版计费规则，体积重系数 200kg/m³",
    volumeFactorKgPerM3: 200,
  },
  {
    version: "v2026.1",
    publishedAt: "2026-01-10",
    changeNote: "体积重系数由 200 上调至 250kg/m³，与行业抛货口径对齐",
    volumeFactorKgPerM3: 250,
  },
];

export const seedCarriers: Carrier[] = [
  {
    id: "car-sd",
    code: "SD",
    name: "顺达物流",
    active: true,
    qualifications: [
      { type: "普通货运", validFrom: "2025-01-01", validUntil: "2027-12-31" },
      { type: "冷链运输", validFrom: "2025-03-01", validUntil: "2027-06-30" },
    ],
    lanes: [
      {
        from: "上海",
        to: "南京",
        services: ["标准达", "次日达"],
        tempModes: ["常温", "冷藏", "冷冻"],
        minWeightKg: 1,
        maxWeightKg: 2000,
      },
      {
        from: "杭州",
        to: "合肥",
        services: ["标准达", "次日达"],
        tempModes: ["常温", "冷藏", "冷冻"],
        minWeightKg: 10,
        maxWeightKg: 1500,
      },
    ],
    rates: {
      baseFee: 120,
      baseWeightKg: 10,
      perKgRate: 4.2,
      fuelSurchargeRate: 0.08,
      coldFeePerKg: 1.2,
      nextDaySurchargeRate: 0.15,
    },
  },
  {
    id: "car-jg",
    code: "JG",
    name: "锦航快运",
    active: false,
    deactivatedAt: "2026-08-01",
    qualifications: [
      { type: "普通货运", validFrom: "2024-06-01", validUntil: "2026-12-31" },
    ],
    lanes: [
      {
        from: "上海",
        to: "南京",
        services: ["标准达"],
        tempModes: ["常温"],
        minWeightKg: 50,
        maxWeightKg: 3000,
      },
    ],
    rates: {
      baseFee: 100,
      baseWeightKg: 20,
      perKgRate: 3.6,
      fuelSurchargeRate: 0.06,
      coldFeePerKg: 0,
      nextDaySurchargeRate: 0.1,
    },
  },
  {
    id: "car-kr",
    code: "KR",
    name: "跨越速运",
    active: true,
    qualifications: [
      { type: "普通货运", validFrom: "2025-05-01", validUntil: "2027-04-30" },
      { type: "冷链运输", validFrom: "2025-05-01", validUntil: "2026-06-30" },
    ],
    lanes: [
      {
        from: "上海",
        to: "南京",
        services: ["标准达", "次日达"],
        tempModes: ["常温", "冷藏", "冷冻"],
        minWeightKg: 1,
        maxWeightKg: 1200,
      },
    ],
    rates: {
      baseFee: 140,
      baseWeightKg: 10,
      perKgRate: 4.6,
      fuelSurchargeRate: 0.09,
      coldFeePerKg: 1.4,
      nextDaySurchargeRate: 0.2,
    },
  },
  {
    id: "car-ll",
    code: "LL",
    name: "蓝链冷链",
    active: true,
    qualifications: [
      { type: "普通货运", validFrom: "2024-09-01", validUntil: "2027-08-31" },
      { type: "冷链运输", validFrom: "2024-09-01", validUntil: "2027-08-31" },
    ],
    lanes: [
      {
        from: "上海",
        to: "南京",
        services: ["标准达"],
        tempModes: ["冷藏", "冷冻"],
        minWeightKg: 20,
        maxWeightKg: 2500,
      },
      {
        from: "杭州",
        to: "合肥",
        services: ["标准达", "次日达"],
        tempModes: ["冷藏", "冷冻"],
        minWeightKg: 20,
        maxWeightKg: 1800,
      },
    ],
    rates: {
      baseFee: 160,
      baseWeightKg: 20,
      perKgRate: 4.0,
      fuelSurchargeRate: 0.07,
      coldFeePerKg: 0.9,
      nextDaySurchargeRate: 0.12,
    },
  },
];

export const seedCities: string[] = ["上海", "南京", "杭州", "合肥", "苏州", "武汉"];

/** 2026-03 锦航（现已停用）中标，规则 v2025.1：演示停用后历史报价仍按快照核对 */
function buildSeedOrder1(): Order {
  const jg = seedCarriers[1];
  const rule = seedRuleBooks[0];
  const shipment: ShipmentInput = {
    customer: "海沃商贸",
    origin: "上海",
    destination: "南京",
    actualWeightKg: 180,
    volumeM3: 0.6,
    serviceLevel: "标准达",
    tempMode: "常温",
  };
  const volumeWeightKg = round2(shipment.volumeM3 * rule.volumeFactorKgPerM3);
  const chargeableWeightKg = Math.max(shipment.actualWeightKg, volumeWeightKg);
  const priced = priceShipment(
    chargeableWeightKg,
    shipment.serviceLevel,
    shipment.tempMode,
    jg.rates
  );

  return {
    id: "seed-order-1",
    code: "BJ-202603-0001",
    status: "已确认",
    createdAt: "2026-03-12T09:30:00.000Z",
    revisions: [
      {
        revisionNo: 1,
        createdAt: "2026-03-12T09:30:00.000Z",
        reason: "初次竞价确认",
        ruleVersion: rule.version,
        ruleSnapshot: { ...rule },
        shipment,
        actualWeightKg: shipment.actualWeightKg,
        volumeWeightKg,
        chargeableWeightKg,
        carrierId: jg.id,
        carrierName: jg.name,
        rateSnapshot: { ...jg.rates },
        feeItems: priced.items,
        totalFee: priced.total,
        allQuotes: [
          {
            carrierId: jg.id,
            carrierName: jg.name,
            eligible: true,
            missingQualifications: [],
            expiredQualifications: [],
            laneConflicts: [],
            feeItems: priced.items,
            totalFee: priced.total,
          },
        ],
      },
    ],
  };
}

/** 杭州-合肥 冷藏：顺达中标后因时效要求修订为蓝链冷链次日达，演示报价链 */
function buildSeedOrder2(): Order {
  const sd = seedCarriers[0];
  const ll = seedCarriers[3];
  const rule = seedRuleBooks[1];
  const shipmentV1: ShipmentInput = {
    customer: "云仓食品",
    origin: "杭州",
    destination: "合肥",
    actualWeightKg: 120,
    volumeM3: 0.3,
    serviceLevel: "标准达",
    tempMode: "冷藏",
  };
  const shipmentV2: ShipmentInput = { ...shipmentV1, serviceLevel: "次日达" };

  const volumeWeightKg = round2(shipmentV1.volumeM3 * rule.volumeFactorKgPerM3);
  const chargeableWeightKg = Math.max(shipmentV1.actualWeightKg, volumeWeightKg);
  const p1 = priceShipment(
    chargeableWeightKg,
    shipmentV1.serviceLevel,
    shipmentV1.tempMode,
    sd.rates
  );
  const p2 = priceShipment(
    chargeableWeightKg,
    shipmentV2.serviceLevel,
    shipmentV2.tempMode,
    ll.rates
  );

  return {
    id: "seed-order-2",
    code: "BJ-202607-0014",
    status: "已修订",
    createdAt: "2026-07-18T02:10:00.000Z",
    revisions: [
      {
        revisionNo: 1,
        createdAt: "2026-07-18T02:10:00.000Z",
        reason: "初次竞价确认",
        ruleVersion: rule.version,
        ruleSnapshot: { ...rule },
        shipment: shipmentV1,
        actualWeightKg: shipmentV1.actualWeightKg,
        volumeWeightKg,
        chargeableWeightKg,
        carrierId: sd.id,
        carrierName: sd.name,
        rateSnapshot: { ...sd.rates },
        feeItems: p1.items,
        totalFee: p1.total,
        allQuotes: [
          {
            carrierId: sd.id,
            carrierName: sd.name,
            eligible: true,
            missingQualifications: [],
            expiredQualifications: [],
            laneConflicts: [],
            feeItems: p1.items,
            totalFee: p1.total,
          },
        ],
      },
      {
        revisionNo: 2,
        createdAt: "2026-07-19T06:45:00.000Z",
        reason: "客户要求次日送达，按次日达重新竞价，改用蓝链冷链",
        ruleVersion: rule.version,
        ruleSnapshot: { ...rule },
        shipment: shipmentV2,
        actualWeightKg: shipmentV2.actualWeightKg,
        volumeWeightKg,
        chargeableWeightKg,
        carrierId: ll.id,
        carrierName: ll.name,
        rateSnapshot: { ...ll.rates },
        feeItems: p2.items,
        totalFee: p2.total,
        allQuotes: [
          {
            carrierId: ll.id,
            carrierName: ll.name,
            eligible: true,
            missingQualifications: [],
            expiredQualifications: [],
            laneConflicts: [],
            feeItems: p2.items,
            totalFee: p2.total,
          },
        ],
        supersededRevisionNo: 1,
      },
    ],
  };
}

export function buildSeedOrders(): Order[] {
  return [buildSeedOrder2(), buildSeedOrder1()];
}
