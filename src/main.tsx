import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { NativeVisualizerApp } from "./visualizer/native/NativeVisualizerApp";
import { I18nProvider } from "./i18n/i18n";
import "./styles/app.css";
import "./styles/full-player.css";

const root = document.getElementById("root");
if (!root) throw new Error("APP_ROOT_MISSING");

createRoot(root).render(
  <StrictMode>
    <I18nProvider nativeVisual={new URLSearchParams(location.search).get("view") === "visualizer"}>{new URLSearchParams(location.search).get("view") === "visualizer" ? <NativeVisualizerApp /> : <App />}</I18nProvider>
  </StrictMode>,
);
