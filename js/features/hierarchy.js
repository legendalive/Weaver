/* =========================================================
   Weaver — js/features/hierarchy.js
   Step 14 (v2): Hierarchy drawer — lag-free chapter/section
   tree for Manuscript and Main Novel with instant jumps.
   v2: carries its own styles so no CSS append is required.
   ========================================================= */

import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { buildBlockIndex, extractHeadings } from '../utils/text.js';
import { jumpManuscriptToBlock } from '../panels/manuscript.js';
import { jumpNovelToBlock } from '../panels/main-novel.js';

const STYLE_ID = 'hier-drawer-style';
const CSS = `
.hier-drawer{position:fixed;top:0;left:0;bottom:0;width:min(340px,86vw);
  background:var(--surface);border-right:1px solid var(--border-strong);
  box-shadow:var(--shadow-2);transform:translateX(-102%);
  transition:transform .22s ease;z-index:90;display:flex;flex-direction:column;}
.hier-drawer.is-open{transform:translateX(0);}
.hier-header{display:flex;align-items:center;justify-content:space-between;
  padding:12px 14px;border-bottom:1px solid var(--border);}
.hier-title{display:flex;align-items:center;gap:8px;font-size:.85rem;
  font-weight:650;letter-spacing:.1em;text-transform:uppercase;}
.hier-title .icon{color:var(--accent);}
.hier-seg{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border);}
.hier-seg .btn{flex:1;}
.hier-seg .btn.is-selected{border-color:rgba(224,168,60,.55);
  background:var(--accent-soft);color:var(--accent);}
.hier-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:2px;}
.hier-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border:none;
  border-radius:var(--radius-sm);background:transparent;color:var(--text);
  font-size:.84rem;text-align:left;cursor:pointer;}
.hier-item:hover{background:var(--surface-2);}
.hier-item .icon{color:var(--faint);flex:none;}
.hier-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hier-l1{font-weight:650;color:var(--accent);}
.hier-l2{padding-left:24px;}
.hier-l3{padding-left:40px;color:var(--muted);}
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

let drawer = null;
let listEl = null;
let segBtns = {};
let target = 'manuscript';

function segButton(key, label) {
  const b = el('button', {
    class: 'btn btn-sm',
    text: label,
    onclick: () => { target = key; refreshList(); },
  });
  segBtns[key] = b;
  return b;
}

function ensureDrawer() {
  if (drawer) return;
  listEl = el('div', { class: 'hier-list' });
  drawer = el('aside', { class: 'hier-drawer' }, [
    el('div', { class: 'hier-header' }, [
      el('h2', { class: 'hier-title' }, [icon('tree'), 'Hierarchy']),
      el('button', {
        class: 'btn btn-ghost btn-icon btn-sm',
        'aria-label': 'Close hierarchy',
        onclick: () => closeDrawer(),
      }, [icon('x')]),
    ]),
    el('div', { class: 'hier-seg' }, [
      segButton('manuscript', 'Manuscript'),
      segButton('novel', 'Main Novel'),
    ]),
    listEl,
  ]);
  document.body.appendChild(drawer);

  subscribe((state, change) => {
    if (change.view || (change.project && !change.silent)) closeDrawer();
  });
}

function closeDrawer() {
  if (drawer) drawer.classList.remove('is-open');
}

export function toggleHierarchyDrawer() {
  ensureStyle();
  ensureDrawer();
  const open = drawer.classList.toggle('is-open');
  if (open) refreshList();
}

function refreshList() {
  if (!listEl) return;
  clear(listEl);
  for (const [key, btn] of Object.entries(segBtns)) {
    btn.classList.toggle('is-selected', key === target);
  }

  const project = getState().project;
  if (!project) return;
  const text = target === 'manuscript'
    ? (project.manuscript.text || '')
    : (project.mainNovel.text || '');

  const blocks = buildBlockIndex(text);
  const heads = extractHeadings(text, blocks);

  if (!heads.length) {
    listEl.appendChild(el('div', { class: 'empty-state' }, [
      icon('tree', 'icon-lg'),
      el('p', { text: 'No headings yet.' }),
      el('p', {
        class: 'launch-empty-hint',
        text: 'Start a line with #, ## or ### to create chapters and sections.',
      }),
    ]));
    return;
  }

  for (const h of heads) {
    listEl.appendChild(el('button', {
      class: `hier-item hier-l${h.level}`,
      title: h.title,
      onclick: () => jump(h.index),
    }, [
      icon(h.level === 1 ? 'book' : 'file-text', 'icon-sm'),
      el('span', { text: h.title }),
    ]));
  }
}

function jump(blockIndex) {
  if (target === 'manuscript') jumpManuscriptToBlock(blockIndex);
  else jumpNovelToBlock(blockIndex);
}
