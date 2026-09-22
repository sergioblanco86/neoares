import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./channels";
import type { DesktopApi, DjProfile, PreparedYouTubeSource, YouTubeSource } from "../src/shared/contracts";

const api: DesktopApi = {
  platform: process.platform,
  connectivity: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.checkConnectivity) as Promise<boolean>,
  },
  runtime: {
    setAudioActive: (active) => ipcRenderer.invoke(IPC_CHANNELS.setAudioActive, active) as Promise<void>,
  },
  djs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listDjs) as Promise<DjProfile[]>,
    save: (profile) => ipcRenderer.invoke(IPC_CHANNELS.saveDj, profile) as Promise<DjProfile>,
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteDj, id) as Promise<void>,
  },
  sources: {
    search: (query, limit, scope) => ipcRenderer.invoke(IPC_CHANNELS.searchSources, query, limit, scope) as Promise<YouTubeSource[]>,
    searchMany: (queries, limitPerQuery, scope) => ipcRenderer.invoke(IPC_CHANNELS.searchManySources, queries, limitPerQuery, scope) as Promise<YouTubeSource[][]>,
    inspect: (url, scope) => ipcRenderer.invoke(IPC_CHANNELS.inspectSource, url, scope) as Promise<YouTubeSource>,
    prepare: (source, scope) => ipcRenderer.invoke(IPC_CHANNELS.prepareSource, source, scope) as Promise<PreparedYouTubeSource>,
    read: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.readSource, leaseId) as Promise<Uint8Array>,
    release: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.releaseSource, leaseId) as Promise<void>,
    cancelPlayback: () => ipcRenderer.invoke(IPC_CHANNELS.cancelPlaybackSources) as Promise<number>,
  },
};

contextBridge.exposeInMainWorld("desktop", api);
