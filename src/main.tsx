import { StrictMode } from "react";

import { App } from "./app/App";
import { startPwaLifecycle } from "./app/pwa-status";
import { QctpProvider } from "./app/QctpProvider";
import "./app/styles.css";
import { mountQctpApplication } from "./startup/mount-qctp";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("QCTP root element is missing.");

mountQctpApplication({
  container: root,
  startPwaLifecycle,
  application: (
    <StrictMode>
      <QctpProvider>
        <App />
      </QctpProvider>
    </StrictMode>
  ),
});
