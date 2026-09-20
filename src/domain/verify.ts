// 规则层：报价快照核对。
// 承运商停用、规则改版后，已确认报价仍以冻结时的快照为准；本模块同时给出与现行数据的差异，供审计展示。

import { calculateFee, findRateCard, laneKey } from "./rules";
import type {
  Carrier,
  PricingRule,
  QuoteRecord,
  RateCard
} from "./types";

export interface SnapshotVerification {
  quoteId: string;
  quoteNo: string;
  frozenCarrierId: string;
  frozenCarrierName: string;
  frozenRuleVersion: string;
  frozenTotal: number;
  carrierExists: boolean;
  carrierActiveNow: boolean;
  carrierNameNow: string | null;
  ruleExistsNow: boolean;
  /** 用“快照规则版本 + 现行费率卡”重算的金额；缺费率卡时为 null */
  recomputedTotalNow: number | null;
  /** 重算金额与快照是否一致；无法重算时为 null */
  feeMatches: boolean | null;
  notes: string[];
}

export function verifySnapshot(
  quote: QuoteRecord,
  carriers: Carrier[],
  rules: PricingRule[],
  rateCards: RateCard[]
): SnapshotVerification | null {
  if (!quote.winnerSnapshot || !quote.ruleSnapshot) return null;

  const carrier = carriers.find((c) => c.id === quote.winnerSnapshot!.carrierId);
  const rule = rules.find((r) => r.id === quote.ruleSnapshot!.id);
  const notes: string[] = [];

  if (!carrier) {
    notes.push("承运商档案已删除，历史报价仍按冻结快照核对");
  } else if (!carrier.active) {
    notes.push(`承运商「${carrier.name}」现已停用，不影响本报价，金额按快照执行`);
  }
  if (!rule) {
    notes.push(`规则版本 ${quote.ruleSnapshot.version} 已归档/移除，仍按冻结版本口径展示`);
  }

  let recomputedTotalNow: number | null = null;
  let feeMatches: boolean | null = null;
  if (carrier && rule) {
    const lane = laneKey(quote.request.fromCity, quote.request.toCity);
    const card = findRateCard(rateCards, rule, carrier.id, lane);
    if (card) {
      recomputedTotalNow = calculateFee(card, quote.request, rule).total;
      feeMatches = recomputedTotalNow === quote.winnerSnapshot.fee.total;
      if (feeMatches === false) {
        notes.push("现行费率卡重算金额与快照不一致，以快照为准");
      }
    } else {
      notes.push("现行数据中已无对应费率卡，无法重算，以快照为准");
    }
  }

  return {
    quoteId: quote.id,
    quoteNo: quote.quoteNo,
    frozenCarrierId: quote.winnerSnapshot.carrierId,
    frozenCarrierName: quote.winnerSnapshot.carrierName,
    frozenRuleVersion: quote.ruleSnapshot.version,
    frozenTotal: quote.winnerSnapshot.fee.total,
    carrierExists: Boolean(carrier),
    carrierActiveNow: carrier?.active ?? false,
    carrierNameNow: carrier?.name ?? null,
    ruleExistsNow: Boolean(rule),
    recomputedTotalNow,
    feeMatches,
    notes
  };
}
