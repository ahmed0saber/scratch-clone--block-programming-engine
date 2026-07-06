// ============================================================
// workspace.js — Manages block instances, connections, and AST
// ============================================================

import { BLOCK_DEFS } from './blockDefs.js';
import { createBlockElement } from './renderer.js';

/**
 * The Workspace tracks all block instances and their connections.
 *
 * Connection model per block:
 *   prev   — id of block connected above (its "next" points to us)
 *   next   — id of block connected below
 *   parent — id of C-block that owns the mouth we're in
 *   parentMouth — index of the mouth (0 or 1)
 *   mouths — array of ids: first block in each mouth (for C-blocks)
 */
export class Workspace {
  constructor(containerEl) {
    this.container = containerEl;
    this.blocks = new Map();  // id → blockData
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this._initPanZoom();
  }

  /** Register a block instance */
  addBlock(id, blockType, element, x = 0, y = 0) {
    const def = BLOCK_DEFS[blockType];
    const data = {
      id,
      type: blockType,
      element,
      def,
      x, y,
      prev: null,
      next: null,
      parent: null,
      parentMouth: null,
      mouths: def.mouths ? new Array(def.mouths).fill(null) : null,
    };
    this.blocks.set(id, data);
    return data;
  }

  getBlock(id) { return this.blocks.get(id); }

  removeBlock(id) {
    const block = this.blocks.get(id);
    if (!block) return;
    this.disconnect(id);
    block.element.remove();
    this.blocks.delete(id);
  }

  /** Remove a block and all blocks connected after / inside it */
  removeChain(id) {
    const block = this.blocks.get(id);
    if (!block) return;

    // Remove children in mouths
    if (block.mouths) {
      block.mouths.forEach((childId) => {
        if (childId) this.removeChain(childId);
      });
    }

    // Remove next chain
    if (block.next) this.removeChain(block.next);

    this.disconnect(id);
    block.element.remove();
    this.blocks.delete(id);
  }

  /**
   * Connect srcId below targetId (target.next = src, src.prev = target).
   * Also handles DOM reparenting.
   */
  connectNext(targetId, srcId) {
    const target = this.blocks.get(targetId);
    const src = this.blocks.get(srcId);
    if (!target || !src) return;

    // If target already has a next, push it below src's chain
    if (target.next) {
      const oldNext = target.next;
      const tail = this._getTail(srcId);
      if (tail) {
        this.connectNext(tail, oldNext);
      }
    }

    target.next = srcId;
    src.prev = targetId;
    src.parent = target.parent;
    src.parentMouth = target.parentMouth;

    // DOM: insert src's wrapper after target element
    this._domInsertAfter(target, src);
  }

  /**
   * Connect srcId as the first block inside a C-block mouth.
   */
  connectToMouth(parentId, mouthIndex, srcId) {
    const parent = this.blocks.get(parentId);
    const src = this.blocks.get(srcId);
    if (!parent || !src || !parent.mouths) return;

    // If mouth already has a block, push it below src's chain
    if (parent.mouths[mouthIndex]) {
      const oldFirst = parent.mouths[mouthIndex];
      const tail = this._getTail(srcId);
      if (tail) {
        this.connectNext(tail, oldFirst);
      }
    }

    parent.mouths[mouthIndex] = srcId;
    src.parent = parentId;
    src.parentMouth = mouthIndex;
    src.prev = null;

    // DOM: insert into the mouth container
    const mouthEl = parent.element.querySelectorAll(':scope > .block-c-mouth')[mouthIndex];
    if (mouthEl) {
      // Unwrap from any stack wrapper
      const wrapper = src.element.closest('.block-stack-wrapper');
      if (wrapper && wrapper !== src.element) {
        // Move element out of wrapper
        mouthEl.appendChild(src.element);
        if (!wrapper.children.length) wrapper.remove();
      } else {
        mouthEl.appendChild(src.element);
      }
      // Also move the chain below
      this._domMoveChainInto(src, mouthEl);
    }
  }

