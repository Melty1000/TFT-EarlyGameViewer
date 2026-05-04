import { useEffect } from "react";
import { DotMatrixTestPage } from "./components/DotMatrixTestPage";
import { PanelLayoutDebug } from "./components/PanelLayoutDebug";
import { bindExternalLinks } from "./shell/externalLinks";

export default function App() {
  useEffect(() => bindExternalLinks(), []);

  return (
    <>
      <DotMatrixTestPage />
      {import.meta.env.DEV ? <PanelLayoutDebug /> : null}
    </>
  );
}
