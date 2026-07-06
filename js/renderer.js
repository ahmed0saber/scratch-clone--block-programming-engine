// ============================================================
// renderer.js — Creates DOM elements from block definitions
// ============================================================

import { BLOCK_DEFS, CATEGORIES } from './blockDefs.js';

let _idCounter = 0;
export function generateId() {
  return 'blk_' + (++_idCounter) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Parse a block template string into an array of segments.
 * E.g. "set {name:text:x} to {value:value:0}" →
 *   [ {type:'label', text:'set'}, {type:'input', name:'name', inputType:'text', default:'x'}, ... ]
 */
export function parseTemplate(template) {
  const segments = [];
  const regex = /\{(\w+):(\w+)(?::([^}]*))?\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Text before this match
    const before = template.slice(lastIndex, match.index).trim();
    if (before) segments.push({ type: 'label', text: before });

    segments.push({
      type: 'input',
      name: match[1],
      inputType: match[2],   // text | number | dropdown | value | bool
      default: match[3] || '',
    });
    lastIndex = regex.lastIndex;
  }

  const tail = template.slice(lastIndex).trim();
  if (tail) segments.push({ type: 'label', text: tail });

  return segments;
}

/**
 * Create a DOM element for a block instance.
 * Returns { element, instanceId, blockType }
 */
export function createBlockElement(blockType, instanceId) {
  const def = BLOCK_DEFS[blockType];
  if (!def) throw new Error(`Unknown block type: ${blockType}`);

  const id = instanceId || generateId();
  const cat = def.category;
  const catClass = `block-cat-${cat}`;

  let el;

  if (def.shape === 'c-block' || def.shape === 'hat-c') {
    el = _createCBlock(def, id, catClass);
  } else {
    el = document.createElement('div');
    el.className = `block block-${def.shape} ${catClass}`;
    const segments = parseTemplate(def.template);
    segments.forEach(seg => el.appendChild(_createSegment(seg)));
  }

  el.dataset.blockId = id;
  el.dataset.blockType = blockType;
  el.dataset.category = cat;

  return { element: el, instanceId: id, blockType };
}

/** Create a C-block (or hat-c) element with mouth(s) */
function _createCBlock(def, id, catClass) {
  const shapeClass = def.shape === 'hat-c' ? 'block-hat-c' : 'block-c';
  const el = document.createElement('div');
  el.className = `block ${shapeClass} ${catClass}`;

  // Top row
  const top = document.createElement('div');
  top.className = 'block-c-top';
  const segments = parseTemplate(def.template);
  segments.forEach(seg => top.appendChild(_createSegment(seg)));
  el.appendChild(top);

  // Mouth 1
  const mouth1 = document.createElement('div');
  mouth1.className = 'block-c-mouth';
  mouth1.dataset.mouthIndex = '0';
  el.appendChild(mouth1);

  // If 2 mouths (if-else), add mid label + second mouth
  if (def.mouths === 2) {
    const mid = document.createElement('div');
    mid.className = 'block-c-mid';
    const midLabel = document.createElement('span');
    midLabel.className = 'block-label';
    midLabel.textContent = def.mouthLabels?.[0] || 'else';
    mid.appendChild(midLabel);
    el.appendChild(mid);

    const mouth2 = document.createElement('div');
    mouth2.className = 'block-c-mouth';
    mouth2.dataset.mouthIndex = '1';
    el.appendChild(mouth2);
  }

  // Bottom cap
  const bottom = document.createElement('div');
  bottom.className = 'block-c-bottom';
  el.appendChild(bottom);

  return el;
}

/** Create a single template segment element */
function _createSegment(seg) {
  if (seg.type === 'label') {
    const span = document.createElement('span');
    span.className = 'block-label';
    span.textContent = seg.text;
    return span;
  }

  // Input segment
  switch (seg.inputType) {
    case 'text': {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'block-input';
      input.value = seg.default;
      input.dataset.inputName = seg.name;
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('focus', e => e.target.select());
      return input;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'block-input block-input-number';
      input.value = seg.default;
      input.dataset.inputName = seg.name;
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('focus', e => e.target.select());
      return input;
    }
    case 'dropdown': {
      const sel = document.createElement('select');
      sel.className = 'block-select';
      sel.dataset.inputName = seg.name;
      const opts = seg.default.split('|');
      opts.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.trim();
        opt.textContent = o.trim();
        sel.appendChild(opt);
      });
      sel.addEventListener('mousedown', e => e.stopPropagation());
      return sel;
    }
    case 'value': {
      const slot = document.createElement('span');
      slot.className = 'input-slot';
      slot.dataset.slotName = seg.name;
      slot.dataset.slotType = 'value';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'block-input';
      input.value = seg.default;
      input.dataset.inputName = seg.name;
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('focus', e => e.target.select());
      slot.appendChild(input);
      return slot;
    }
    case 'bool': {
      const slot = document.createElement('span');
      slot.className = 'input-slot slot-bool';
      slot.dataset.slotName = seg.name;
      slot.dataset.slotType = 'bool';
      return slot;
    }
    default: {
      const span = document.createElement('span');
      span.textContent = seg.default;
      return span;
    }
  }
}

/**
 * Clone a block element for dragging from palette.
 * Deep-clones the DOM and assigns a new instance ID.
 */
export function cloneBlockForDrag(paletteElement) {
  const blockType = paletteElement.dataset.blockType;
  return createBlockElement(blockType);
}
