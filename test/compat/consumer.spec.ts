// @vitest-environment stencil

import { render } from '@stencil/vitest';
import { expect, it } from 'vitest';

it('renders with the published environment and matchers', async () => {
  const { root } = await render('<button class="selected">Ready</button>');
  expect(root).toHaveClass('selected');
  await expect(Promise.resolve(root)).resolves.toHaveTextContent('Ready');
  expect(new Event('ready')).toBeInstanceOf(Event);
});
