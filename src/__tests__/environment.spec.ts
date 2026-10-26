import { expect, it } from 'vitest';
import environment from '../environments/stencil.js';

it.each(['mock-doc', 'jsdom', 'happy-dom'])(
  '%s keeps the native Event constructor usable during setup and after teardown',
  async (domEnvironment) => {
    const target = { Event } as typeof globalThis;
    const { teardown } = await environment.setup(target, { stencil: { domEnvironment } });
    try {
      expect(new target.Event('ready')).toBeInstanceOf(Event);
      expect(target.document.createElement('div').tagName).toBe('DIV');
    } finally {
      await teardown(target);
    }
    expect(target.Event).toBe(Event);
    expect(target).not.toHaveProperty('document');
  },
);
