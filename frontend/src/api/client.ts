import { ApiResponse } from './types';

class ApiError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * A generic fetch wrapper for our `{ data, meta, error }` JSON layout API.
 * Returns only the `data` portion of the response directly, throwing on error.
 */
export async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let errBody: ApiResponse<T> | null = null;
    try {
      errBody = await res.json();
    } catch {
      throw new Error(`HTTP error ${res.status}`);
    }

    if (errBody?.error) {
      throw new ApiError(errBody.error.message, errBody.error.code, errBody.error.details);
    }
    throw new Error(`HTTP error ${res.status}`);
  }

  const json: ApiResponse<T> = await res.json();
  
  if (json.error) {
    throw new ApiError(json.error.message, json.error.code, json.error.details);
  }

  if (json.data === null) {
      throw new Error("Response data was unexpectedly null.");
  }

  return json.data;
}

export async function postApi<T>(url: string, body: unknown): Promise<T> {
  return fetchApi<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchApi<T>(url: string, body: unknown): Promise<T> {
  return fetchApi<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * SWR fetcher wrapper to easily use `fetchApi` with `useSWR`
 */
export const swrFetcher = (url: string) => fetchApi<any>(url);

