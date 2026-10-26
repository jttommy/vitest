import '@stencil/vitest';
import '@vitest/browser/matchers';
import { expect, expectTypeOf } from 'vitest';

declare const element: HTMLElement;

expectTypeOf(expect.element(element).toHaveClass('selected')).toEqualTypeOf<Promise<void>>();
expectTypeOf(expect.element(element).toHaveAttribute('role', 'button')).toEqualTypeOf<Promise<void>>();
expectTypeOf(expect.element(element).toHaveTextContent('Selected')).toEqualTypeOf<Promise<void>>();

// @ts-expect-error Stencil class names must be strings.
expect.element(element).toHaveClass(123);
