import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('cursadaApi', {
  platform: process.platform,
});
