// 领域模型：多承运商物流竞价台
// 数据层与规则层共享的纯类型定义，不含任何业务逻辑。

export type Timeliness = "标准达" | "次日达" | "当日达";
export type TempMode = "常温" | "冷藏" | "冷冻";
export type QualType = "GENERAL" | "EXPRESS" | "COLD";
export type RuleStatus = "active" | "archived";
export type QuoteStatus = "draft" | "confirmed";

export interface City {
  code: string;
  name: string;
}

/** 竞价请求（下单录入项） */
export interface QuoteRequest {
  customer: string;
  fromCity: string;
  toCity: string;
  actualWeightKg: number;
  volumeM3: number;
  timeliness: Timeliness;
  tempMode: TempMode;
  tempRangeC?: string;
  shipDate: string; // ISO yyyy-mm-dd
}

/** 承运商资质（带有效期与温度能力） */
export interface Qualification {
  type: QualType;
  validFrom: string; // ISO 日期
  validUntil: string; // ISO 日期
  minTempC?: number;
  maxTempC?: number;
}

export interface Carrier {
  id: string;
  name: string;
  code: string;
  active: boolean;
  qualifications: Qualification[];
  /** 覆盖线路（方向敏感：上海-南京 与 南京-上海 分别维护） */
  lanes: string[];
  note?: string;
}

/** 费率卡：绑定规则版本 + 承运商 + 方向线路 */
export interface RateCard {
  id: string;
  ruleVersionId: string;
  carrierId: string;
  lane: string;
  baseFee: number; // 起重价
  perKg: number; // 续重单价（按计费重）
  fuelRate: number; // 燃油附加比例，如 0.09
  timelinessSurcharge: Partial<Record<Timeliness, number>>;
  tempSurcharge: Partial<Record<TempMode, number>>;
}

/** 计费规则版本（体积重系数等口径，冻结后永不修改） */
export interface PricingRule {
  id: string;
  version: string;
  status: RuleStatus;
  effectiveFrom: string;
  volumetricFactor: number; // kg / m3
  minChargeableKg: number;
  currency: string;
  note: string;
}

export interface FeeLine {
  key: string;
  label: string;
  amount: number;
}

export interface FeeBreakdown {
  chargeableWeightKg: number;
  lines: FeeLine[];
  total: number;
}

export type RejectReason =
  | "carrier_inactive"
  | "lane_not_covered"
  | "qual_missing"
  | "qual_expired"
  | "temp_unsupported"
  | "no_rate_card";

export interface Bid {
  carrierId: string;
  carrierName: string;
  eligible: boolean;
  reason: RejectReason | null;
  reasonDetail: string | null;
  /** 拒单涉及的资质类型（qual_missing / qual_expired 时存在） */
  qualType?: QualType;
  fee: FeeBreakdown | null;
}

export interface MissingQualGroup {
  qualType: QualType;
  carriers: string[];
}

export interface BiddingResult {
  request: QuoteRequest;
  ruleVersionId: string;
  ruleVersion: string;
  evaluatedAt: string;
  eligible: Bid[]; // 按总价升序
  ineligible: Bid[];
  winner: Bid | null;
  /** 阻止下单时的汇总：缺失资质 */
  missingQuals: MissingQualGroup[];
  /** 阻止下单时的汇总：线路冲突（所有候选均不覆盖） */
  conflictingLanes: string[];
  /** 当前覆盖该线路的有效承运商数（0 即线路冲突） */
  coveringCarrierCount: number;
}

/** 报价修订链上的一条快照 */
export interface QuoteRecord {
  id: string;
  quoteNo: string; // 报价单号，修订链共享
  chainId: string; // 链 id，初版 = 自己的 id
  seq: number; // 修订序号，1 = 初版
  revisionOf?: string; // 父记录 id
  revisionReason?: string;
  status: QuoteStatus;
  customer: string;
  request: QuoteRequest;
  // —— 以下为确认时冻结的快照 ——
  winnerSnapshot: WinnerSnapshot | null;
  bidsSnapshot: Bid[];
  ruleSnapshot: PricingRule | null;
  carrierSnapshotAtFreeze: Record<string, { active: boolean; name: string }>;
  confirmedAt: string | null;
  createdAt: string;
}

export interface WinnerSnapshot {
  carrierId: string;
  carrierName: string;
  fee: FeeBreakdown;
}
