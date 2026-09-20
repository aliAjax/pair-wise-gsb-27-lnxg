// 数据层：本地仓储。只负责 localStorage 的读写与种子初始化，不含业务规则。

import {
  STORAGE_KEYS,
  seedCarriers,
  seedCities,
  seedQuotes,
  seedRateCards,
  seedRules
} from "./seed";
import type { Carrier, City, PricingRule, QuoteRecord, RateCard } from "../domain/types";

function read<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const repository = {
  loadCities(): City[] {
    return read(STORAGE_KEYS.cities, seedCities);
  },
  saveCities(rows: City[]): void {
    write(STORAGE_KEYS.cities, rows);
  },

  loadCarriers(): Carrier[] {
    return read(STORAGE_KEYS.carriers, seedCarriers);
  },
  saveCarriers(rows: Carrier[]): void {
    write(STORAGE_KEYS.carriers, rows);
  },

  loadRules(): PricingRule[] {
    return read(STORAGE_KEYS.rules, seedRules);
  },
  saveRules(rows: PricingRule[]): void {
    write(STORAGE_KEYS.rules, rows);
  },

  loadRateCards(): RateCard[] {
    return read(STORAGE_KEYS.rateCards, seedRateCards);
  },
  saveRateCards(rows: RateCard[]): void {
    write(STORAGE_KEYS.rateCards, rows);
  },

  loadQuotes(): QuoteRecord[] {
    return read(STORAGE_KEYS.quotes, seedQuotes);
  },
  saveQuotes(rows: QuoteRecord[]): void {
    write(STORAGE_KEYS.quotes, rows);
  },

  /** 恢复全部演示数据 */
  resetAll(): void {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }
};
