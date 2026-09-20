<script setup lang="ts">
import { computed, ref } from "vue";
import type { AuctionResult, ShipmentInput } from "../types";
import { useBiddingStore } from "../stores/bidding";
import AuctionForm from "./AuctionForm.vue";
import AuctionResultPanel from "./AuctionResultPanel.vue";

const emit = defineEmits<{ ordered: [] }>();

const store = useBiddingStore();

const blankShipment = (): ShipmentInput => ({
  customer: "",
  origin: "",
  destination: "",
  actualWeightKg: 100,
  volumeM3: 0.5,
  serviceLevel: "标准达",
  tempMode: "常温",
});

const shipment = ref<ShipmentInput>(blankShipment());
const auction = ref<AuctionResult | null>(null);
const confirmedCode = ref<string>("");

const cities = computed(() => store.cities);

function run() {
  auction.value = store.auction(shipment.value);
  confirmedCode.value = "";
}

function confirmOrder(carrierId: string) {
  if (!auction.value) return;
  const outcome = store.confirmOrder(shipment.value, auction.value, carrierId);
  if (outcome.ok) {
    confirmedCode.value = outcome.order.code;
    auction.value = null;
    shipment.value = blankShipment();
    emit("ordered");
  }
}
</script>

<template>
  <div class="page-grid">
    <section class="panel">
      <h2>运单录入</h2>
      <AuctionForm v-model="shipment" :cities="cities" submit-label="发起竞价" @submit="run" />
      <p v-if="confirmedCode" class="confirm-toast">
        ✅ 报价单 {{ confirmedCode }} 已确认冻结，可在「报价单链」查看。
      </p>
    </section>

    <section class="panel">
      <h2>竞价结果</h2>
      <AuctionResultPanel :auction="auction" @confirm="confirmOrder" />
    </section>
  </div>
</template>
