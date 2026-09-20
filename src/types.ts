/** 领域模型：数据层（seed/storage）与规则层（engine）共用 */

export type ServiceLevel = "标准达" | "次日达";
export type TempMode = "常温" | "冷藏" | "冷冻";
export type QualificationType = "普通货运" | "冷链运输";

export interface QualificationCert {
  type: QualificationType;
  validFrom: string; // yyyy-mm-dd
  validUntil: string; // yyyy-mm-dd
}

export interface Lane {
  from: string;
  to: string;
  services: ServiceLevel[];
  tempModes: TempMode[];
  minWeightKg: number;
  maxWeightKg: number;
}

/** 承运商费率表；确认报价时整表冻结进快照 */
export interface RateTable {
  baseFee: number; // 起步价
  baseWeightKg: number; // 起步价覆盖重量
  perKgRate: number; // 续重单价
  fuelSurchargeRate: number; // 燃油附加费率（按运费+冷链附加计）
  coldFeePerKg: number; // 冷链附加 元/kg
  nextDaySurchargeRate: number; // 次日达附加费率（按运费+冷链附加计）
}

export interface Carrier {
  id: string;
  code: string;
  name: string;
  active: boolean;
  deactivatedAt?: string;
  qualifications: QualificationCert[];
  lanes: Lane[];
  rates: RateTable;
}

/** 计费规则书；一旦发布即不可修改，换规则只能发新版本 */
export interface RuleBook {
  version: string;
  publishedAt: string;
  changeNote: string;
  volumeFactorKgPerM3: number; // 体积重(kg) = 体积(m³) × 系数
}

export interface ShipmentInput {
  customer: string;
  origin: string;
  destination: string;
  actualWeightKg: number; // 实重
  volumeM3: number; // 体积
  serviceLevel: ServiceLevel; // 时效
  tempMode: TempMode; // 温控
}

export interface FeeItem {
  name: string;
  basis: string; // 计算依据，便于追溯
  amount: number;
}

/** 单次试算中某承运商的一条出价 */
export interface BidLine {
  carrierId: string;
  carrierCode: string;
  carrierName: string;
  inactive: boolean;
  eligible: boolean;
  missingQualifications: QualificationType[];
  expiredQualifications: { type: QualificationType; validUntil: string }[];
  laneConflicts: string[];
  volumeWeightKg: number;
  chargeableWeightKg: number;
  feeItems: FeeItem[];
  totalFee: number | null;
  rateSnapshot: RateTable | null;
}

export interface AuctionResult {
  asOf: string;
  ruleVersion: string;
  shipment: ShipmentInput;
  volumeWeightKg: number;
  chargeableWeightKg: number;
  eligibleBids: BidLine[]; // 总价升序，第一个为最低价
  rejectedBids: BidLine[];
  winner: BidLine | null;
}

/** 冻结进报价单的出价（剔除运行时态，只留可核对事实） */
export interface FrozenBid {
  carrierId: string;
  carrierName: string;
  eligible: boolean;
  missingQualifications: QualificationType[];
  expiredQualifications: { type: QualificationType; validUntil: string }[];
  laneConflicts: string[];
  feeItems: FeeItem[];
  totalFee: number | null;
}

/** 报价单的一个版本：确认或换价修订都各生成一条，首尾相连成链 */
export interface OrderRevision {
  revisionNo: number;
  createdAt: string;
  reason: string; // 修订原因；首次确认为"初次竞价确认"
  ruleVersion: string;
  ruleSnapshot: RuleBook;
  shipment: ShipmentInput;
  actualWeightKg: number;
  volumeWeightKg: number;
  chargeableWeightKg: number;
  carrierId: string;
  carrierName: string;
  rateSnapshot: RateTable;
  feeItems: FeeItem[];
  totalFee: number;
  allQuotes: FrozenBid[]; // 整张竞价表冻结
  supersededRevisionNo?: number;
}

export interface Order {
  id: string;
  code: string;
  status: "已确认" | "已修订";
  createdAt: string;
  revisions: OrderRevision[];
}

export interface PersistState {
  carriers: Carrier[];
  ruleBooks: RuleBook[];
  currentRuleVersion: string;
  orders: Order[];
}

export interface ReconcileItemDiff {
  name: string;
  frozenAmount: number;
  recomputedAmount: number;
}

export interface ReconcileResult {
  ok: boolean;
  carrierActive: boolean | null; // 来自当前承运商台账，null 表示台账已无此商
  chargeableMatch: boolean;
  frozenTotal: number;
  recomputedTotal: number;
  itemDiffs: ReconcileItemDiff[];
  checkedAt: string;
}
