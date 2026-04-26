import { ApiResponse } from './types';

export class ApiError extends Error {
  public code: string;
  public details?: any;
  public status: number;

  constructor(message: string, code: string, details?: any, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
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
    let errBody: any = null;
    try {
      errBody = await res.json();
    } catch {
      throw new ApiError(`HTTP error ${res.status}`, `HTTP_${res.status}`, null, res.status);
    }

    if (errBody?.error) {
      throw new ApiError(
        errBody.error.message ?? `HTTP error ${res.status}`,
        errBody.error.code ?? `HTTP_${res.status}`,
        errBody.error.details ?? errBody,
        res.status,
      );
    }
    if (typeof errBody?.message === 'string') {
      throw new ApiError(
        errBody.message,
        typeof errBody?.code === 'string' ? errBody.code : `HTTP_${res.status}`,
        errBody,
        res.status,
      );
    }
    throw new ApiError(`HTTP error ${res.status}`, `HTTP_${res.status}`, errBody, res.status);
  }

  const json: ApiResponse<T> = await res.json();
  
  if (json.error) {
    throw new ApiError(json.error.message, json.error.code, json.error.details, res.status);
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

