<script setup lang="ts">
// 页面：数据管理 —— 承运商（停用/资质/覆盖线路）、规则版本发布、费率卡维护
import { reactive } from "vue";
import { useDataStore } from "../stores/dataStore";
import { useQuoteStore } from "../stores/quoteStore";
import { QUAL_LABEL, todayISO } from "../domain/rules";
import type { Qualification, QualType, TempMode, Timeliness } from "../domain/types";

const data = useDataStore();
const quoteStore = useQuoteStore();

const qualTypes = Object.keys(QUAL_LABEL) as QualType[];

function addQualification(carrierId: string) {
  const carrier = data.carrierById(carrierId);
  if (!carrier) return;
  carrier.qualifications.push({
    type: "GENERAL",
    validFrom: todayISO(),
    validUntil: todayISO().slice(0, 4) + "-12-31"
  });
  data.persistCarriers();
}

function removeQualification(carrierId: string, index: number) {
  const carrier = data.carrierById(carrierId);
  if (!carrier) return;
  carrier.qualifications.splice(index, 1);
  data.persistCarriers();
}

function onCarrierEdit() {
  data.persistCarriers();
}

const newRule = reactive({
  version: "",
  volumetricFactor: 300,
  minChargeableKg: 10,
  note: ""
});

function publishRule() {
  if (!newRule.version.trim()) return;
  data.publishRule({
    version: newRule.version.trim(),
    effectiveFrom: todayISO(),
    volumetricFactor: Number(newRule.volumetricFactor),
    minChargeableKg: Number(newRule.minChargeableKg),
    currency: "CNY",
    note: newRule.note.trim() || `规则版本 ${newRule.version.trim()}`
  });
  newRule.version = "";
  newRule.note = "";
}

const surchargeTimeliness: Timeliness[] = ["标准达", "次日达", "当日达"];
const surchargeTemp: TempMode[] = ["常温", "冷藏", "冷冻"];

function resetDemo() {
  if (confirm("将清空浏览器中的演示数据并恢复初始种子（含历史报价），确定继续？")) {
    data.resetDemoData();
    quoteStore.$reset();
    quoteStore.load();
  }
}
</script>

