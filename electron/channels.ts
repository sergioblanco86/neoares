export const IPC_CHANNELS = {
  listDjs: "djs:list",
  saveDj: "djs:save",
  deleteDj: "djs:delete",
  checkConnectivity: "connectivity:check",
  searchSources: "sources:search",
  searchManySources: "sources:search-many",
  inspectSource: "sources:inspect",
  prepareSource: "sources:prepare",
  readSource: "sources:read",
  releaseSource: "sources:release",
} as const;
