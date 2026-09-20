// 页面层（状态）：报价单 store。
// 确认即冻结（承运商/规则版本/费用明细全部快照）；换价只能“新建带原因的修订”，原记录不可改。

import { defineStore } from "pinia";
import { repository } from "../data/repository";
import { runBidding } from "../domain/rules";
import type {
  BiddingResult,
  Carrier,
  PricingRule,
  QuoteRecord,
  RateCard
} from "../domain/types";
import { useDataStore } from "./dataStore";

interface QuoteState {
  quotes: QuoteRecord[];
  loaded: boolean;
  seqCounter: number;
}

function nextQuoteNo(seq: number): string {
  const date = new Date();
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  return `BJ-${ymd}-${String(seq).padStart(3, "0")}`;
}

export const useQuoteStore = defineStore("logistics-quote", {
  state: (): QuoteState => ({
    quotes: [],
    loaded: false,
    seqCounter: 0
  }),

  getters: {
    /** 修订链：chainId → 链上记录（seq 倒序），链关系随记录持久化，刷新后仍一致 */
    chains(state): { chainId: string; quoteNo: string; records: QuoteRecord[]; latest: QuoteRecord }[] {
      const map = new Map<string, QuoteRecord[]>();
      for (const quote of state.quotes) {
        const list = map.get(quote.chainId) ?? [];
        list.push(quote);
        map.set(quote.chainId, list);
      }
      return [...map.entries()].map(([chainId, records]) => {
        const sorted = [...records].sort((a, b) => b.seq - a.seq);
        return { chainId, quoteNo: sorted[0].quoteNo, records: sorted, latest: sorted[0] };
      });
    }
  },

  actions: {
    load() {
      if (this.loaded) return;
      this.quotes = repository.loadQuotes();
      this.seqCounter = this.quotes.length;
      this.loaded = true;
    },
    persist() {
      repository.saveQuotes(this.quotes);
    },

    /** 用当前数据实时竞价（不产生记录） */
    preview(params: {
      request: BiddingResult["request"];
      carriers: Carrier[];
      rule: PricingRule;
      rateCards: RateCard[];
      onDate?: string;
    }): BiddingResult {
      return runBidding(params);
    },

    /** 确认下单：无合格承运商时抛错，由页面阻止 */
    confirm(result: BiddingResult): QuoteRecord {
      if (!result.winner) {
        throw new Error("无合格承运商，不能下单");
      }
      const data = useDataStore();
      const id = crypto.randomUUID();
      this.seqCounter += 1;
      const record: QuoteRecord = {
        id,
        quoteNo: nextQuoteNo(this.seqCounter),
        chainId: id,
        seq: 1,
        status: "confirmed",
        customer: result.request.customer,
        request: structuredClone(result.request),
        // —— 冻结快照 ——
        winnerSnapshot: structuredClone({
          carrierId: result.winner.carrierId,
          carrierName: result.winner.carrierName,
          fee: result.winner.fee!
        }),
        bidsSnapshot: structuredClone([...result.eligible, ...result.ineligible]),
        ruleSnapshot: structuredClone(data.rules.find((r) => r.id === result.ruleVersionId) ?? null),
        carrierSnapshotAtFreeze: Object.fromEntries(
          data.carriers.map((c) => [c.id, { active: c.active, name: c.name }])
        ),
        confirmedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      this.quotes = [record, ...this.quotes];
      this.persist();
      return record;
    },

    /**
     * 新建修订：必须带原因；以原链最新版本为父，按当前承运商/规则重新竞价并冻结新快照。
     */
    revise(chainId: string, reason: string, result: BiddingResult): QuoteRecord {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error("修订必须填写原因");
      if (!result.winner) throw new Error("当前无合格承运商，不能生成修订");

      const data = useDataStore();
      const chain = this.quotes.filter((q) => q.chainId === chainId);
      const parent = [...chain].sort((a, b) => b.seq - a.seq)[0];
      if (!parent) throw new Error("原报价不存在");

      const id = crypto.randomUUID();
      this.seqCounter += 1;
      const currentRule = data.rules.find((r) => r.id === result.ruleVersionId);
      const record: QuoteRecord = {
        ...structuredClone(parent),
        id,
        seq: parent.seq + 1,
        revisionOf: parent.id,
        revisionReason: trimmed,
        status: "confirmed",
        customer: result.request.customer,
        request: structuredClone(result.request),
        winnerSnapshot: structuredClone({
          carrierId: result.winner.carrierId,
          carrierName: result.winner.carrierName,
          fee: result.winner.fee!
        }),
        bidsSnapshot: structuredClone([...result.eligible, ...result.ineligible]),
        ruleSnapshot: currentRule ? structuredClone(currentRule) : parent.ruleSnapshot,
        carrierSnapshotAtFreeze: Object.fromEntries(
          data.carriers.map((c) => [c.id, { active: c.active, name: c.name }])
        ),
        confirmedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      this.quotes = [record, ...this.quotes];
      this.persist();
      return record;
    },

    getById(id: string): QuoteRecord | undefined {
      return this.quotes.find((q) => q.id === id);
    }
  }
});
