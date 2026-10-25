"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("quickaiDesktop", {
  isDesktop: true,
  productName: "QuickAI Studio",
  version: "1.0.0",
  platform: process.platform,
  arch: process.arch,
  defaultEngine: "LOCAL_DETERMINISTIC",
});
