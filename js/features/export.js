/* =========================================================
Weaver — js/features/export.js
v2 Stage 6.7 + V3.9: Export ALWAYS produces BOTH files.
Main Novel -> real .docx (blank doc if the novel is empty).
Config Bible -> readable .txt.
Neither file is ever silently omitted.
V3.9: EPUB export (Pro) — market-ready .epub built entirely
client-side: title page, chapters, nav + NCX table of
contents, book CSS. Free accounts get a Pro notice instead.
========================================================= */
import { getState } from '../core/state.js';
import { getEffectiveConfig } from '../core/storage.js';
import { buildBlockIndex, headingPrefix } from '../utils/text.js';
import { buildDocx } from '../utils/docx.js';
import { buildZip } from '../utils/zip.js';
import { toast } from '../utils/dom.js';
import { isPro } from '../core/entitlements.js';

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(filename, blob);
}
function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  triggerDownload(filename, blob);
}
function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProject() {
  const project = getState().project;
  if (!project) {
    toast('No active project to export.', 'danger');
    return;
  }
  const safeName = (project.name || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  /* ----- Main Novel as DOCX (always built) ----- */
  const novelText = project.mainNovel.text || '';
  const idx = buildBlockIndex(novelText);
  const blocks = idx.map((b) => {
    const raw = novelText.slice(b.s, b.e).replace(/\n$/, '');
    return { level: b.level, text: b.level ? raw.slice(headingPrefix(b.level).length) : raw };
  });
  const docx = buildDocx(blocks.length ? blocks : [{ level: 0, text: '' }]);
  /* ----- Config Bible as TXT (always built) ----- */
  const cfg = getEffectiveConfig(project);
  let bibleText = `# Project Bible: ${project.name}\n`;
  if (project.seriesName) bibleText += `Series: ${project.seriesName}\n`;
  bibleText += `Exported: ${new Date().toLocaleString()}\n\n`;
  const sections = [
    { key: 'characters', label: 'Characters' },
    { key: 'settings', label: 'Settings & Places' },
    { key: 'plotArcs', label: 'Plot Arcs' },
    { key: 'worldRules', label: 'World Rules & Physics' },
    { key: 'items', label: 'Item Catalog' },
  ];
  for (const sec of sections) {
    bibleText += `## ${sec.label}\n\n`;
    const entries = cfg[sec.key] || [];
    if (!entries.length) bibleText += `(No entries)\n\n`;
    else for (const e of entries) bibleText += `### ${e.name || '(Unnamed)'}\n${e.body || ''}\n\n`;
  }
  bibleText += `## General Prose\n\n${cfg.generalProse || '(Empty)'}\n\n`;
  bibleText += `## General AI Instructions\n\n${cfg.generalAiInstructions || '(Empty)'}\n\n`;
  /* ----- Downloads: BOTH files, always ----- */
  downloadBlob(
    `${safeName}_main_novel.docx`,
    docx,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  setTimeout(() => downloadFile(`${safeName}_config_bible.txt`, bibleText), 600);
  toast(
    novelText.trim()
      ? 'Exporting Main Novel (.docx) and Config Bible (.txt)…'
      : 'Main Novel is empty — exported it blank, plus the Config Bible.',
    'success'
  );
}

/* =========================================================
EPUB (Pro)
========================================================= */
function escXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function novelBlocks() {
  const project = getState().project;
  const novelText = (project && project.mainNovel && project.mainNovel.text) || '';
  const idx = buildBlockIndex(novelText);
  return idx.map((b) => {
    const raw = novelText.slice(b.s, b.e).replace(/\n$/, '');
    return { level: b.level, text: b.level ? raw.slice(headingPrefix(b.level).length) : raw };
  });
}
/* Chapters = level-1 headings. If the book has none, level-2
headings become chapters. If it has neither, one whole book. */
function chaptersFrom(blocks, fallbackTitle) {
  const make = (title) => ({ title: title || fallbackTitle, html: [] });
  let chapters = [];
  let cur = null;
  const pushBody = (b) => {
    if (b.level === 2) { cur.html.push(`<h2>${escXml(b.text)}</h2>`); return; }
    if (b.level >= 3) { cur.html.push(`<h3>${escXml(b.text)}</h3>`); return; }
    const t = (b.text || '').trim();
    if (!t) return;
    if (/^(\*{3,}|-{3,}|\* \* \*)$/.test(t)) cur.html.push('<p class="scene">* * *</p>');
    else cur.html.push(`<p>${escXml(t)}</p>`);
  };
  for (const b of blocks) {
    if (b.level === 1) { cur = make((b.text || '').trim() || `Chapter ${chapters.length + 1}`); chapters.push(cur); continue; }
    if (!cur) { cur = make(fallbackTitle); chapters.push(cur); }
    pushBody(b);
  }
  const noH1 = chapters.length === 1 && chapters[0].title === fallbackTitle;
  if (noH1 && blocks.some((b) => b.level === 2)) {
    chapters = []; cur = null;
    for (const b of blocks) {
      if (b.level === 2) { cur = make((b.text || '').trim() || `Chapter ${chapters.length + 1}`); chapters.push(cur); continue; }
      if (!cur) { cur = make(fallbackTitle); chapters.push(cur); }
      if (b.level === 1) { cur.html.push(`<h1>${escXml(b.text)}</h1>`); continue; }
      pushBody(b);
    }
  }
  if (!chapters.length) chapters = [make(fallbackTitle)];
  return chapters;
}
const XHTML_HEAD = (title) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">\n<head><title>${escXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n`;

export function exportEpub() {
  const project = getState().project;
  if (!project) { toast('No active project to export.', 'danger'); return; }
  if (!isPro()) {
    toast('EPUB export is a Pro feature. Upgrade from Settings → Account, or use Export for .docx + .txt.', 'info');
    return;
  }
  const blocks = novelBlocks();
  if (!blocks.some((b) => (b.text || '').trim())) {
    toast('Main Novel is empty — write or finalize chapters before exporting EPUB.', 'info');
    return;
  }
  let saved = '';
  try { saved = localStorage.getItem('weaver_epub_author') || ''; } catch (e) { /* private mode */ }
  const answer = prompt('Author name for the title page:', saved);
  if (answer === null) return;
  const author = answer.trim() || 'Anonymous';
  try { localStorage.setItem('weaver_epub_author', author); } catch (e) { /* private mode */ }

  const bookTitle = project.bookTitle || project.name || 'Untitled';
  const series = project.seriesName || '';
  const uid = 'urn:uuid:' + (project.id || 'weaver-book');
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const chapters = chaptersFrom(blocks, bookTitle);
  const enc = new TextEncoder();
  const files = [];

  files.push({ name: 'mimetype', bytes: enc.encode('application/epub+zip') });
  files.push({ name: 'META-INF/container.xml', bytes: enc.encode(
    `<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n`) });

  const css = `body{font-family:Georgia,'Times New Roman',serif;line-height:1.5;margin:1em;}\nh1{page-break-before:always;text-align:center;font-size:1.4em;margin:2em 0 1em;}\nh2{font-size:1.15em;margin:1.5em 0 .5em;}\nh3{font-size:1em;margin:1.2em 0 .4em;}\np{margin:0 0 .7em;}\np.scene{text-align:center;letter-spacing:.5em;margin:1.2em 0;}\n.titlepage{text-align:center;margin-top:3em;}\n.titlepage h1{page-break-before:none;margin-top:0;font-size:1.8em;}\n.titlepage .series{font-style:italic;}\n.titlepage .author{margin-top:2em;}\n`;
  files.push({ name: 'OEBPS/style.css', bytes: enc.encode(css) });

  const titlePage = XHTML_HEAD(bookTitle) +
    `<div class="titlepage">\n<h1>${escXml(bookTitle)}</h1>\n` +
    (series ? `<p class="series">${escXml(series)}</p>\n` : '') +
    `<p class="author">${escXml(author)}</p>\n</div>\n</body>\n</html>\n`;
  files.push({ name: 'OEBPS/title.xhtml', bytes: enc.encode(titlePage) });

  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
  ];
  const spine = [`<itemref idref="title"/>`];
  const navItems = [`<li><a href="title.xhtml">Title page</a></li>`];
  const ncxPoints = [`<navPoint id="np0" playOrder="1"><navLabel><text>Title page</text></navLabel><content src="title.xhtml"/></navPoint>`];

  chapters.forEach((ch, i) => {
    const href = `chapter${i + 1}.xhtml`;
    const id = `c${i + 1}`;
    const xhtml = XHTML_HEAD(ch.title) + `<h1>${escXml(ch.title)}</h1>\n${ch.html.join('\n')}\n</body>\n</html>\n`;
    files.push({ name: 'OEBPS/' + href, bytes: enc.encode(xhtml) });
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    navItems.push(`<li><a href="${href}">${escXml(ch.title)}</a></li>`);
    ncxPoints.push(`<navPoint id="np${i + 1}" playOrder="${i + 2}"><navLabel><text>${escXml(ch.title)}</text></navLabel><content src="${href}"/></navPoint>`);
  });

  const nav = XHTML_HEAD('Contents') +
    `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc">\n<ol>\n${navItems.join('\n')}\n</ol>\n</nav>\n</body>\n</html>\n`;
  files.push({ name: 'OEBPS/nav.xhtml', bytes: enc.encode(nav) });

  const ncx = `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n<head>\n<meta name="dtb:uid" content="${escXml(uid)}"/>\n<meta name="dtb:depth" content="1"/>\n<meta name="dtb:totalPageCount" content="0"/>\n<meta name="dtb:maxPageNumber" content="0"/>\n</head>\n<docTitle><text>${escXml(bookTitle)}</text></docTitle>\n<navMap>\n${ncxPoints.join('\n')}\n</navMap>\n</ncx>\n`;
  files.push({ name: 'OEBPS/toc.ncx', bytes: enc.encode(ncx) });

  const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="bookid">${escXml(uid)}</dc:identifier>\n<dc:title>${escXml(bookTitle)}</dc:title>\n` +
    (series ? `<dc:subject>${escXml(series)}</dc:subject>\n` : '') +
    `<dc:language>en</dc:language>\n<dc:creator>${escXml(author)}</dc:creator>\n<meta property="dcterms:modified">${modified}</meta>\n</metadata>\n<manifest>\n${manifest.join('\n')}\n</manifest>\n<spine toc="ncx">\n${spine.join('\n')}\n</spine>\n</package>\n`;
  files.push({ name: 'OEBPS/content.opf', bytes: enc.encode(opf) });

  const zip = buildZip(files);
  const safeName = (project.name || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadBlob(`${safeName}.epub`, zip, 'application/epub+zip');
  toast(`EPUB exported: ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}.`, 'success');
}
