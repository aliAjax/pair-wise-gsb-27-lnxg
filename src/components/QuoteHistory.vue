<script setup lang="ts">
// 页面：报价记录 —— 修订链展示、带原因新建修订、历史快照核对
import { computed, reactive, ref } from "vue";
import { useDataStore } from "../stores/dataStore";
import { useQuoteStore } from "../stores/quoteStore";
import { runBidding, TEMP_OPTIONS, TIMELINESS_OPTIONS } from "../domain/rules";
import { verifySnapshot, type SnapshotVerification } from "../domain/verify";
import type { QuoteRecord, QuoteRequest } from "../domain/types";

const data = useDataStore();
const quoteStore = useQuoteStore();

const expanded = ref<Set<string>>(new Set());
const revisingChain = ref<string | null>(null);
const revisionReason = ref("");
const revisionError = ref("");

function requestClone(record: QuoteRecord): QuoteRequest {
  return structuredClone(record.request);
}

const revisionForm = reactive<QuoteRequest>({
  customer: "",
  fromCity: "",
  toCity: "",
  actualWeightKg: 0,
  volumeM3: 0,
  timeliness: "标准达",
  tempMode: "常温",
  tempRangeC: "",
  shipDate: ""
});

const chains = computed(() => quoteStore.chains);

function verification(record: QuoteRecord): SnapshotVerification | null {
  return verifySnapshot(record, data.carriers, data.rules, data.rateCards);
}

function carrierActiveNow(carrierId: string): boolean | null {
  const carrier = data.carrierById(carrierId);
  return carrier ? carrier.active : null;
}

function toggle(chainId: string) {
  const next = new Set(expanded.value);
  if (next.has(chainId)) next.delete(chainId);
  else next.add(chainId);
  expanded.value = next;
}

function openRevision(chainId: string) {
  const chain = chains.value.find((c) => c.chainId === chainId);
  if (!chain) return;
  Object.assign(revisionForm, requestClone(chain.latest));
  revisionReason.value = "";
  revisionError.value = "";
  revisingChain.value = chainId;
}

const revisionPreview = computed(() => {
  if (!revisingChain.value) return null;
  const rule = data.activeRule;
  if (!rule) return null;
  return runBidding({
    request: { ...revisionForm },
    carriers: data.carriers,
    rule,
    rateCards: data.rateCards,
    onDate: revisionForm.shipDate
  });
});

function submitRevision() {
  if (!revisingChain.value || !revisionPreview.value) return;
  revisionError.value = "";
  try {
    quoteStore.revise(revisingChain.value, revisionReason.value, revisionPreview.value);
    revisingChain.value = null;
  } catch (error) {
    revisionError.value = (error as Error).message;
  }
}

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("zh-CN") : "—";
}
</script>

