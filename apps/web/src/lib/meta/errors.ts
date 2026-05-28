export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly traceId?: string
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function isTokenExpiredError(err: unknown): boolean {
  if (err instanceof MetaApiError) {
    // código 190 = token inválido/expirado
    return err.code === 190;
  }
  return false;
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof MetaApiError) {
    return err.code === 1 || err.code === 2 || err.code === 4;
  }
  return false;
}

export async function parseMetaError(res: Response): Promise<MetaApiError> {
  const traceId = res.headers.get("x-fb-trace-id") ?? undefined;
  try {
    const body = await res.json();
    const e = body?.error;
    return new MetaApiError(
      e?.message ?? `Meta API error ${res.status}`,
      e?.code,
      e?.error_subcode,
      traceId
    );
  } catch {
    return new MetaApiError(`Meta API error ${res.status}`, undefined, undefined, traceId);
  }
}
