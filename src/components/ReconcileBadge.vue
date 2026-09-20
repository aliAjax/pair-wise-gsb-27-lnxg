<script setup lang="ts">
import type { OrderRevision } from "../types";
import { reconcileRevision } from "../rules/engine";
import { useBiddingStore } from "../stores/bidding";
import { money } from "../utils/format";

const props = defineProps<{ revision: OrderRevision }>();

const store = useBiddingStore();

// 每次渲染即按当前时间重算一次，停用状态实时取自承运商台账
const result = reconcileRevision(
  props.revision,
  store.carriers.find((carrier) => carrier.id === props.revision.carrierId)
);
const carrierText =
  result.carrierActive === null
    ? "台账缺失"
    : result.carrierActive
      ? "在营"
      : "已停用（不影响快照）";
</script>

<template>
  <span v-if="result.ok" class="reconcile-badge ok">
    ✅ 核对一致：重算 {{ money(result.recomputedTotal) }} = 冻结 {{ money(result.frozenTotal) }}；承运商{{ carrierText }}
  </span>
  <span v-else class="reconcile-badge bad">
    ❌ 快照异常：冻结 {{ money(result.frozenTotal) }}，重算 {{ money(result.recomputedTotal) }}
  </span>
</template>
