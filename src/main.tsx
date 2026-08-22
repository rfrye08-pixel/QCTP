import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import { QctpProvider } from "./app/QctpProvider";
import "./app/styles.css";

registerSW({ immediate: true });

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("QCTP root element is missing.");

createRoot(root).render(
  <StrictMode>
    <QctpProvider>
      <App />
    </QctpProvider>
  </StrictMode>,
);
