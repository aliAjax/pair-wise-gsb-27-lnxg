<script setup lang="ts">
import { computed, ref } from "vue";
import type { Order, OrderRevision, ShipmentInput } from "../types";
import { reconcileRevision } from "../rules/engine";
import { useBiddingStore } from "../stores/bidding";
import { dateTime, kg, money } from "../utils/format";
import AuctionForm from "./AuctionForm.vue";
import AuctionResultPanel from "./AuctionResultPanel.vue";
import ReconcileBadge from "./ReconcileBadge.vue";

const store = useBiddingStore();

const expandedOrders = ref<Set<string>>(new Set([store.orders[0]?.id].filter(Boolean) as string[]));
const checkedRevisions = ref<Record<string, boolean>>({});
const revisingOrderId = ref<string>("");
const revisionShipment = ref<ShipmentInput | null>(null);
const revisionReason = ref("");
const revisionAuction = computed(() =>
  revisionShipment.value ? store.auction(revisionShipment.value) : null
);

const orders = computed(() => store.orders);
const cities = computed(() => store.cities);

function toggleOrder(id: string) {
  const next = new Set(expandedOrders.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedOrders.value = next;
}

function check(orderId: string, revisionNo: number) {
  checkedRevisions.value[`${orderId}#${revisionNo}`] = true;
}

function isChecked(orderId: string, revisionNo: number): boolean {
  return Boolean(checkedRevisions.value[`${orderId}#${revisionNo}`]);
}

function startRevision(order: Order) {
  const last = order.revisions[order.revisions.length - 1];
  revisingOrderId.value = order.id;
  revisionShipment.value = { ...last.shipment };
  revisionReason.value = "";
}

function cancelRevision() {
  revisingOrderId.value = "";
  revisionShipment.value = null;
  revisionReason.value = "";
}

function submitRevision(carrierId: string) {
  if (!revisionShipment.value || !revisionReason.value.trim()) return;
  const outcome = store.reviseOrder(
    revisingOrderId.value,
    revisionShipment.value,
    revisionReason.value,
    carrierId
  );
  if (outcome.ok) {
    const id = revisingOrderId.value;
    cancelRevision();
    expandedOrders.value = new Set([...expandedOrders.value, id]);
  }
}

function statusText(revision: OrderRevision): { label: string; cls: string } {
  const carrier = store.carrierById(revision.carrierId);
  if (!carrier) return { label: "承运商台账已删除", cls: "danger" };
  if (!carrier.active) return { label: `承运商已于${carrier.deactivatedAt?.slice(0, 10) ?? "—"}停用`, cls: "warn" };
  return { label: "承运商在营", cls: "ok" };
}
</script>

<template>
  <div v-if="orders.length === 0" class="empty">还没有已确认报价单，先去竞价台下单。</div>

  <div class="order-list">
    <article v-for="order in orders" :key="order.id" class="order-card">
      <header class="order-head" @click="toggleOrder(order.id)">
        <div>
          <strong class="order-code">{{ order.code }}</strong>
          <span class="status-pill" :class="order.status === '已修订' ? 'revised' : 'confirmed'">
            {{ order.status }}
          </span>
          <span v-if="order.revisions.length > 1" class="chain-count">
            {{ order.revisions.length }} 个版本
          </span>
        </div>
        <div class="order-meta">
          <span>{{ order.revisions[0].shipment.customer }}</span>
          <span>{{ order.revisions[0].shipment.origin }} → {{ order.revisions[0].shipment.destination }}</span>
          <span class="link">{{ expandedOrders.has(order.id) ? "收起" : "展开报价链" }}</span>
        </div>
      </header>

      <div v-if="expandedOrders.has(order.id)" class="chain">
        <div
          v-for="(revision, index) in order.revisions"
          :key="revision.revisionNo"
          class="revision"
          :class="{ current: index === order.revisions.length - 1 }"
        >
          <div class="revision-rail">
            <span class="revision-dot" :class="index === order.revisions.length - 1 ? 'latest' : 'old'" />
            <span v-if="index < order.revisions.length - 1" class="revision-line" />
          </div>
          <div class="revision-body">
            <div class="revision-head">
              <div>
                <strong>v{{ revision.revisionNo }}</strong>
                <span v-if="index === order.revisions.length - 1" class="current-tag">当前生效</span>
                <span v-else class="superseded-tag">已被 v{{ revision.revisionNo + 1 }} 替换</span>
              </div>
              <span class="revision-date">{{ dateTime(revision.createdAt) }}</span>
            </div>
            <p class="revision-reason">{{ revision.reason }}</p>

            <div class="revision-grid">
              <div>
                <span class="kv-label">中标承运商</span>
                <span class="kv-value">
                  {{ revision.carrierName }}
                  <span class="carrier-state" :class="statusText(revision).cls">
                    {{ statusText(revision).label }}
                  </span>
                </span>
              </div>
              <div>
                <span class="kv-label">规则版本</span>
                <span class="kv-value">{{ revision.ruleVersion }}</span>
              </div>
              <div>
                <span class="kv-label">实重 / 体积重 / 计费重</span>
                <span class="kv-value">
                  {{ kg(revision.actualWeightKg) }} / {{ kg(revision.volumeWeightKg) }} /
                  <strong>{{ kg(revision.chargeableWeightKg) }}</strong>
                </span>
              </div>
              <div>
                <span class="kv-label">时效 / 温控</span>
                <span class="kv-value">
                  {{ revision.shipment.serviceLevel }} · {{ revision.shipment.tempMode }}
                </span>
              </div>
            </div>

            <details class="frozen-fees">
              <summary>冻结费用明细与当时全部报价（{{ revision.allQuotes.length }}）</summary>
              <table class="fee-table static">
                <tbody>
                  <tr v-for="item in revision.feeItems" :key="item.name">
                    <td>{{ item.name }}</td>
                    <td class="basis">{{ item.basis }}</td>
                    <td class="amount">{{ money(item.amount) }}</td>
                  </tr>
                  <tr class="total-row">
                    <td>合计</td>
                    <td class="basis">快照冻结金额</td>
                    <td class="amount">{{ money(revision.totalFee) }}</td>
                  </tr>
                </tbody>
              </table>
              <ul class="frozen-quotes">
                <li v-for="quote in revision.allQuotes" :key="quote.carrierId">
                  <span>{{ quote.carrierName }}</span>
                  <span v-if="quote.carrierId === revision.carrierId" class="winner-tag">中标</span>
                  <span class="muted">{{ quote.eligible ? money(quote.totalFee) : "未合格" }}</span>
                </li>
              </ul>
            </details>

            <div class="reconcile">
              <button type="button" class="secondary" @click="check(order.id, revision.revisionNo)">
                按快照核对
              </button>
              <template v-if="isChecked(order.id, revision.revisionNo)">
                <ReconcileBadge :revision="revision" />
              </template>
              <span v-else class="muted small">
                用冻结的规则 {{ revision.ruleVersion }} 与费率重算，与本版金额逐项比对
              </span>
            </div>
          </div>
        </div>

        <!-- 换价：只能新建带原因的修订 -->
        <div v-if="revisingOrderId !== order.id" class="revision-actions">
          <button type="button" class="secondary" @click="startRevision(order)">
            新建换价修订（不改旧版本）
          </button>
        </div>

        <div v-else class="revision-form">
          <h3>为 {{ order.code }} 新建修订</h3>
          <label class="reason-field">
            修订原因（必填）
            <textarea
              v-model="revisionReason"
              placeholder="如：客户要求次日达 / 实重调整 / 温控变化"
            />
          </label>
          <div class="revision-form-grid">
            <AuctionForm
              v-if="revisionShipment"
              v-model="revisionShipment"
              :cities="cities"
              hide-submit
            />
            <div class="revision-result">
              <AuctionResultPanel
                :auction="revisionAuction"
                confirm-label="提交修订并冻结新快照"
                :confirm-disabled="!revisionReason.trim()"
                @confirm="submitRevision"
              />
              <p
                v-if="revisionAuction && revisionAuction.eligibleBids.length > 0 && !revisionReason.trim()"
                class="field-error"
              >
                请先填写修订原因，再提交修订。
              </p>
            </div>
          </div>
          <button type="button" class="secondary cancel" @click="cancelRevision">取消</button>
        </div>
      </div>
    </article>
  </div>
</template>

