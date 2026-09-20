import type { PersistState } from "../types";
import { buildSeedOrders, seedCarriers, seedRuleBooks } from "./seed";

/** 数据层：只负责序列化存取，不承载任何业务规则 */

const STORAGE_KEY = "logistics-bidding-v1";
const LEGACY_KEY = "hxwlfront-13-freight";

function freshState(): PersistState {
  return {
    carriers: seedCarriers,
    ruleBooks: seedRuleBooks,
    currentRuleVersion: seedRuleBooks[seedRuleBooks.length - 1].version,
    orders: buildSeedOrders(),
  };
}

export function loadState(): PersistState {
  // 旧原型数据结构不兼容，首次迁移时清除
  if (localStorage.getItem(LEGACY_KEY)) {
    localStorage.removeItem(LEGACY_KEY);
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return freshState();
  try {
    const parsed = JSON.parse(raw) as PersistState;
    if (!parsed.carriers || !parsed.ruleBooks || !parsed.orders) return freshState();
    return parsed;
  } catch {
    return freshState();
  }
}

export function saveState(state: PersistState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): PersistState {
  const state = freshState();
  saveState(state);
  return state;
}
