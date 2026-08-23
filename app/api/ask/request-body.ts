export const ASK_BODY_LIMIT_BYTES = 48_000;

export async function readBoundedRequestBody(
  request: Request,
  limit = ASK_BODY_LIMIT_BYTES,
): Promise<ArrayBuffer | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength.trim())) return rejectRequestBody(request);
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > limit) return rejectRequestBody(request);
  }

  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > limit) {
        await reader.cancel(new DOMException("Request body exceeds the limit", "QuotaExceededError"));
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function rejectRequestBody(request: Request): Promise<null> {
  try {
    await request.body?.cancel(new DOMException("Request body exceeds the limit", "QuotaExceededError"));
  } catch {
    // The request may already have been aborted by the caller.
  }
  return null;
}
