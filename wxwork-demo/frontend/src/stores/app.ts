import { defineStore } from 'pinia';
import { getState, getEvents } from '../api/wxwork';

export const useAppStore = defineStore('app', {
  state: () => ({
    active: {
      uuid: '',
      vid: '',
      isLogin: false,
      qrcode: '',
      qrcodeKey: '',
      lastEvent: '',
      lastError: '',
    },
    monitor: {
      enabled: false,
      running: false,
      lastCheckAt: '',
      reconnecting: false,
      intervalMs: 45000
    },
    eventsCount: 0,
    baseUrl: '',
    callbackUrl: '',
    events: [] as any[],
  }),
  actions: {
    async fetchState() {
      try {
        const res: any = await getState();
        this.active = res.active || {};
        this.monitor = res.monitor || {};
        this.eventsCount = res.eventsCount || 0;
        this.baseUrl = res.baseUrl || '';
        this.callbackUrl = res.callbackUrl || '';
      } catch (err) {
        console.error(err);
      }
    },
    async fetchEvents() {
      try {
        const res: any = await getEvents();
        this.events = res.events || [];
      } catch (err) {
        console.error(err);
      }
    }
  }
});
