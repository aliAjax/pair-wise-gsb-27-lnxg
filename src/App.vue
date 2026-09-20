<script setup lang="ts">
import { computed, ref } from "vue";
import { useBiddingStore } from "./stores/bidding";
import QuoteDesk from "./components/QuoteDesk.vue";
import OrdersView from "./components/OrdersView.vue";
import AdminView from "./components/AdminView.vue";

type Tab = "desk" | "orders" | "admin";

const store = useBiddingStore();
const tab = ref<Tab>("desk");

const tabs: { key: Tab; label: string }[] = [
  { key: "desk", label: "竞价台" },
  { key: "orders", label: "报价单链" },
  { key: "admin", label: "规则与承运商" },
];

const metrics = computed(() => [
  { label: "已确认报价单", value: store.orderCount },
  { label: "报价版本总数", value: store.revisionCount },
  { label: "当前规则版本", value: store.currentRuleVersion },
  { label: "已停用承运商", value: store.inactiveCarrierCount },
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">多承运商 · 可追溯 · 快照核对</p>
          <h1>多承运商物流竞价台</h1>
          <p class="subtitle">
            录入城市、实重、体积、时效与温控，体积重与实重取大；仅资质有效且覆盖线路的承运商参与最低价选择。
            确认即冻结承运商费率、规则版本与费用明细，换价只能新建带原因的修订。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue 3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">规则引擎独立</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="item in metrics" :key="item.label" class="metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          class="tab"
          :class="{ active: tab === item.key }"
          @click="tab = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <QuoteDesk v-if="tab === 'desk'" @ordered="tab = 'orders'" />
      <OrdersView v-else-if="tab === 'orders'" />
      <AdminView v-else />
    </div>
  </main>
</template>
