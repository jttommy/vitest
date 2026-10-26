import '@stencil/vitest';
import environment from '@stencil/vitest/vitest';
import { expect, expectTypeOf, type WorkerGlobalState } from 'vitest';

declare const element: HTMLElement;

expectTypeOf(expect(element).toHaveClass('selected')).toEqualTypeOf<void>();
expectTypeOf(expect(Promise.resolve(element)).resolves.toHaveClass('selected')).toEqualTypeOf<Promise<void>>();
expectTypeOf(expect(Promise.reject(element)).rejects.toHaveClass('selected')).toEqualTypeOf<Promise<void>>();
expect(element).toEqual(expect.toHaveClass('selected'));
expect(element).toEqual(expect.toHaveProperty('title', 'Selected'));
expect(element).toEqual(expect.not.toHaveProperty('hidden', true));

// @ts-expect-error Class names must be strings.
expect(element).toHaveClass(123);

expectTypeOf(environment.setup).toBeFunction();
const customEnvironment: WorkerGlobalState['environment'] = { ...environment, name: 'custom-stencil' };
expectTypeOf(customEnvironment.setup).toBeFunction();
