/* =========================================================
   Weaver — js/features/hierarchy.js
   Step 14: Hierarchy drawer — lag-free chapter/section tree
   for Manuscript and Main Novel with instant window-reset jumps.
   ========================================================= */

import { el, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { getState, subscribe } from '../core/state.js';
import { buildBlockIndex, extractHeadings } from '../utils/text.js';
import { jumpManuscriptToBlock } from '../panels/manuscript.js';
import { jumpNovelToBlock } from '../panels/main-novel.js';

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

  // One O(n) pass per open — never per keystroke or scroll.
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
