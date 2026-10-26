// The fixture also contains a Node test without a DOM.
if (typeof window !== 'undefined') {
  await import('./dist/test-components-env-comments/test-components-env-comments.esm.js');
}

export {};
