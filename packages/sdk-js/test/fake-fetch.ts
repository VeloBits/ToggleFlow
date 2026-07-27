/** Deterministic fetch stub: swap the handler mid-test, inspect every call. */

export interface RecordedCall {
  url: string;
  headers: Headers;
}

export type FetchHandler = (url: string) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
  setHandler(handler: FetchHandler): void;
}

export function createFakeFetch(initial: FetchHandler): FakeFetch {
  const calls: RecordedCall[] = [];
  let handler = initial;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    return handler(url);
  }) as typeof globalThis.fetch;
  return {
    fetch: fetchImpl,
    calls,
    setHandler(next) {
      handler = next;
    },
  };
}

export const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const notModified = (): Response => new Response(null, { status: 304 });

export const hangForever = (): Promise<Response> => new Promise<Response>(() => {});
