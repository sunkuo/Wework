<template>
  <el-row :gutter="20">
    <el-col :span="12">
      <LoginPanel />
      <div style="margin-top: 20px"></div>
      <BusinessPanel />
    </el-col>
    <el-col :span="12">
      <StatusPanel />
      <div style="margin-top: 20px"></div>
      <LogViewer />
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import LoginPanel from '../components/LoginPanel.vue';
import BusinessPanel from '../components/BusinessPanel.vue';
import LogViewer from '../components/LogViewer.vue';
import StatusPanel from '../components/StatusPanel.vue';
</script>
