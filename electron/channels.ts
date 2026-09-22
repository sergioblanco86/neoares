export const IPC_CHANNELS = {
  listDjs: "djs:list",
  saveDj: "djs:save",
  deleteDj: "djs:delete",
  checkConnectivity: "connectivity:check",
  setAudioActive: "runtime:set-audio-active",
  searchSources: "sources:search",
  searchManySources: "sources:search-many",
  inspectSource: "sources:inspect",
  prepareSource: "sources:prepare",
  readSource: "sources:read",
  releaseSource: "sources:release",
  cancelPlaybackSources: "sources:cancel-playback",
} as const;
