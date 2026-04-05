import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function () { this.removeAttribute('open'); };

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
    cleanup();
    server.resetHandlers();
});
afterAll(() => server.close());
