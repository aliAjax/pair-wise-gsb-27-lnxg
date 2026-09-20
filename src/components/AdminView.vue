<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useBiddingStore } from "../stores/bidding";
import { date } from "../utils/format";

const store = useBiddingStore();

const carriers = computed(() => store.carriers);
const rules = computed(() => [...store.ruleBooks].reverse());
const today = new Date().toISOString().slice(0, 10);

const newRule = reactive({ version: "", volumeFactor: 250, changeNote: "" });
const ruleError = ref("");

function publishRule() {
  ruleError.value = "";
  if (!newRule.version.trim() || !(newRule.volumeFactor > 0)) {
    ruleError.value = "请填写版本号与正数体积重系数";
    return;
  }
  const ok = store.publishRuleBook(newRule.version, Number(newRule.volumeFactor), newRule.changeNote);
  if (!ok) {
    ruleError.value = `版本号 ${newRule.version} 已存在`;
    return;
  }
  newRule.version = "";
  newRule.changeNote = "";
}

function confirmReset() {
  if (window.confirm("恢复演示数据将清除本地全部报价单与改动，确定继续？")) {
    store.resetDemo();
  }
}
</script>

<template>
  <div class="admin-grid">
    <section class="panel">
      <h2>承运商台账</h2>
      <p class="panel-hint">停用只影响后续竞价；历史报价单仍按冻结快照核对并在此标注停用状态。</p>

      <div v-for="carrier in carriers" :key="carrier.id" class="carrier-card">
        <div class="carrier-head">
          <div>
            <strong>{{ carrier.name }}</strong>
            <span class="carrier-code">{{ carrier.code }}</span>
            <span class="state-pill" :class="carrier.active ? 'on' : 'off'">
              {{ carrier.active ? "在营" : "已停用" }}
            </span>
            <span v-if="carrier.deactivatedAt" class="muted small">
              停用于 {{ date(carrier.deactivatedAt) }}
            </span>
          </div>
          <button
            type="button"
            :class="carrier.active ? 'danger' : 'secondary'"
            @click="store.setCarrierActive(carrier.id, !carrier.active)"
          >
            {{ carrier.active ? "停用" : "重新启用" }}
          </button>
        </div>

        <div class="cert-row">
          <span
            v-for="cert in carrier.qualifications"
            :key="cert.type"
            class="cert-chip"
            :class="cert.validUntil >= today ? 'valid' : 'expired'"
            :title="`${cert.validFrom} ~ ${cert.validUntil}`"
          >
            {{ cert.type }} · 有效期至 {{ cert.validUntil }}
          </span>
          <span v-if="carrier.qualifications.length === 0" class="muted small">无资质</span>
        </div>

        <ul class="lane-list">
          <li v-for="(lane, i) in carrier.lanes" :key="i">
            {{ lane.from }} → {{ lane.to }}
            <span class="muted small">
              （{{ lane.services.join("/") }} · {{ lane.tempModes.join("/") }} ·
              {{ lane.minWeightKg }}–{{ lane.maxWeightKg }}kg）
            </span>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel">
      <h2>计费规则书</h2>
      <p class="panel-hint">
        当前竞价依据：<strong>{{ store.currentRule.version }}</strong>（发布于 {{ date(store.currentRule.publishedAt) }}）。
        规则只增不改，新版本发布后旧报价继续引用旧版本。
      </p>

      <div class="rule-current">
        <p class="rule-note">{{ store.currentRule.changeNote }}</p>
        <p class="muted">体积重系数：{{ store.currentRule.volumeFactorKgPerM3 }} kg/m³</p>
      </div>

      <h3>发布新版本</h3>
      <div class="new-rule">
        <label>
          版本号
          <input v-model="newRule.version" placeholder="如 v2027.1" />
        </label>
        <label>
          体积重系数 (kg/m³)
          <input v-model.number="newRule.volumeFactor" type="number" min="1" step="1" />
        </label>
        <label class="full">
          变更说明
          <textarea v-model="newRule.changeNote" placeholder="说明本次调整原因，随版本永久留痕" />
        </label>
      </div>
      <p v-if="ruleError" class="field-error">{{ ruleError }}</p>
      <button type="button" class="primary" @click="publishRule">发布新版本</button>

      <h3 class="history-title">历史版本</h3>
      <ul class="rule-history">
        <li v-for="rule in rules" :key="rule.version">
          <div class="rule-version">
            <strong>{{ rule.version }}</strong>
            <span v-if="rule.version === store.currentRuleVersion" class="current-tag">当前</span>
          </div>
          <div class="muted small">{{ date(rule.publishedAt) }} · 系数 {{ rule.volumeFactorKgPerM3 }}</div>
          <div>{{ rule.changeNote }}</div>
        </li>
      </ul>

      <button type="button" class="secondary wide reset" @click="confirmReset">
        恢复演示数据
      </button>
    </section>
  </div>
</template>