<template>
  <div class="page">
    <section class="panel">
      <h2>报价记录与修订链 <span class="tag">{{ chains.length }} 条链</span></h2>
      <p class="muted">
        确认后的报价不可直接改价；换价须「新建修订」并填写原因。承运商停用或规则改版后，历史报价仍按冻结快照核对。
      </p>

      <div v-if="chains.length === 0" class="empty">暂无报价记录，请先在竞价台确认一单</div>

      <article v-for="chain in chains" :key="chain.chainId" class="chain-card">
        <header class="chain-head" @click="toggle(chain.chainId)">
          <div>
            <strong>{{ chain.quoteNo }}</strong>
            <span class="muted"> / {{ chain.latest.customer }} / {{ chain.latest.request.fromCity }}-{{ chain.latest.request.toCity }}</span>
          </div>
          <div class="chain-meta">
            <span class="chip ok">v{{ chain.latest.seq }} 最新</span>
            <span class="muted">共 {{ chain.records.length }} 版</span>
            <button type="button" class="secondary small" @click.stop="openRevision(chain.chainId)">新建修订</button>
          </div>
        </header>

        <div v-if="expanded.has(chain.chainId)" class="chain-body">
          <div v-for="record in chain.records" :key="record.id" class="version-card">
            <div class="version-head">
              <span class="chip" :class="record.seq === chain.latest.seq ? 'ok' : ''">v{{ record.seq }}</span>
              <strong>{{ record.winnerSnapshot?.carrierName }}</strong>
              <span class="price">¥ {{ record.winnerSnapshot?.fee.total.toFixed(2) }}</span>
              <span class="muted">规则 {{ record.ruleSnapshot?.version }}</span>
              <span class="muted">{{ fmtTime(record.confirmedAt) }}</span>
            </div>
            <p v-if="record.revisionReason" class="revision-reason">
              修订原因：{{ record.revisionReason }}
            </p>
            <p v-else class="muted">初版确认</p>

            <!-- 冻结时承运商状态（刷新后与数据管理中的停用状态对照） -->
            <div class="freeze-strip">
              <span class="muted">冻结时承运商状态：</span>
              <span v-for="(snap, cid) in record.carrierSnapshotAtFreeze" :key="cid"
                    :class="['chip', snap.active ? '' : 'danger']">
                {{ snap.name }}{{ snap.active ? "·在营" : "·停用" }}
              </span>
            </div>

            <details class="fee-details">
              <summary>竞价快照（{{ record.bidsSnapshot.length }} 家，冻结于 {{ fmtTime(record.confirmedAt) }}）</summary>
              <table class="bid-table">
                <thead><tr><th>承运商</th><th>是否合格</th><th>报价/原因</th></tr></thead>
                <tbody>
                  <tr v-for="bid in record.bidsSnapshot" :key="bid.carrierId"
                      :class="{ winner: bid.carrierId === record.winnerSnapshot?.carrierId }">
                    <td>{{ bid.carrierName }}</td>
                    <td>
                      <span :class="['chip', bid.eligible ? 'ok' : 'danger']">
                        {{ bid.eligible ? "合格" : "落选" }}
                      </span>
                    </td>
                    <td>{{ bid.eligible ? `¥ ${bid.fee?.total.toFixed(2)}` : bid.reasonDetail }}</td>
                  </tr>
                </tbody>
              </table>
            </details>

            <!-- 快照核对 -->
            <template v-for="verificationRecord in [verification(record)]" :key="record.id">
            <div v-if="verificationRecord" class="verify-box">
              <template v-for="(note, idx) in verificationRecord.notes" :key="idx">
                <p class="warn">◉ {{ note }}</p>
              </template>
              <p class="muted">
                快照状态：
                <span :class="['chip', carrierActiveNow(record.winnerSnapshot!.carrierId) === false ? 'danger' : 'ok']">
                  承运商当前{{
                    carrierActiveNow(record.winnerSnapshot!.carrierId) === false
                      ? "已停用（报价仍按快照执行）"
                      : carrierActiveNow(record.winnerSnapshot!.carrierId) === null
                        ? "档案缺失（按快照执行）"
                        : "在营"
                  }}
                </span>
                <span v-if="verificationRecord.feeMatches === true" class="chip ok">现行重算 ¥{{ verificationRecord.recomputedTotalNow?.toFixed(2) }} 与快照一致</span>
                <span v-else-if="verificationRecord.feeMatches === false" class="chip warn-chip">
                  现行重算 ¥{{ verificationRecord.recomputedTotalNow?.toFixed(2) }} ≠ 快照 ¥{{ verificationRecord.frozenTotal.toFixed(2) }}，以快照为准
                </span>
              </p>
              <details class="fee-details">
                <summary>费用明细快照（计费重 {{ record.winnerSnapshot?.fee.chargeableWeightKg }}kg）</summary>
                <table class="fee-table">
                  <tbody>
                    <tr v-for="line in record.winnerSnapshot?.fee.lines" :key="line.key">
                      <td>{{ line.label }}</td><td>{{ line.amount.toFixed(2) }}</td>
                    </tr>
                    <tr class="total-row"><td>合计</td><td>{{ record.winnerSnapshot?.fee.total.toFixed(2) }}</td></tr>
                  </tbody>
                </table>
              </details>
            </div>
            </template>
          </div>
        </div>
      </article>
    </section>

    <!-- 新建修订弹层 -->
    <div v-if="revisingChain" class="modal-mask" @click.self="revisingChain = null">
      <div class="modal">
        <h2>新建修订（换价）</h2>
        <p class="muted">原报价不改动；本修订将按<strong>当前</strong>承运商资质与规则版本重新竞价并冻结。</p>
        <label class="reason-label">
          修订原因 <span class="required">*</span>
          <textarea v-model="revisionReason" rows="2" placeholder="如：客户要求冷冻改冷藏、燃油费率上调重核"></textarea>
        </label>
        <div class="form-grid">
          <label>实重 kg<input v-model.number="revisionForm.actualWeightKg" type="number" step="0.1" /></label>
          <label>体积 m³<input v-model.number="revisionForm.volumeM3" type="number" step="0.01" /></label>
          <label>时效
            <select v-model="revisionForm.timeliness">
              <option v-for="item in TIMELINESS_OPTIONS" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>温控
            <select v-model="revisionForm.tempMode">
              <option v-for="item in TEMP_OPTIONS" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>

        <div v-if="revisionPreview" class="revision-preview">
          <template v-if="revisionPreview.winner">
            <p>重新竞价结果：<strong>{{ revisionPreview.winner.carrierName }}</strong>
              <span class="price"> ¥{{ revisionPreview.winner.fee!.total.toFixed(2) }}</span>
              （规则 {{ revisionPreview.ruleVersion }}）</p>
          </template>
          <p v-else class="error">当前无合格承运商，无法生成修订（请先在数据管理修复资质/线路）</p>
        </div>

        <p v-if="revisionError" class="error">{{ revisionError }}</p>
        <div class="form-actions">
          <button type="button" class="primary"
                  :disabled="!revisionReason.trim() || !revisionPreview?.winner"
                  @click="submitRevision">
            确认修订并冻结
          </button>
          <button type="button" class="secondary" @click="revisingChain = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>
