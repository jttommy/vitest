import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { WorkerGlobalState } from 'vitest';
import type { EnvironmentStencil } from './types.js';
import happyDom from './env/happy-dom.js';
import jsdom from './env/jsdom.js';
import mockDoc from './env/mock-doc.js';

// WorkerGlobalState exposes Environment from the same entry point in Vitest 2–5.
type Environment = WorkerGlobalState['environment'];

const require = createRequire(import.meta.url);

// Vitest 4 replaced `transformMode` with `viteEnvironment` and warns when the old field is still set.
const vitestMajor = Number.parseInt(require('vitest/package.json').version, 10);
const environmentOptions = vitestMajor >= 4 ? { viteEnvironment: 'ssr' as const } : { transformMode: 'ssr' as const };

// populateGlobal lives in vitest/runtime from Vitest 4.1 and in vitest/environments before that (removed in Vitest 5).
// The specifiers are variables because Vite fails to analyze an entry the installed Vitest lacks.
// The file URL is a fallback for Vitest 5 on Windows, whose two module runners each mishandle one form:
// the one that loads environments rejects the URL, and the one that runs test code (where this module
// ends up when it is imported directly) resolves the bare specifier against the cwd.
async function getPopulateGlobal() {
  let error: unknown;
  for (const entry of ['vitest/runtime', 'vitest/environments']) {
    let resolved: string;
    try {
      resolved = require.resolve(entry);
    } catch {
      continue;
    }
    for (const specifier of [entry, pathToFileURL(resolved).href]) {
      try {
        return (await import(/* @vite-ignore */ specifier)).populateGlobal;
      } catch (e) {
        error ??= e;
      }
    }
  }
  throw new Error('@stencil/vitest: could not load populateGlobal from the installed version of vitest', {
    cause: error,
  });
}

export interface StencilEnvironmentOptions {
  /**
   * The DOM environment to use for testing
   * @default 'mock-doc'
   */
  domEnvironment?: 'mock-doc' | 'happy-dom' | 'jsdom';
}

const environmentMap: Record<string, EnvironmentStencil> = {
  'happy-dom': happyDom,
  jsdom: jsdom,
  'mock-doc': mockDoc,
};

/**
 * Custom Vitest environment for Stencil component testing
 *
 * Usage in vitest.config.ts:
 * ```ts
 * export default defineConfig({
 *   test: {
 *     environment: 'stencil',
 *     environmentOptions: {
 *       stencil: {
 *         domEnvironment: 'mock-doc' // or 'happy-dom' or 'jsdom'
 *       }
 *     }
 *   }
 * })
 * ```
 */
const environment: Environment = {
  name: 'stencil',
  ...environmentOptions,

  async setup(global, options) {
    const { stencil = {} } = options as { stencil?: StencilEnvironmentOptions };
    const domEnvironment = stencil.domEnvironment || 'mock-doc';

    const environment = environmentMap[domEnvironment] || environmentMap['mock-doc'];

    if (!environment) {
      throw new Error(`Unknown domEnvironment: ${domEnvironment}. Must be 'mock-doc', 'happy-dom', or 'jsdom'`);
    }

    // Setup the environment and get the window
    const { window: win, teardown: envTeardown } = await environment(global, options);

    // Stub globals on global before populateGlobal to prevent Node's undici from loading.
    // When populateGlobal accesses these globals, Node lazily loads them from undici,
    // which has a bug in Node 20.x where WebSocket extends undefined EventTarget.
    // By pre-stubbing these with the window's versions, we prevent the undici load.
    const globalsToStub = ['MessageEvent', 'FormData', 'Headers', 'Request', 'Response', 'WebSocket'];
    for (const key of globalsToStub) {
      if (!(global as any)[key] && (win as any)[key]) {
        Object.defineProperty(global, key, {
          value: (win as any)[key],
          writable: true,
          configurable: true,
        });
      }
    }

    // Set NODE_ENV to test if not already set
    if (!win.process?.env) {
      (win as any).process = { env: {} };
    }
    if (!win.process.env.NODE_ENV) {
      win.process.env.NODE_ENV = 'test';
    }

    // Vitest 2–4 store values in originals; Vitest 5 stores descriptors.
    // Capture descriptors ourselves so both preserve the native globals.
    const originalDescriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(global);
    const restoreGlobal = (key: string | symbol) => {
      const descriptor = originalDescriptors[key];
      if (descriptor) Object.defineProperty(global, key, descriptor);
    };

    // Populate global with window properties
    const populateGlobal = await getPopulateGlobal();
    const { keys, originals } = populateGlobal(global, win, {
      bindFunctions: true,
    });

    // Restore Node's native Event constructor (chai needs this)
    // CustomEvent can stay as mock-doc's version since it's needed for event creation
    if (originals.has('Event')) {
      restoreGlobal('Event');
    }

    // Create HTMLElement wrapper that captures ownerDocument
    // In Stencil 4.43+, win.HTMLElement returns MockHTMLElement directly which expects
    // ownerDocument as the first constructor arg. But Stencil-compiled components call
    // super() with no args (standard browser behavior). This wrapper bridges the gap.
    const MockHTMLElementBase = (global as any).HTMLElement;
    const doc = win.document;
    const HTMLElement = class extends MockHTMLElementBase {
      constructor() {
        super(doc, '');
        const observedAttributes = (this.constructor as any).observedAttributes;
        if (Array.isArray(observedAttributes) && typeof (this as any).attributeChangedCallback === 'function') {
          observedAttributes.forEach((attrName: string) => {
            const attrValue = this.getAttribute(attrName);
            if (attrValue != null) {
              (this as any).attributeChangedCallback(attrName, null, attrValue);
            }
          });
        }
      }
    };
    Object.defineProperty(global, 'HTMLElement', { value: HTMLElement, writable: true, configurable: true });

    // Remove undefined properties that shadow native globals
    keys.forEach((key) => {
      if ((global as any)[key] === undefined && originals.has(key)) {
        restoreGlobal(key);
      }
    });

    return {
      teardown(global) {
        // Teardown the environment first (e.g., window.close())
        // This needs to happen while globals are still populated
        // because disconnectedCallback may use RAF and other polyfills
        envTeardown();

        // Then clean up populated globals
        keys.forEach((key) => delete (global as any)[key]);
        originals.forEach((_, key) => restoreGlobal(key));
      },
    };
  },
};

export default environment;
