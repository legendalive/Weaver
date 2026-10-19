/* =========================================================
   Weaver — js/cloud/s3.js
   v2.0 Stage 3: minimal S3-compatible object client built
   on sigv4.js. Operations: list / get / put / delete / head,
   plus an anonymous public-bucket probe.

   Provider-agnostic (Backblaze B2, Cloudflare R2, AWS S3).
   Uses path-style URLs: https://<endpoint>/<bucket>/<key>.

   NOTE — object keys must be URL-safe. Weaver's keys
   (weaver/index.json, weaver/projects/<uuid>.json,
   weaver/series/<uuid>.json) always are.

   CORS — the bucket MUST allow the GitHub Pages origin for
   GET/PUT/DELETE/HEAD, or the browser blocks every request.
   ========================================================= */

import { signRequest } from './sigv4.js';

export class S3Error extends Error {
  constructor(status, code, message, method, key) {
    super(message || `S3 ${method} "${key}" failed (${status} ${code})`);
    this.name = 'S3Error';
    this.status = status;
    this.code = code;
    this.method = method;
    this.key = key;
  }
}

/* Parse an S3/B2 XML error body into { code, message }. */
function parseErrorXml(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const code = doc.getElementsByTagNameNS('*', 'Code')[0]?.textContent || '';
    const message = doc.getElementsByTagNameNS('*', 'Message')[0]?.textContent || '';
    return { code: code.trim(), message: message.trim() };
  } catch {
    return { code: '', message: '' };
  }
}

/* Derive the region from a Backblaze endpoint when possible. */
function parseRegionFromEndpoint(endpoint) {
  const m = String(endpoint).match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
  return m ? m[1] : null;
}

/* Build a query string whose encoding matches SigV4 expectations. */
function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export class S3Client {
  constructor({ endpoint, bucket, accessKeyId, secretAccessKey, region = null }) {
    let ep = String(endpoint || '').trim().replace(/\/+$/, '');
    if (ep && !/^https?:\/\//i.test(ep)) ep = 'https://' + ep;
    this.endpoint = ep;
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region || parseRegionFromEndpoint(ep);

    if (!this.endpoint || !this.bucket || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('S3Client requires endpoint, bucket, accessKeyId, and secretAccessKey.');
    }
    if (!this.region) {
      throw new Error('Could not determine the storage region from the endpoint. Provide "region" explicitly.');
    }
  }

  /* path-style URL: endpoint/bucket[/key][?query] */
  buildUrl(key, queryString = '') {
    const path = key ? `/${this.bucket}/${key}` : `/${this.bucket}`;
    const q = queryString ? `?${queryString}` : '';
    return `${this.endpoint}${path}${q}`;
  }

  /* Signed request. Returns { status, body } with body as text. */
  async request(method, key, queryString = '', body = null) {
    const url = this.buildUrl(key, queryString);
    const headers = {};
    if (body != null) headers['content-type'] = 'application/json';

    const signed = await signRequest({
      method, url, headers, body,
      region: this.region,
      service: 's3',
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: signed,
        body: body != null ? body : undefined,
      });
    } catch (e) {
      throw new S3Error(0, 'NetworkError',
        'Could not reach cloud storage. This is usually a missing CORS rule on the bucket, or no internet connection.',
        method, key);
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const { code, message } = parseErrorXml(text);
      throw new S3Error(res.status, code || `HTTP${res.status}`, message, method, key);
    }
    return { status: res.status, body: text };
  }

  /* List object keys under a prefix (handles pagination). */
  async list(prefix = '') {
    const keys = [];
    let continuationToken = null;
    do {
      const params = { 'list-type': '2', 'max-keys': '1000' };
      if (prefix) params['prefix'] = prefix;
      if (continuationToken) params['continuation-token'] = continuationToken;
      const { body: xml } = await this.request('GET', '', buildQuery(params));

      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const contents = doc.getElementsByTagNameNS('*', 'Contents');
      for (const c of contents) {
        const keyEl = c.getElementsByTagNameNS('*', 'Key')[0];
        if (keyEl && keyEl.textContent) keys.push(keyEl.textContent);
      }
      const isTruncated =
        doc.getElementsByTagNameNS('*', 'IsTruncated')[0]?.textContent === 'true';
      continuationToken = isTruncated
        ? (doc.getElementsByTagNameNS('*', 'NextContinuationToken')[0]?.textContent || null)
        : null;
    } while (continuationToken);
    return keys;
  }

  /* Get an object's body as text. Throws S3Error (status 404 if absent). */
  async get(key) {
    const { body } = await this.request('GET', key);
    return body;
  }

  /* Get an object, or null if it does not exist. */
  async getOrNull(key) {
    try {
      return await this.get(key);
    } catch (e) {
      if (e instanceof S3Error && e.status === 404) return null;
      throw e;
    }
  }

  /* Get an object parsed as JSON, or null if it does not exist. */
  async getJsonOrNull(key) {
    const raw = await this.getOrNull(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  }

  /* Put (create/overwrite) an object from a JSON string. */
  async put(key, jsonString) {
    await this.request('PUT', key, '', jsonString);
  }

  /* Delete an object. Missing keys are treated as success (idempotent). */
  async del(key) {
    try {
      await this.request('DELETE', key);
    } catch (e) {
      if (e instanceof S3Error && e.status === 404) return; // already gone
      throw e;
    }
  }

  /* Does the object exist? */
  async head(key) {
    try {
      await this.request('HEAD', key);
      return true;
    } catch (e) {
      if (e instanceof S3Error && e.status === 404) return false;
      throw e;
    }
  }

  /* Best-effort public-bucket probe (mirrors v1 "refuse public repos").
     Makes an ANONYMOUS (unsigned) list request.
     Returns true  = bucket is publicly readable (we refuse to use it),
             false = bucket is private (good),
             null  = could not determine (CORS/network). */
  async isBucketPublic() {
    try {
      const url = this.buildUrl('', buildQuery({ 'list-type': '2', 'max-keys': '1' }));
      const res = await fetch(url, { method: 'GET' }); // deliberately unsigned
      if (res.ok) return true;
      if (res.status === 403 || res.status === 401) return false;
      return null;
    } catch {
      return null;
    }
  }
}
