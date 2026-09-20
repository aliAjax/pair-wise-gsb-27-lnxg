<script setup lang="ts">
// 页面：竞价工作台 —— 录入需求 → 实时竞价 → 合格才能确认下单
import { computed, reactive, ref } from "vue";
import { useDataStore } from "../stores/dataStore";
import { useQuoteStore } from "../stores/quoteStore";
import {
  laneKey,
  QUAL_LABEL,
  REJECT_LABEL,
  TEMP_OPTIONS,
  TIMELINESS_OPTIONS,
  todayISO
} from "../domain/rules";
import type { BiddingResult, QuoteRequest, TempMode, Timeliness } from "../domain/types";

const data = useDataStore();
const quoteStore = useQuoteStore();

const form = reactive<QuoteRequest>({
  customer: "",
  fromCity: "SH",
  toCity: "NJ",
  actualWeightKg: 120,
  volumeM3: 0.8,
  timeliness: "标准达",
  tempMode: "常温",
  tempRangeC: "",
  shipDate: todayISO()
});

const result = ref<BiddingResult | null>(null);
const errorMessage = ref("");
const confirmedHint = ref("");

const cityPairsInvalid = computed(() => form.fromCity === form.toCity);
const sameCity = cityPairsInvalid;

const laneLabel = computed(() =>
  laneKey(data.cityName(form.fromCity), data.cityName(form.toCity))
);

function runPreview() {
  errorMessage.value = "";
  confirmedHint.value = "";
  if (sameCity.value) {
    result.value = null;
    errorMessage.value = "出发城市与目的城市不能相同";
    return;
  }
  const rule = data.activeRule;
  if (!rule) {
    errorMessage.value = "没有生效中的规则版本，无法竞价";
    return;
  }
  const request: QuoteRequest = {
    ...form,
    customer: form.customer.trim() || "未填写客户",
    fromCity: data.cityName(form.fromCity),
    toCity: data.cityName(form.toCity)
  };
  result.value = quoteStore.preview({
    request,
    carriers: data.carriers,
    rule,
    rateCards: data.rateCards,
    onDate: request.shipDate
  });
}

function confirmOrder() {
  if (!result.value) return;
  try {
    const record = quoteStore.confirm(result.value);
    confirmedHint.value = `已确认下单：${record.quoteNo}（第1版），承运商与费用已冻结`;
    result.value = null;
  } catch (error) {
    errorMessage.value = (error as Error).message;
  }
}

// 首屏自动竞价一次，便于看到演示数据
runPreview();
</script>

