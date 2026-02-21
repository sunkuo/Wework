import api from './index';

export const getHealth = () => api.get('/health');
export const getState = () => api.get('/state');
export const getEvents = () => api.get('/events');

export const initClient = (data: any) => api.post('/init', data);
export const setCallbackUrl = (data: any) => api.post('/set-callback', data);
export const getQrCode = (data: any) => api.post('/get-qrcode', data);
export const automaticLogin = (data: any) => api.post('/automatic-login', data);
export const checkCode = (data: any) => api.post('/check-code', data);
export const refreshRunClient = (data: any) => api.post('/refresh-run-client', data);
export const startMonitor = () => api.post('/monitor/start');
export const stopMonitor = () => api.post('/monitor/stop');
export const sendTextMsg = (data: any) => api.post('/send-text', data);
export const getContacts = (data: any) => api.post('/contacts', data);
