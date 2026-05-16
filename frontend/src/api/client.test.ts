import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApi, fetchApi, postApi } from './client';

function successResponse(data: unknown) {
  return new Response(JSON.stringify({ data, meta: null, error: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send JSON content-type for bodyless DELETE requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => successResponse({ deleted: true }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteApi('/api/watchlist-items/item-1');

    const init = fetchMock.mock.calls[0][1] ?? {};
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('does not send JSON content-type for bodyless GET requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => successResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchApi('/api/home');

    const init = fetchMock.mock.calls[0][1] ?? {};
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('keeps JSON content-type for JSON body requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => successResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await postApi('/api/watchlist-items', { symbol_code: '7203' });

    const init = fetchMock.mock.calls[0][1] ?? {};
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ symbol_code: '7203' }));
  });
});