<template>
  <div class="page">
    <!-- 承运商 -->
    <section class="panel">
      <h2>承运商与资质 <span class="tag">停用不影响历史报价</span></h2>
      <article v-for="carrier in data.carriers" :key="carrier.id" class="carrier-card">
        <header class="carrier-head">
          <div>
            <strong :class="{ carrierOff: !carrier.active }">{{ carrier.name }}</strong>
            <span class="muted">（{{ carrier.code }}）</span>
            <span :class="['chip', carrier.active ? 'ok' : 'danger']">{{ carrier.active ? "在营" : "已停用" }}</span>
          </div>
          <button
            type="button"
            :class="carrier.active ? 'danger' : 'primary'"
            @click="data.toggleCarrierActive(carrier.id)">
            {{ carrier.active ? "停用承运商" : "恢复启用" }}
          </button>
        </header>

        <table class="qual-table">
          <thead>
            <tr><th>资质</th><th>生效日</th><th>到期日</th><th>温区(℃)</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="(qual, index) in carrier.qualifications" :key="index">
              <td>
                <select v-model="qual.type" @change="onCarrierEdit">
                  <option v-for="type in qualTypes" :key="type" :value="type">{{ QUAL_LABEL[type] }}</option>
                </select>
              </td>
              <td><input v-model="qual.validFrom" type="date" @change="onCarrierEdit" /></td>
              <td><input v-model="qual.validUntil" type="date" @change="onCarrierEdit" /></td>
              <td>
                <template v-if="qual.type === 'COLD'">
                  <input v-model.number="qual.minTempC" type="number" class="temp-input" @change="onCarrierEdit" />
                  ~
                  <input v-model.number="qual.maxTempC" type="number" class="temp-input" @change="onCarrierEdit" />
                </template>
                <span v-else class="muted">—</span>
              </td>
              <td><button type="button" class="danger small" @click="removeQualification(carrier.id, index)">删除</button></td>
            </tr>
          </tbody>
        </table>
        <div class="carrier-actions">
          <button type="button" class="secondary small" @click="addQualification(carrier.id)">+ 添加资质</button>
        </div>

        <label class="lane-edit">
          覆盖线路（方向敏感，逗号分隔）
          <input
            :value="carrier.lanes.join(',')"
            @change="(e) => { carrier.lanes = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean); onCarrierEdit(); }"
          />
        </label>
      </article>
    </section>

    <!-- 规则版本 -->
    <section class="panel">
      <h2>计费规则版本</h2>
      <table class="bid-table">
        <thead>
          <tr><th>版本</th><th>状态</th><th>生效日</th><th>体积重系数(kg/m³)</th><th>最低计费重kg</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="rule in [...data.rules].reverse()" :key="rule.id"
              :class="{ winner: rule.status === 'active' }">
            <td>{{ rule.version }}</td>
            <td><span :class="['chip', rule.status === 'active' ? 'ok' : '']">{{ rule.status === "active" ? "生效中" : "已归档（冻结）" }}</span></td>
            <td>{{ rule.effectiveFrom }}</td>
            <td>{{ rule.volumetricFactor }}</td>
            <td>{{ rule.minChargeableKg }}</td>
            <td class="muted">{{ rule.note }}</td>
          </tr>
        </tbody>
      </table>

      <h3 class="mt">发布新版本（旧版本自动归档，历史报价继续引用旧版本快照）</h3>
      <div class="form-grid">
        <label>新版本号<input v-model="newRule.version" placeholder="如：R2026.2" /></label>
        <label>体积重系数<input v-model.number="newRule.volumetricFactor" type="number" /></label>
        <label>最低计费重kg<input v-model.number="newRule.minChargeableKg" type="number" /></label>
        <label class="span-2">版本说明<input v-model="newRule.note" placeholder="如：体积重系数上调至 300kg/m³" /></label>
      </div>
      <div class="form-actions">
        <button type="button" class="primary" :disabled="!newRule.version.trim()" @click="publishRule">发布新版本</button>
      </div>
    </section>

    <!-- 费率卡 -->
    <section class="panel">
      <h2>费率卡（绑定规则版本 × 承运商 × 线路）</h2>
      <p class="muted">修改费率卡只影响之后的竞价/修订；已确认报价的费用明细已冻结，不会变化。</p>
      <table class="rate-table">
        <thead>
          <tr>
            <th>规则版本</th><th>承运商</th><th>线路</th><th>起重价</th><th>元/kg</th><th>燃油%</th>
            <th>时效附加（标/次/当）</th><th>温控附加（常/冷/冻）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="card in data.rateCards" :key="card.id">
            <td>{{ data.rules.find(r => r.id === card.ruleVersionId)?.version ?? card.ruleVersionId }}</td>
            <td>{{ data.carrierById(card.carrierId)?.name ?? card.carrierId }}</td>
            <td>{{ card.lane }}</td>
            <td><input v-model.number="card.baseFee" type="number" @change="data.persistRateCards()" /></td>
            <td><input v-model.number="card.perKg" type="number" step="0.1" @change="data.persistRateCards()" /></td>
            <td><input v-model.number="card.fuelRate" type="number" step="0.01" @change="data.persistRateCards()" /></td>
            <td class="surcharge-cell">
              <input v-for="t in surchargeTimeliness" :key="t" v-model.number="card.timelinessSurcharge[t as Timeliness]"
                     type="number" @change="data.persistRateCards()" />
            </td>
            <td class="surcharge-cell">
              <input v-for="t in surchargeTemp" :key="t" v-model.number="card.tempSurcharge[t as TempMode]"
                     type="number" @change="data.persistRateCards()" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel danger-panel">
      <h2>演示数据</h2>
      <button type="button" class="danger" @click="resetDemo">恢复初始种子数据</button>
    </section>
  </div>
</template>
