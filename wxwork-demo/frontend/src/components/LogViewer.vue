<template>
  <el-card>
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Events (Latest 100)</span>
        <el-button size="small" @click="refresh">Refresh</el-button>
      </div>
    </template>
    <div style="height: 400px; overflow-y: auto; background: #f9f9f9; padding: 10px;">
      <div v-if="appStore.events.length === 0">No events yet.</div>
      <div v-for="(event, index) in appStore.events" :key="index" style="margin-bottom: 10px; font-family: monospace; font-size: 12px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px;">
        <div style="color: #409EFF; font-weight: bold;">{{ event.time }} [{{ event.stage }}]</div>
        <pre style="white-space: pre-wrap; word-break: break-all; color: #606266; margin: 5px 0;">{{ JSON.stringify(event, null, 2) }}</pre>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { onMounted } from 'vue';

const appStore = useAppStore();
const refresh = () => appStore.fetchEvents();

onMounted(() => {
  refresh();
  setInterval(refresh, 5000);
});
</script>
