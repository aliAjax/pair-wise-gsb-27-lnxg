<script setup lang="ts">
import { ref, watch } from "vue";
import type { AuctionResult } from "../types";
import { kg, money } from "../utils/format";

const props = defineProps<{
  auction: AuctionResult | null;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}>();

const emit = defineEmits<{
  confirm: [carrierId: string];
}>();

const chosenCarrierId = ref<string>("");
const expanded = ref<Set<string>>(new Set());

watch(
  () => props.auction,
  (auction) => {
    chosenCarrierId.value = auction?.winner?.carrierId ?? "";
    expanded.value = new Set(auction?.winner ? [auction.winner.carrierId] : []);
  }
);

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
</script>

<template>
  <div v-if="!auction" class="placeholder">
    录入线路、实重、体积、时效与温控后发起竞价，系统将按当前规则书计算体积重，并仅邀请资质有效、覆盖线路的承运商出价。
  </div>

  <template v-else>
    <div class="weight-strip">
      <span>实重 <strong>{{ kg(auction.shipment.actualWeightKg) }}</strong></span>
      <span>体积重 <strong>{{ kg(auction.volumeWeightKg) }}</strong></span>
      <span>计费重（取大）<strong class="accent">{{ kg(auction.chargeableWeightKg) }}</strong></span>
      <span>规则版本 <strong>{{ auction.ruleVersion }}</strong></span>
    </div>

    <!-- 无合格承运商：阻止下单并列出缺失资质与冲突线路 -->
    <div v-if="auction.eligibleBids.length === 0" class="blocker">
      <p class="blocker-title">⛔ 没有合格承运商，已阻止下单</p>
      <p class="blocker-sub">以下问题解决后才能重新竞价：</p>
      <ul v-for="bid in auction.rejectedBids.filter((item) => !item.inactive)" :key="bid.carrierId" class="reject-list">
        <li>
          <strong>{{ bid.carrierName }}（{{ bid.carrierCode }}）</strong>
          <ul>
            <li v-for="q in bid.missingQualifications" :key="`m-${q}`">缺失资质：{{ q }}</li>
            <li v-for="q in bid.expiredQualifications" :key="`e-${q.type}`">
              资质已过期：{{ q.type }}（有效期至 {{ q.validUntil }}）
            </li>
            <li v-for="conflict in bid.laneConflicts" :key="conflict">线路冲突：{{ conflict }}</li>
          </ul>
        </li>
      </ul>
      <p v-if="auction.rejectedBids.every((item) => item.inactive)" class="blocker-sub">
        全部承运商当前处于停用状态，请先在管理页启用。
      </p>
    </div>

    <template v-else>
      <p class="section-label">合格出价（按总价升序，最低价中标）</p>
      <div class="bid-list">
        <label
          v-for="(bid, index) in auction.eligibleBids"
          :key="bid.carrierId"
          class="bid"
          :class="{ winner: index === 0, chosen: chosenCarrierId === bid.carrierId }"
        >
          <div class="bid-head">
            <input v-model="chosenCarrierId" type="radio" name="carrier" :value="bid.carrierId" />
            <div class="bid-id">
              <strong>{{ bid.carrierName }}</strong>
              <span class="carrier-code">{{ bid.carrierCode }}</span>
              <span v-if="index === 0" class="winner-tag">最低价</span>
            </div>
            <span class="bid-total">{{ money(bid.totalFee) }}</span>
            <button type="button" class="link" @click.prevent="toggle(bid.carrierId)">
              {{ expanded.has(bid.carrierId) ? "收起明细" : "费用明细" }}
            </button>
          </div>
          <table v-if="expanded.has(bid.carrierId)" class="fee-table">
            <tbody>
              <tr v-for="item in bid.feeItems" :key="item.name">
                <td>{{ item.name }}</td>
                <td class="basis">{{ item.basis }}</td>
                <td class="amount">{{ money(item.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </label>
      </div>

      <div v-if="auction.rejectedBids.length" class="rejected">
        <p class="section-label muted">未参与报价的承运商</p>
        <div v-for="bid in auction.rejectedBids" :key="bid.carrierId" class="reject-row">
          <span class="reject-name">{{ bid.carrierName }}（{{ bid.carrierCode }}）</span>
          <span v-if="bid.inactive" class="reason-chip">已停用</span>
          <span v-for="q in bid.missingQualifications" :key="q" class="reason-chip">缺失资质：{{ q }}</span>
          <span v-for="q in bid.expiredQualifications" :key="q.type" class="reason-chip warn">
            {{ q.type }}过期至 {{ q.validUntil }}
          </span>
          <span v-for="conflict in bid.laneConflicts" :key="conflict" class="reason-chip">{{ conflict }}</span>
        </div>
      </div>

      <button
        class="primary wide"
        type="button"
        :disabled="confirmDisabled"
        @click="emit('confirm', chosenCarrierId)"
      >
        {{ confirmLabel ?? "确认下单并冻结快照" }}
      </button>
      <p class="freeze-hint">
        确认后将冻结中标承运商费率、规则版本 {{ auction.ruleVersion }} 与全部费用明细；换价只能新建带原因的修订。
      </p>
    </template>
  </template>
</template>
