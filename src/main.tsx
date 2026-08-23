import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { startPwaLifecycle } from "./app/pwa-status";
import { QctpProvider } from "./app/QctpProvider";
import "./app/styles.css";

startPwaLifecycle();

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("QCTP root element is missing.");

createRoot(root).render(
  <StrictMode>
    <QctpProvider>
      <App />
    </QctpProvider>
  </StrictMode>,
);
