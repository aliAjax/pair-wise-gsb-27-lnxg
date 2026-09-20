<script setup lang="ts">
import { ref } from "vue";
import BidDesk from "./components/BidDesk.vue";
import QuoteHistory from "./components/QuoteHistory.vue";
import DataAdmin from "./components/DataAdmin.vue";
import { useDataStore } from "./stores/dataStore";
import { useQuoteStore } from "./stores/quoteStore";

const data = useDataStore();
const quoteStore = useQuoteStore();

// localStorage 为同步读取，setup 阶段即可装载；刷新后报价链与停用状态直接可用
data.load();
quoteStore.load();

const tabs = [
  { key: "desk", label: "竞价台" },
  { key: "history", label: "报价与修订链" },
  { key: "admin", label: "数据管理" }
] as const;

const activeTab = ref<(typeof tabs)[number]["key"]>("desk");
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">可追溯 · 多承运商物流竞价台</p>
          <h1>物流竞价与报价冻结系统</h1>
          <p class="subtitle">
            体积重与实重取大 → 仅资质有效且覆盖线路的承运商参与最低价 → 确认即冻结快照 → 换价只能带原因修订
          </p>
        </div>
        <nav class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            :class="['tab', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>
      </header>

      <BidDesk v-if="activeTab === 'desk'" />
      <QuoteHistory v-else-if="activeTab === 'history'" />
      <DataAdmin v-else-if="activeTab === 'admin'" />
    </div>
  </main>
</template>
