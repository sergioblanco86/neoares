import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./channels";
import type { DesktopApi, DjProfile, PreparedYouTubeSource, YouTubeSource } from "../src/shared/contracts";

const api: DesktopApi = {
  platform: process.platform,
  connectivity: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.checkConnectivity) as Promise<boolean>,
  },
  djs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listDjs) as Promise<DjProfile[]>,
    save: (profile) => ipcRenderer.invoke(IPC_CHANNELS.saveDj, profile) as Promise<DjProfile>,
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteDj, id) as Promise<void>,
  },
  sources: {
    search: (query, limit) => ipcRenderer.invoke(IPC_CHANNELS.searchSources, query, limit) as Promise<YouTubeSource[]>,
    searchMany: (queries, limitPerQuery) => ipcRenderer.invoke(IPC_CHANNELS.searchManySources, queries, limitPerQuery) as Promise<YouTubeSource[][]>,
    inspect: (url) => ipcRenderer.invoke(IPC_CHANNELS.inspectSource, url) as Promise<YouTubeSource>,
    prepare: (source) => ipcRenderer.invoke(IPC_CHANNELS.prepareSource, source) as Promise<PreparedYouTubeSource>,
    read: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.readSource, leaseId) as Promise<Uint8Array>,
    release: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.releaseSource, leaseId) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("desktop", api);
