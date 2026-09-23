import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./channels";
import type { AppState, CacheCleanupResult, CachePolicy, CacheStats, DesktopApi, DjProfile, LoudnessAnalysis, PreparedYouTubeSource, SessionSnapshot, SupportedLocale, YouTubeSource } from "../src/shared/contracts";

const api: DesktopApi = {
  platform: process.platform,
  locale: {
    getPreferredLanguages: () => ipcRenderer.invoke(IPC_CHANNELS.getPreferredLanguages) as Promise<string[]>,
    apply: (locale: SupportedLocale) => ipcRenderer.invoke(IPC_CHANNELS.applyLocale, locale) as Promise<void>,
  },
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
  appState: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.loadAppState) as Promise<AppState>,
    save: (state) => ipcRenderer.invoke(IPC_CHANNELS.saveAppState, state) as Promise<void>,
  },
  sessions: {
    loadActive: () => ipcRenderer.invoke(IPC_CHANNELS.loadActiveSession) as Promise<SessionSnapshot | null>,
    saveActive: (snapshot) => ipcRenderer.invoke(IPC_CHANNELS.saveActiveSession, snapshot) as Promise<void>,
    clearActive: () => ipcRenderer.invoke(IPC_CHANNELS.clearActiveSession) as Promise<void>,
  },
  cache: {
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.getCacheStats) as Promise<CacheStats>,
    getPolicy: () => ipcRenderer.invoke(IPC_CHANNELS.getCachePolicy) as Promise<CachePolicy>,
    savePolicy: (policy) => ipcRenderer.invoke(IPC_CHANNELS.saveCachePolicy, policy) as Promise<void>,
    cleanup: () => ipcRenderer.invoke(IPC_CHANNELS.cleanupCache) as Promise<CacheCleanupResult>,
    clearUnused: () => ipcRenderer.invoke(IPC_CHANNELS.clearUnusedCache) as Promise<CacheCleanupResult>,
    protect: (sourceIds) => ipcRenderer.invoke(IPC_CHANNELS.protectCacheSources, sourceIds) as Promise<void>,
    getLoudness: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.getCachedLoudness, sourceId) as Promise<LoudnessAnalysis | null>,
    saveLoudness: (sourceId, analysis) => ipcRenderer.invoke(IPC_CHANNELS.saveCachedLoudness, sourceId, analysis) as Promise<void>,
  },
  sources: {
    search: (query, limit, scope) => ipcRenderer.invoke(IPC_CHANNELS.searchSources, query, limit, scope) as Promise<YouTubeSource[]>,
    searchMany: (queries, limitPerQuery, scope) => ipcRenderer.invoke(IPC_CHANNELS.searchManySources, queries, limitPerQuery, scope) as Promise<YouTubeSource[][]>,
    searchMusicMany: (queries, limitPerQuery, scope) => ipcRenderer.invoke(IPC_CHANNELS.searchManyMusicSources, queries, limitPerQuery, scope) as Promise<YouTubeSource[][]>,
    inspect: (url, scope) => ipcRenderer.invoke(IPC_CHANNELS.inspectSource, url, scope) as Promise<YouTubeSource>,
    prepare: (source, scope) => ipcRenderer.invoke(IPC_CHANNELS.prepareSource, source, scope) as Promise<PreparedYouTubeSource>,
    read: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.readSource, leaseId) as Promise<Uint8Array>,
    release: (leaseId) => ipcRenderer.invoke(IPC_CHANNELS.releaseSource, leaseId) as Promise<void>,
    cancelPlayback: () => ipcRenderer.invoke(IPC_CHANNELS.cancelPlaybackSources) as Promise<number>,
  },
};

contextBridge.exposeInMainWorld("desktop", api);
