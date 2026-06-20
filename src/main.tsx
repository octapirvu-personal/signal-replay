import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { Splash } from "./ui/Splash";
import "./index.css";

// No StrictMode: the chart engine is an imperative singleton created in an
// effect; double-invocation in dev would needlessly tear it down and rebuild.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Splash />
  </>,
);
