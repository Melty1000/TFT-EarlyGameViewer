declare module "jsdom" {
  export class VirtualConsole {
    constructor();
  }

  export class JSDOM {
    constructor(html?: string, options?: { virtualConsole?: VirtualConsole });
    window: Window & typeof globalThis;
  }
}
