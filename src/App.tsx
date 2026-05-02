import { DotMatrixTestPage } from "./components/DotMatrixTestPage";
import { PanelLayoutDebug } from "./components/PanelLayoutDebug";

export default function App() {
  return (
    <>
      <DotMatrixTestPage />
      {import.meta.env.DEV ? <PanelLayoutDebug /> : null}
    </>
  );
}
