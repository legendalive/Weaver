/* =========================================================
   Weaver — js/utils/text.js
   Step 10: lag-free text engine primitives.
   - Block index: ONE O(n) pass over the raw string producing
     block offsets (numbers, not copied substrings), heading
     levels, and per-block sentence counts.
   - Paging math: accumulate whole blocks until the sentence
     budget is met — never truncates mid-sentence.
   - Splice: replace a mounted block range with edited strings
     without touching the rest of the document.
   - Headings + binary-search offset lookup for Hierarchy/Scribe.
   ========================================================= */

const HEADING_RE = /^(#{1,3})\s+/;

/* Terminal-punctuation count; a non-empty block with no terminal
   punctuation counts as one sentence. Empty blocks count zero. */
export function countSentences(str) {
  if (!str || !str.trim()) return 0;
  const marks = str.match(/[.!?…](?=\s|$)/g);
  return marks ? marks.length : 1;
}

/* Single-pass block indexer.
   Returns array of { s, e, level, sentences } where [s,e) is the
   block's slice of the ORIGINAL string including its trailing
   newline. level: 0 = body, 1-3 = heading ('# ', '## ', '### '). */
export function buildBlockIndex(text) {
  const blocks = [];
  const n = text.length;
  let start = 0;
  while (start <= n) {
    const nl = text.indexOf('\n', start);
    const end = nl === -1 ? n : nl + 1;
    const raw = text.slice(start, end);
    const body = nl === -1 ? raw : raw.slice(0, -1);
    const hm = body.match(HEADING_RE);
    blocks.push({
      s: start,
      e: end,
      level: hm ? hm[1].length : 0,
      sentences: hm ? 0 : countSentences(body),
    });
    if (nl === -1) break;
    start = end;
  }
  return blocks;
}

/* Paging: from block `from`, include whole blocks until the
   sentence budget is filled (always at least one block).
   Returns { end, sentences } — the mounted window [from, end). */
export function windowBounds(blocks, from, maxSentences) {
  let budget = 0;
  let i = from;
  while (i < blocks.length) {
    budget += blocks[i].sentences;
    i++;
    if (budget >= maxSentences) break;
  }
  return { end: i, sentences: budget };
}

/* Raw text of a block range (used by sync, export, Recheck). */
export function blocksToText(text, blocks, from, to) {
  if (to <= from) return '';
  return text.slice(blocks[from].s, blocks[to - 1].e);
}

/* Replace blocks [from,to) with new block strings. Each new block
   receives a trailing newline except the final block when the
   range reaches the document end. Returns the new FULL text. */
export function spliceBlocks(text, blocks, from, to, newBlockStrings) {
  const before = from > 0 ? text.slice(0, blocks[from].s) : '';
  const after = to < blocks.length ? text.slice(blocks[to - 1].e) : '';
  const isDocEnd = to >= blocks.length;
  const mid = newBlockStrings
    .map((s, i) => (isDocEnd && i === newBlockStrings.length - 1 ? s : s + '\n'))
    .join('');
  return before + mid + after;
}

/* Headings for the Hierarchy tree (Step 14). */
export function extractHeadings(text, blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.level) continue;
    let title = text.slice(b.s, b.e).replace(/\n$/, '').replace(HEADING_RE, '');
    if (!title.trim()) title = '(untitled)';
    out.push({ index: i, level: b.level, title });
  }
  return out;
}

/* Binary search: index of the block containing character offset.
   Used by Hierarchy jumps and Scribe highlight bundling. */
export function blockAtOffset(blocks, offset) {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (blocks[mid].s <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function normalizeNewlines(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

export function wordCount(str) {
  const m = str.match(/\S+/g);
  return m ? m.length : 0;
}

/* Toolbar helper (Steps 11-12): the raw prefix for a heading level. */
export function headingPrefix(level) {
  return '#'.repeat(level) + ' ';
}
