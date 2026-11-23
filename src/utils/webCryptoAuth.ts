const UTF8_ENCODER = new TextEncoder();

function resolveWebCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function generateHexSalt(byteLength = 16): string {
  const cryptoApi = resolveWebCrypto();
  const buf = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(buf);
  return bytesToHex(buf);
}

export function isSha256HashFormat(storedHash: string): boolean {
  return typeof storedHash === 'string' && storedHash.startsWith('sha256:');
}

export async function hashPasswordSha256(
  plain: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const cryptoApi = resolveWebCrypto();
  const resolvedSalt = salt?.trim() || generateHexSalt(16);
  const payload = UTF8_ENCODER.encode(`${resolvedSalt}:${plain}`);
  const digestBuffer = await cryptoApi.subtle.digest('SHA-256', payload);
  const digestHex = bytesToHex(new Uint8Array(digestBuffer));
  return {
    hash: `sha256:${digestHex}`,
    salt: resolvedSalt,
  };
}

export async function verifySha256Password(
  plain: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  if (!plain || !salt || !isSha256HashFormat(storedHash)) {
    return false;
  }
  const expectedHex = storedHash.slice('sha256:'.length).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHex)) {
    return false;
  }
  const { hash } = await hashPasswordSha256(plain, salt);
  const actualHex = hash.slice('sha256:'.length);
  if (actualHex.length !== expectedHex.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
