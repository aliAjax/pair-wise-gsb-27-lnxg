<script setup lang="ts">
import { reactive, watch } from "vue";
import type { ServiceLevel, ShipmentInput, TempMode } from "../types";

const props = defineProps<{
  modelValue: ShipmentInput;
  cities: string[];
  submitLabel?: string;
  hideSubmit?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ShipmentInput];
  submit: [];
}>();

const serviceLevels: ServiceLevel[] = ["标准达", "次日达"];
const tempModes: TempMode[] = ["常温", "冷藏", "冷冻"];

const form = reactive<ShipmentInput>({ ...props.modelValue });

watch(form, (value) => emit("update:modelValue", { ...value }), { deep: true });
watch(
  () => props.modelValue,
  (value) => Object.assign(form, value)
);

function sameCity(): boolean {
  return Boolean(form.origin && form.destination && form.origin === form.destination);
}

function invalid(): boolean {
  return (
    !form.customer.trim() ||
    !form.origin ||
    !form.destination ||
    sameCity() ||
    !(form.actualWeightKg > 0) ||
    !(form.volumeM3 > 0)
  );
}
</script>

<template>
  <form class="form-grid" @submit.prevent="!invalid() && emit('submit')">
    <label>
      客户名称
      <input v-model="form.customer" type="text" required placeholder="如：海沃商贸" />
    </label>
    <div class="field-row">
      <label>
        始发城市
        <select v-model="form.origin" required>
          <option value="" disabled>请选择</option>
          <option v-for="city in cities" :key="city">{{ city }}</option>
        </select>
      </label>
      <label>
        目的城市
        <select v-model="form.destination" required>
          <option value="" disabled>请选择</option>
          <option v-for="city in cities" :key="city">{{ city }}</option>
        </select>
      </label>
    </div>
    <p v-if="sameCity()" class="field-error">始发与目的城市不能相同</p>

    <div class="field-row">
      <label>
        实重 (kg)
        <input v-model.number="form.actualWeightKg" type="number" min="0.01" step="0.1" required />
      </label>
      <label>
        体积 (m³)
        <input v-model.number="form.volumeM3" type="number" min="0.01" step="0.01" required />
      </label>
    </div>

    <div class="field-row">
      <label>
        时效
        <select v-model="form.serviceLevel">
          <option v-for="item in serviceLevels" :key="item">{{ item }}</option>
        </select>
      </label>
      <label>
        温控
        <select v-model="form.tempMode">
          <option v-for="item in tempModes" :key="item">{{ item }}</option>
        </select>
      </label>
    </div>

    <button v-if="!hideSubmit" class="primary" type="submit" :disabled="invalid()">
      {{ submitLabel ?? "发起竞价" }}
    </button>
  </form>
</template>
