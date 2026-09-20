import { defineStore } from "pinia";
import type {
  AuctionResult,
  Carrier,
  FrozenBid,
  Order,
  OrderRevision,
  PersistState,
  RuleBook,
  ShipmentInput,
} from "../types";
import { loadState, resetState, saveState } from "../data/storage";
import { runAuction } from "../rules/engine";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ConfirmOutcome =
  | { ok: true; order: Order }
  | { ok: false; reason: "no-eligible" | "carrier-not-eligible" };

export const useBiddingStore = defineStore("bidding", {
  state: (): PersistState => loadState(),

  getters: {
    currentRule(state): RuleBook {
      return (
        state.ruleBooks.find((rule) => rule.version === state.currentRuleVersion) ??
        state.ruleBooks[state.ruleBooks.length - 1]
      );
    },
    activeCarriers(state): Carrier[] {
      return state.carriers.filter((carrier) => carrier.active);
    },
    cities(state): string[] {
      const set = new Set<string>();
      state.carriers.forEach((carrier) =>
        carrier.lanes.forEach((lane) => {
          set.add(lane.from);
          set.add(lane.to);
        })
      );
      return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    },
    orderCount(state): number {
      return state.orders.length;
    },
    revisionCount(state): number {
      return state.orders.reduce((sum, order) => sum + order.revisions.length, 0);
    },
    inactiveCarrierCount(state): number {
      return state.carriers.filter((carrier) => !carrier.active).length;
    },
  },

  actions: {
    persist() {
      saveState({
        carriers: this.carriers,
        ruleBooks: this.ruleBooks,
        currentRuleVersion: this.currentRuleVersion,
        orders: this.orders,
      });
    },

    carrierById(id: string): Carrier | undefined {
      return this.carriers.find((carrier) => carrier.id === id);
    },

    /** 实时试竞价，不落库、不产生快照 */
    auction(shipment: ShipmentInput): AuctionResult {
      return runAuction(this.carriers, this.currentRule, shipment, new Date().toISOString().slice(0, 10));
    },

    freezeBids(auction: AuctionResult): FrozenBid[] {
      return [...auction.eligibleBids, ...auction.rejectedBids].map((bid) => ({
        carrierId: bid.carrierId,
        carrierName: bid.carrierName,
        eligible: bid.eligible,
        missingQualifications: clone(bid.missingQualifications),
        expiredQualifications: clone(bid.expiredQualifications),
        laneConflicts: clone(bid.laneConflicts),
        feeItems: clone(bid.feeItems),
        totalFee: bid.totalFee,
      }));
    },

    nextOrderCode(): string {
      const ym = new Date().toISOString().slice(0, 7).replace("-", "");
      const seq = this.orders.length + 1;
      return `BJ-${ym}-${String(seq).padStart(4, "0")}`;
    },

    /** 确认下单：没有合格承运商则阻止；确认即冻结承运商费率、规则版本与全部费用明细 */
    confirmOrder(shipment: ShipmentInput, auction: AuctionResult, chosenCarrierId?: string): ConfirmOutcome {
      if (auction.eligibleBids.length === 0 || !auction.winner) {
        return { ok: false, reason: "no-eligible" };
      }
      const chosenId = chosenCarrierId ?? auction.winner.carrierId;
      const chosen = auction.eligibleBids.find((bid) => bid.carrierId === chosenId);
      if (!chosen || chosen.totalFee === null || !chosen.rateSnapshot) {
        return { ok: false, reason: "carrier-not-eligible" };
      }

      const now = new Date().toISOString();
      const revision: OrderRevision = {
        revisionNo: 1,
        createdAt: now,
        reason: "初次竞价确认",
        ruleVersion: auction.ruleVersion,
        ruleSnapshot: clone(this.currentRule),
        shipment: clone(shipment),
        actualWeightKg: shipment.actualWeightKg,
        volumeWeightKg: auction.volumeWeightKg,
        chargeableWeightKg: auction.chargeableWeightKg,
        carrierId: chosen.carrierId,
        carrierName: chosen.carrierName,
        rateSnapshot: clone(chosen.rateSnapshot),
        feeItems: clone(chosen.feeItems),
        totalFee: chosen.totalFee,
        allQuotes: this.freezeBids(auction),
      };
      const order: Order = {
        id: crypto.randomUUID(),
        code: this.nextOrderCode(),
        status: "已确认",
        createdAt: now,
        revisions: [revision],
      };
      this.orders.unshift(order);
      this.persist();
      return { ok: true, order };
    },

    /**
     * 换价：不允许直接改旧报价，只能新建带原因的修订。
     * 修订按当前规则版本重新竞价，旧版本原样保留。
     */
    reviseOrder(
      orderId: string,
      shipment: ShipmentInput,
      reason: string,
      chosenCarrierId?: string
    ): ConfirmOutcome {
      const order = this.orders.find((item) => item.id === orderId);
      if (!order || !reason.trim()) return { ok: false, reason: "no-eligible" };

      const auction = this.auction(shipment);
      if (auction.eligibleBids.length === 0 || !auction.winner) {
        return { ok: false, reason: "no-eligible" };
      }
      const chosenId = chosenCarrierId ?? auction.winner.carrierId;
      const chosen = auction.eligibleBids.find((bid) => bid.carrierId === chosenId);
      if (!chosen || chosen.totalFee === null || !chosen.rateSnapshot) {
        return { ok: false, reason: "carrier-not-eligible" };
      }

      const previous = order.revisions[order.revisions.length - 1];
      const revision: OrderRevision = {
        revisionNo: previous.revisionNo + 1,
        createdAt: new Date().toISOString(),
        reason: reason.trim(),
        ruleVersion: auction.ruleVersion,
        ruleSnapshot: clone(this.currentRule),
        shipment: clone(shipment),
        actualWeightKg: shipment.actualWeightKg,
        volumeWeightKg: auction.volumeWeightKg,
        chargeableWeightKg: auction.chargeableWeightKg,
        carrierId: chosen.carrierId,
        carrierName: chosen.carrierName,
        rateSnapshot: clone(chosen.rateSnapshot),
        feeItems: clone(chosen.feeItems),
        totalFee: chosen.totalFee,
        allQuotes: this.freezeBids(auction),
        supersededRevisionNo: previous.revisionNo,
      };
      order.revisions.push(revision);
      order.status = "已修订";
      this.persist();
      return { ok: true, order };
    },

    /** 停用只影响后续竞价，历史报价单仍按其快照核对 */
    setCarrierActive(carrierId: string, active: boolean) {
      const carrier = this.carriers.find((item) => item.id === carrierId);
      if (!carrier || carrier.active === active) return;
      carrier.active = active;
      carrier.deactivatedAt = active ? undefined : new Date().toISOString();
      this.persist();
    },

    /** 规则书只增不改：新版本发布后成为竞价依据，历史报价继续引用旧版本 */
    publishRuleBook(version: string, volumeFactorKgPerM3: number, changeNote: string): boolean {
      const trimmed = version.trim();
      if (!trimmed || this.ruleBooks.some((rule) => rule.version === trimmed)) return false;
      this.ruleBooks.push({
        version: trimmed,
        publishedAt: new Date().toISOString().slice(0, 10),
        changeNote: changeNote.trim() || "未填写变更说明",
        volumeFactorKgPerM3,
      });
      this.currentRuleVersion = trimmed;
      this.persist();
      return true;
    },

    resetDemo() {
      const state = resetState();
      this.carriers = state.carriers;
      this.ruleBooks = state.ruleBooks;
      this.currentRuleVersion = state.currentRuleVersion;
      this.orders = state.orders;
    },
  },
});