  /**
   * Disconnect a block from whatever it's attached to.
   * The block becomes a free-floating stack on the workspace.
   */
  disconnect(id) {
    const block = this.blocks.get(id);
    if (!block) return;

    // Remove from prev's next
    if (block.prev) {
      const prevBlock = this.blocks.get(block.prev);
      if (prevBlock) prevBlock.next = null;
      block.prev = null;
    }

    // Remove from parent mouth
    if (block.parent) {
      const parentBlock = this.blocks.get(block.parent);
      if (parentBlock && parentBlock.mouths) {
        const mi = block.parentMouth;
        if (parentBlock.mouths[mi] === id) {
          parentBlock.mouths[mi] = null;
        }
      }
      block.parent = null;
      block.parentMouth = null;
    }
  }

  /** Get the last block in a chain starting from id */
  _getTail(id) {
    let current = id;
    while (true) {
      const b = this.blocks.get(current);
      if (!b || !b.next) return current;
      current = b.next;
    }
  }

  /** DOM: insert src element after target element in the flow */
  _domInsertAfter(target, src) {
    // Remove src from any wrapper
    const oldWrapper = src.element.closest('.block-stack-wrapper');
    if (oldWrapper && oldWrapper !== src.element) {
      src.element.remove();
      if (!oldWrapper.children.length) oldWrapper.remove();
    }

    // Insert after target element
    if (target.element.nextSibling) {
      target.element.parentNode.insertBefore(src.element, target.element.nextSibling);
    } else {
      target.element.parentNode.appendChild(src.element);
    }

    // Also move the rest of src's chain
    this._domMoveChainAfter(src);
  }

  /** Move the chain of blocks after src into correct DOM positions */
  _domMoveChainAfter(src) {
    let current = src;
    while (current.next) {
      const nextBlock = this.blocks.get(current.next);
      if (!nextBlock) break;
      const nextWrapper = nextBlock.element.closest('.block-stack-wrapper');
      if (nextWrapper && nextWrapper !== nextBlock.element) {
        nextBlock.element.remove();
        if (!nextWrapper.children.length) nextWrapper.remove();
      }
      if (current.element.nextSibling !== nextBlock.element) {
        current.element.parentNode.insertBefore(nextBlock.element, current.element.nextSibling);
      }
      current = nextBlock;
    }
  }

  /** Move src's chain into a mouth container */
  _domMoveChainInto(src, mouthEl) {
    let current = src;
    while (current.next) {
      const nextBlock = this.blocks.get(current.next);
      if (!nextBlock) break;
      const nextWrapper = nextBlock.element.closest('.block-stack-wrapper');
      if (nextWrapper && nextWrapper !== nextBlock.element) {
        nextBlock.element.remove();
        if (!nextWrapper.children.length) nextWrapper.remove();
      }
      mouthEl.appendChild(nextBlock.element);
      current = nextBlock;
    }
  }

  /**
   * Build an AST-like tree from a starting block.
   */
  buildTree(startId) {
    const block = this.blocks.get(startId);
    if (!block) return null;

    const node = {
      id: block.id,
      type: block.type,
      inputs: this._readInputs(block),
      children: [],   // mouth 0 blocks
      children2: [],  // mouth 1 blocks (else branch)
      next: null,
    };

    // Read mouths
    if (block.mouths) {
      if (block.mouths[0]) {
        node.children = this._buildChain(block.mouths[0]);
      }
      if (block.mouths[1]) {
        node.children2 = this._buildChain(block.mouths[1]);
      }
    }

    // Read next
    if (block.next) {
      node.next = this.buildTree(block.next);
    }

    return node;
  }

  _buildChain(startId) {
    const chain = [];
    let current = startId;
    while (current) {
      const tree = this.buildTree(current);
      if (tree) chain.push(tree);
      const block = this.blocks.get(current);
      current = block?.next || null;
      // Avoid double-processing: buildTree already handles .next
      break; // buildTree already chains via .next
    }
    return chain;
  }