<template>
  <div class="page">
    <section class="panel">
      <h2>竞价需求录入</h2>
      <div class="form-grid">
        <label>
          客户名称
          <input v-model="form.customer" type="text" placeholder="如：海沃商贸" />
        </label>
        <label>
          发货日期
          <input v-model="form.shipDate" type="date" />
        </label>
        <label>
          出发城市
          <select v-model="form.fromCity">
            <option v-for="city in data.cities" :key="city.code" :value="city.code">{{ city.name }}</option>
          </select>
        </label>
        <label>
          目的城市
          <select v-model="form.toCity">
            <option v-for="city in data.cities" :key="city.code" :value="city.code">{{ city.name }}</option>
          </select>
        </label>
        <label>
          实重 (kg)
          <input v-model.number="form.actualWeightKg" type="number" min="0" step="0.1" />
        </label>
        <label>
          体积 (m³)
          <input v-model.number="form.volumeM3" type="number" min="0" step="0.01" />
        </label>
        <label>
          时效要求
          <select v-model="form.timeliness">
            <option v-for="item in TIMELINESS_OPTIONS" :key="item" :value="item as Timeliness">{{ item }}</option>
          </select>
        </label>
        <label>
          温控要求
          <select v-model="form.tempMode">
            <option v-for="item in TEMP_OPTIONS" :key="item" :value="item as TempMode">{{ item }}</option>
          </select>
        </label>
        <label class="span-2">
          温区备注（可选）
          <input v-model="form.tempRangeC" type="text" placeholder="如：全程 2~8℃" />
        </label>
      </div>

      <div class="form-actions">
        <button type="button" :disabled="sameCity" @click="runPreview">发起竞价</button>
        <span v-if="sameCity" class="warn">出发与目的城市不能相同</span>
        <span class="muted">当前线路：<strong>{{ laneLabel }}</strong> ｜ 生效规则版本：<strong>{{ data.activeRule?.version ?? "无" }}</strong></span>
      </div>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="confirmedHint" class="success">{{ confirmedHint }}</p>
    </section>

    <section v-if="result" class="panel">
      <h2>竞价结果 <span class="tag">{{ result.evaluatedAt.slice(0, 10) }} 核对</span></h2>

      <!-- 无合格承运商：阻止下单 -->
      <div v-if="!result.winner" class="block-box">
        <h3>⛔ 无合格承运商，已阻止下单</h3>
        <p>线路 <strong>{{ laneKey(result.request.fromCity, result.request.toCity) }}</strong> 上没有“资质有效且覆盖线路”的候选。</p>
        <div v-if="result.conflictingLanes.length" class="block-line">
          <strong>冲突线路：</strong>
          <span v-for="lane in result.conflictingLanes" :key="lane" class="chip danger">{{ lane }}（当前有效覆盖承运商 0 家）</span>
        </div>
        <div v-if="result.missingQuals.length" class="block-line">
          <strong>缺失/失效资质：</strong>
          <div v-for="group in result.missingQuals" :key="group.qualType" class="chip danger">
            {{ QUAL_LABEL[group.qualType] }} → {{ group.carriers.join("、") }}
          </div>
        </div>
        <p class="muted">请在「数据管理」中补录资质、扩展覆盖线路或更换需求后重新竞价。</p>
      </div>

      <template v-else>
        <div class="winner-box">
          <div>
            <p class="eyebrow">最低价中标候选</p>
            <h3>{{ result.winner.carrierName }}</h3>
            <p class="muted">规则版本 {{ result.ruleVersion }} ｜ 计费重 {{ result.winner.fee!.chargeableWeightKg }}kg</p>
          </div>
          <div class="winner-total">¥ {{ result.winner.fee!.total.toFixed(2) }}</div>
        </div>

        <table class="fee-table">
          <thead>
            <tr><th>费用项</th><th>金额(元)</th></tr>
          </thead>
          <tbody>
            <tr v-for="line in result.winner.fee!.lines" :key="line.key">
              <td>{{ line.label }}</td>
              <td>{{ line.amount.toFixed(2) }}</td>
            </tr>
            <tr class="total-row"><td>合计</td><td>{{ result.winner.fee!.total.toFixed(2) }}</td></tr>
          </tbody>
        </table>

        <div class="form-actions">
          <button type="button" class="primary" @click="confirmOrder">确认下单并冻结快照</button>
          <span class="muted">确认后承运商、规则版本、费用明细将被冻结，不可直接改价</span>
        </div>
      </template>

      <h3 class="mt">全部承运商竞价比对</h3>
      <table class="bid-table">
        <thead>
          <tr>
            <th>承运商</th><th>状态</th><th>报价/原因</th><th>计费重kg</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bid in [...result.eligible, ...result.ineligible]" :key="bid.carrierId"
              :class="{ winner: bid.carrierId === result.winner?.carrierId }">
            <td>{{ bid.carrierName }}</td>
            <td>
              <span :class="['chip', bid.eligible ? 'ok' : 'danger']">
                {{ bid.eligible ? "合格" : REJECT_LABEL[bid.reason!] }}
              </span>
            </td>
            <td>{{ bid.eligible ? `¥ ${bid.fee!.total.toFixed(2)}` : bid.reasonDetail }}</td>
            <td>{{ bid.fee ? bid.fee.chargeableWeightKg : "—" }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
