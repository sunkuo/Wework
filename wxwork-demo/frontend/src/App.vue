<template>
  <div class="app-container">
    <header>
      <h1>WxWork Demo (Vue 3 + NestJS)</h1>
    </header>
    <main>
      <Dashboard />
    </main>
  </div>
</template>

<script setup lang="ts">
import Dashboard from './views/Dashboard.vue';
</script>

<style>
body { 
  margin: 0; 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
  background: #f5f7fa; 
}
.app-container { 
  max-width: 1200px; 
  margin: 0 auto; 
  padding: 20px; 
}
header h1 { 
  text-align: center; 
  color: #303133; 
  margin-bottom: 30px; 
}
</style>