  /** Read all input values from a block's DOM */
  _readInputs(block) {
    const inputs = {};
    const el = block.element;

    // Read text/number inputs
    el.querySelectorAll('.block-input[data-input-name]').forEach(inp => {
      // Only read direct inputs (not from nested blocks)
      const closestBlock = inp.closest('.block[data-block-id]');
      let isDirect = false;
      if (closestBlock === el) {
        isDirect = true;
      } else {
        const topHeader = inp.closest('.block-c-top');
        if (topHeader && topHeader.closest('.block[data-block-id]') === el) {
          isDirect = true;
        }
      }
      if (isDirect) {
        inputs[inp.dataset.inputName] = inp.value;
      }
    });

    // Read dropdowns
    el.querySelectorAll('.block-select[data-input-name]').forEach(sel => {
      const closestBlock = sel.closest('.block[data-block-id]');
      let isDirect = false;
      if (closestBlock === el) {
        isDirect = true;
      } else {
        const topHeader = sel.closest('.block-c-top');
        if (topHeader && topHeader.closest('.block[data-block-id]') === el) {
          isDirect = true;
        }
      }
      if (isDirect) {
        inputs[sel.dataset.inputName] = sel.value;
      }
    });

    // Read value slots with nested reporter blocks
    el.querySelectorAll('.input-slot[data-slot-name]').forEach(slot => {
      // Only read slots that belong directly to this block
      // 1. If it's a normal block, its closest block must be `el`
      // 2. If it's a C-block, its closest block might be `el`, or if it's in the top header, the closest block of its .block-c-top must be `el`
      const closestBlock = slot.closest('.block[data-block-id]');
      let isDirect = false;
      if (closestBlock === el) {
        isDirect = true;
      } else {
        const topHeader = slot.closest('.block-c-top');
        if (topHeader && topHeader.closest('.block[data-block-id]') === el) {
          isDirect = true;
        }
      }
      
      if (!isDirect) return;

      const nestedBlock = slot.querySelector('.block[data-block-id]');
      if (nestedBlock) {
        const nestedId = nestedBlock.dataset.blockId;
        inputs[slot.dataset.slotName] = { _blockRef: nestedId };
      }
    });

    return inputs;
  }

  /** Find all event (hat) blocks — entry points */
  getEventBlocks() {
    const events = [];
    this.blocks.forEach(block => {
      if (block.def.isEvent && !block.prev && !block.parent) {
        events.push(block);
      }
    });
    return events;
  }

  /** Get all top-level block stacks (blocks with no prev and no parent) */
  getTopBlocks() {
    const tops = [];
    this.blocks.forEach(block => {
      if (!block.prev && !block.parent) {
        tops.push(block);
      }
    });
    return tops;
  }

  /** Clear all blocks */
  clear() {
    this.blocks.forEach(block => block.element.remove());
    this.blocks.clear();
    // Remove all stack wrappers
    this.container.querySelectorAll('.block-stack-wrapper').forEach(w => w.remove());
  }

  /** Export all blocks to JSON */
  toJSON() {
    const data = [];
    this.blocks.forEach(block => {
      data.push({
        id: block.id,
        type: block.type,
        x: block.x,
        y: block.y,
        prev: block.prev,
        next: block.next,
        parent: block.parent,
        parentMouth: block.parentMouth,
        mouths: block.mouths,
        inputs: this._readInputs(block),
      });
    });
    return JSON.stringify({ panX: this.panX, panY: this.panY, zoom: this.zoom, blocks: data });
  }

  /** Import blocks from JSON */
  loadJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      const data = parsed.blocks || [];
      this.clear();
      
      this.panX = parsed.panX || 0;
      this.panY = parsed.panY || 0;
      this.zoom = parsed.zoom || 1;
      this._applyTransform();

      // 1. Create all blocks and register them
      data.forEach(bData => {
        const { element } = createBlockElement(bData.type, bData.id);
        this.addBlock(bData.id, bData.type, element, bData.x, bData.y);
        const block = this.getBlock(bData.id);
        block.prev = bData.prev;
        block.next = bData.next;
        block.parent = bData.parent;
        block.parentMouth = bData.parentMouth;
        block.mouths = bData.mouths;
        block._savedInputs = bData.inputs;
      });

