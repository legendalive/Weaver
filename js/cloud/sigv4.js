/* =========================================================
   Weaver — js/cloud/sigv4.js
   v2.0 Stage 3: AWS Signature Version 4 request signing,
   hand-rolled on WebCrypto (no SDK, no npm, no terminal).
   Works with any S3-compatible provider: Backblaze B2,
   Cloudflare R2, AWS S3, MinIO.

   SECURITY: signing happens entirely in the browser. The
   secret key is used only to derive HMAC signatures in
   memory — it is never transmitted or persisted here.

   Requires a secure context (HTTPS) for crypto.subtle.
   GitHub Pages is HTTPS, so this is satisfied.
   ========================================================= */

/* ---------- low-level crypto helpers ---------- */

function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function toBytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data == null) return new Uint8Array(0);
  return new TextEncoder().encode(String(data));
}

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', toBytes(data));
  return toHex(new Uint8Array(hash));
}

async function hmacSha256(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBytes(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, toBytes(message));
  return new Uint8Array(sig);
}

/* ---------- SigV4 URI encoding ----------
   RFC 3986 strict encoding. Unreserved characters pass through.
   encodeSlash=false preserves '/' (canonical URI of S3 paths).
   encodeSlash=true  encodes '/'  (query-string names & values). */
function uriEncode(str, encodeSlash) {
  let result = '';
  const bytes = toBytes(str);
  for (const b of bytes) {
    const isUnreserved =
      (b >= 0x41 && b <= 0x5A) ||  // A-Z
      (b >= 0x61 && b <= 0x7A) ||  // a-z
      (b >= 0x30 && b <= 0x39) ||  // 0-9
      b === 0x2D ||                // -
      b === 0x2E ||                // .
      b === 0x5F ||                // _
      b === 0x7E;                  // ~
    if (isUnreserved) {
      result += String.fromCharCode(b);
    } else if (b === 0x2F && !encodeSlash) {  // '/'
      result += '/';
    } else {
      result += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

/* ---------- canonical query string ----------
   Params sorted by encoded name, then encoded value. */
function canonicalQueryString(searchParams) {
  const entries = [];
  for (const [k, v] of searchParams.entries()) entries.push([k, v]);
  entries.sort((a, b) => {
    const ka = uriEncode(a[0], true);
    const kb = uriEncode(b[0], true);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const va = uriEncode(a[1], true);
    const vb = uriEncode(b[1], true);
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  return entries
    .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
    .join('&');
}

/* ---------- main entry ----------
   Signs an HTTP request and returns the headers to attach.
   The returned set includes authorization, x-amz-date, and
   x-amz-content-sha256 (plus any headers you passed in).
   'host' is signed but NOT returned — the browser sets it. */
export async function signRequest({
  method,
  url,
  headers = {},
  body = null,
  region,
  service = 's3',
  accessKeyId,
  secretAccessKey,
}) {
  const u = new URL(url);

  // Timestamps -> 20240115T123456Z and 20240115
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  // Payload hash (empty-string hash when there is no body)
  const payloadHash = await sha256Hex(body);

  // Normalize headers to lowercase, add the required SigV4 set
  const norm = {};
  for (const [k, v] of Object.entries(headers || {})) {
    norm[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  }
  norm['host'] = u.host;
  norm['x-amz-date'] = amzDate;
  norm['x-amz-content-sha256'] = payloadHash;

  const sortedKeys = Object.keys(norm).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${norm[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  // Canonical URI: the path, single-encoded, slashes preserved
  const canonicalUri = uriEncode(u.pathname, false) || '/';
  const canonicalQuery = canonicalQueryString(u.searchParams);

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // Derive the signing key (4-step HMAC chain)
  const kDate = await hmacSha256('AWS4' + secretAccessKey, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');

  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 ` +
    `Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const out = { ...norm, authorization };
  delete out['host']; // forbidden header; the browser sets Host itself
  return out;
}
