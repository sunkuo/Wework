<template>
  <el-card>
    <template #header>
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Status</span>
        <el-button @click="refresh">Refresh</el-button>
      </div>
    </template>
    <el-descriptions column="1" border size="small">
      <el-descriptions-item label="UUID">{{ appStore.active.uuid }}</el-descriptions-item>
      <el-descriptions-item label="VID">{{ appStore.active.vid }}</el-descriptions-item>
      <el-descriptions-item label="IsLogin">{{ appStore.active.isLogin }}</el-descriptions-item>
      <el-descriptions-item label="LastEvent">{{ appStore.active.lastEvent }}</el-descriptions-item>
      <el-descriptions-item label="LastError">{{ appStore.active.lastError }}</el-descriptions-item>
      <el-descriptions-item label="Monitor">
        {{ appStore.monitor.enabled ? 'Enabled' : 'Disabled' }} 
        Running: {{ appStore.monitor.running }}
      </el-descriptions-item>
    </el-descriptions>
    <div style="margin-top: 15px; display: flex; gap: 10px;">
      <el-button @click="startMonitor" type="success" :disabled="appStore.monitor.enabled">Start Monitor</el-button>
      <el-button @click="stopMonitor" type="danger" :disabled="!appStore.monitor.enabled">Stop Monitor</el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { startMonitor as apiStart, stopMonitor as apiStop } from '../api/wxwork';
import { onMounted } from 'vue';

const appStore = useAppStore();

const refresh = () => appStore.fetchState();

const startMonitor = async () => {
  try {
    await apiStart();
    refresh();
  } catch (e) {
    console.error(e);
  }
};

const stopMonitor = async () => {
  try {
    await apiStop();
    refresh();
  } catch (e) {
    console.error(e);
  }
};

onMounted(() => {
  refresh();
  // Poll status every 5s
  setInterval(refresh, 5000);
});
</script>