      // 2. Restore inputs and inline reporters
      this.blocks.forEach(block => {
        const inputs = block._savedInputs;
        if (!inputs) return;
        const el = block.element;
        
        el.querySelectorAll('.block-input[data-input-name]').forEach(inp => {
          const closestBlock = inp.closest('.block[data-block-id]');
          let isDirect = false;
          if (closestBlock === el) isDirect = true;
          else {
            const topHeader = inp.closest('.block-c-top');
            if (topHeader && topHeader.closest('.block[data-block-id]') === el) isDirect = true;
          }
          if (isDirect) {
            if (inputs[inp.dataset.inputName] !== undefined && typeof inputs[inp.dataset.inputName] !== 'object') {
              inp.value = inputs[inp.dataset.inputName];
            }
          }
        });
        
        el.querySelectorAll('.block-select[data-input-name]').forEach(sel => {
          const closestBlock = sel.closest('.block[data-block-id]');
          let isDirect = false;
          if (closestBlock === el) isDirect = true;
          else {
            const topHeader = sel.closest('.block-c-top');
            if (topHeader && topHeader.closest('.block[data-block-id]') === el) isDirect = true;
          }
          if (isDirect) {
            if (inputs[sel.dataset.inputName] !== undefined && typeof inputs[sel.dataset.inputName] !== 'object') {
              sel.value = inputs[sel.dataset.inputName];
            }
          }
        });
        
        el.querySelectorAll('.input-slot[data-slot-name]').forEach(slot => {
          const closestBlock = slot.closest('.block[data-block-id]');
          let isDirect = false;
          if (closestBlock === el) isDirect = true;
          else {
            const topHeader = slot.closest('.block-c-top');
            if (topHeader && topHeader.closest('.block[data-block-id]') === el) isDirect = true;
          }
          if (!isDirect) return;

          const val = inputs[slot.dataset.slotName];
          if (val && val._blockRef) {
            const childBlock = this.getBlock(val._blockRef);
            if (childBlock) {
              slot.appendChild(childBlock.element);
              slot.classList.add('has-block');
              childBlock.element.dataset.slotParent = block.id;
              childBlock.element.dataset.slotName = slot.dataset.slotName;
              
              const input = slot.querySelector('.block-input');
              if (input) input.style.display = 'none';
            }
          }
        });
      });

      // 3. Reconstruct DOM for chains and C-blocks
      const buildDomChain = (startId, container) => {
        let currentId = startId;
        while (currentId) {
          const b = this.getBlock(currentId);
          if (!b) break;
          container.appendChild(b.element);
          
          if (b.mouths) {
            b.mouths.forEach((mouthStartId, i) => {
              if (mouthStartId) {
                const mouthEl = b.element.querySelectorAll(':scope > .block-c-mouth')[i];
                if (mouthEl) {
                  buildDomChain(mouthStartId, mouthEl);
                }
              }
            });
          }
          currentId = b.next;
        }
      };

      this.blocks.forEach(block => {
        if (!block.prev && !block.parent && !block.element.dataset.slotParent) {
          const wrapper = document.createElement('div');
          wrapper.className = 'block-stack-wrapper';
          wrapper.style.left = block.x + 'px';
          wrapper.style.top = block.y + 'px';
          this.container.appendChild(wrapper);
          
          buildDomChain(block.id, wrapper);
        }
      });

      this.blocks.forEach(b => delete b._savedInputs);
    } catch (e) {
      console.error('Failed to load blocks:', e);
      alert('Failed to load blocks file. It might be corrupted.');
    }
  }

  // ── Pan & Zoom ──────────────────────────────────────────
  _initPanZoom() {
    let isPanning = false;
    let startX, startY;
    const container = this.container.parentElement;

    container.addEventListener('mousedown', (e) => {
      // Middle click or ctrl+left click to pan
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isPanning = true;
        startX = e.clientX - this.panX;
        startY = e.clientY - this.panY;
        container.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      this.panX = e.clientX - startX;
      this.panY = e.clientY - startY;
      this._applyTransform();
    });

    window.addEventListener('mouseup', (e) => {
      if (isPanning) {
        isPanning = false;
        container.style.cursor = '';
      }
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.max(0.3, Math.min(2.5, this.zoom * delta));
      
      // Zoom toward mouse position
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this._applyTransform();
    }, { passive: false });
  }

  _applyTransform() {
    this.container.style.transform = 
      `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    
    // Update info display
    const info = document.getElementById('workspace-info');
    if (info) {
      info.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
    }
  }

  /** Convert screen coordinates to workspace coordinates */
  screenToWorkspace(sx, sy) {
    const container = this.container.parentElement;
    const rect = container.getBoundingClientRect();
    return {
      x: (sx - rect.left - this.panX) / this.zoom,
      y: (sy - rect.top - this.panY) / this.zoom,
    };
  }
}
