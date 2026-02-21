import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'

// Explicitly remove any existing styles
const styleEl = document.getElementById('vite-legacy-styles');
if (styleEl) styleEl.remove();

const app = createApp(App)

app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')
