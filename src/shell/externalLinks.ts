import { getWindowShell } from "./windowControls";

function isHttpUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://");
}

export function bindExternalLinks(root: Document = document) {
  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target !== "_blank" || !isHttpUrl(anchor.href)) return;

    const shell = getWindowShell();
    if (!shell) return;

    event.preventDefault();
    void shell.openExternal(anchor.href);
  };

  root.addEventListener("click", handleClick);

  return () => {
    root.removeEventListener("click", handleClick);
  };
}
