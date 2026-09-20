// 页面层（状态）：基础数据管理 store —— 城市、承运商、规则版本、费率卡。
// 只做数据 CRUD 与持久化，不放竞价/计费规则。

import { defineStore } from "pinia";
import { repository } from "../data/repository";
import type { Carrier, City, PricingRule, Qualification, RateCard } from "../domain/types";

interface DataState {
  cities: City[];
  carriers: Carrier[];
  rules: PricingRule[];
  rateCards: RateCard[];
  loaded: boolean;
}

export const useDataStore = defineStore("logistics-data", {
  state: (): DataState => ({
    cities: [],
    carriers: [],
    rules: [],
    rateCards: [],
    loaded: false
  }),

  getters: {
    activeRule: (state): PricingRule | undefined =>
      state.rules.find((rule) => rule.status === "active"),
    cityName: (state) => (code: string) =>
      state.cities.find((city) => city.code === code)?.name ?? code,
    carrierById: (state) => (id: string) => state.carriers.find((c) => c.id === id),
    lanesCovered: (state) =>
      [...new Set(state.rateCards.map((card) => card.lane))]
  },

  actions: {
    load() {
      if (this.loaded) return;
      this.cities = repository.loadCities();
      this.carriers = repository.loadCarriers();
      this.rules = repository.loadRules();
      this.rateCards = repository.loadRateCards();
      this.loaded = true;
    },
    persistCarriers() {
      repository.saveCarriers(this.carriers);
    },
    persistRules() {
      repository.saveRules(this.rules);
    },
    persistRateCards() {
      repository.saveRateCards(this.rateCards);
    },
    persistCities() {
      repository.saveCities(this.cities);
    },

    toggleCarrierActive(id: string) {
      const carrier = this.carriers.find((c) => c.id === id);
      if (carrier) {
        carrier.active = !carrier.active;
        this.persistCarriers();
      }
    },
    updateCarrierQualifications(id: string, qualifications: Qualification[]) {
      const carrier = this.carriers.find((c) => c.id === id);
      if (carrier) {
        carrier.qualifications = qualifications;
        this.persistCarriers();
      }
    },
    upsertCarrier(carrier: Carrier) {
      const index = this.carriers.findIndex((c) => c.id === carrier.id);
      if (index >= 0) this.carriers[index] = carrier;
      else this.carriers.push(carrier);
      this.persistCarriers();
    },

    /** 新建规则版本：旧 active 版本自动归档；冻结版本永不修改 */
    publishRule(rule: Omit<PricingRule, "id" | "status">) {
      this.rules.forEach((item) => {
        if (item.status === "active") item.status = "archived";
      });
      this.rules.push({ ...rule, id: `rule-${Date.now()}`, status: "active" });
      this.persistRules();
    },
    upsertRateCard(card: RateCard) {
      const index = this.rateCards.findIndex((c) => c.id === card.id);
      if (index >= 0) this.rateCards[index] = card;
      else this.rateCards.push(card);
      this.persistRateCards();
    },
    removeRateCard(id: string) {
      this.rateCards = this.rateCards.filter((card) => card.id !== id);
      this.persistRateCards();
    },

    resetDemoData() {
      repository.resetAll();
      this.cities = repository.loadCities();
      this.carriers = repository.loadCarriers();
      this.rules = repository.loadRules();
      this.rateCards = repository.loadRateCards();
    }
  }
});
