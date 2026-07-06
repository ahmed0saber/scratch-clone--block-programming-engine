// ============================================================
// dragDrop.js — Custom drag & drop with snap detection
// ============================================================

import { BLOCK_DEFS } from './blockDefs.js';
import { createBlockElement } from './renderer.js';

const SNAP_THRESHOLD = 60;

export class DragDropManager {
  constructor(workspace, workspaceEl, paletteEl) {
    this.workspace = workspace;
    this.workspaceEl = workspaceEl;
    this.paletteEl = paletteEl;
    this.containerEl = workspaceEl.parentElement;

    this.dragging = false;
    this.dragData = null;
    this.ghost = null;
    this.snapTarget = null;
    this.snapIndicator = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    this._initPaletteListeners();
    this._initWorkspaceListeners();
  }

  // ── Palette: drag to create new blocks ────────────────
  _initPaletteListeners() {
    this.paletteEl.addEventListener('mousedown', (e) => {
      const blockEl = e.target.closest('.block[data-block-type]');
      if (!blockEl) return;
      if (e.target.closest('input, select')) return;
      e.preventDefault();

      const blockType = blockEl.dataset.blockType;
      const { element, instanceId } = createBlockElement(blockType);

      const rect = blockEl.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      this._startDrag({
        element,
        instanceId,
        blockType,
        offsetX,
        offsetY,
        isNew: true,
      }, e.clientX, e.clientY);
    });
  }

  // ── Workspace: drag existing blocks ───────────────────
  _initWorkspaceListeners() {
    this.workspaceEl.addEventListener('mousedown', (e) => {
      // Find the innermost block the user clicked on
      const blockEl = e.target.closest('.block[data-block-id]');
      if (!blockEl) return;
      if (e.target.closest('input, select')) return;
      e.preventDefault();

      const blockId = blockEl.dataset.blockId;
      const blockData = this.workspace.getBlock(blockId);
      if (!blockData) return;

      const rect = blockEl.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      // Collect chain elements BEFORE disconnecting
      const chainEls = this._collectChainElements(blockId);

      // Disconnect from any chain
      this.workspace.disconnect(blockId);

      this._startDrag({
        element: blockEl,
        instanceId: blockId,
        blockType: blockData.type,
        offsetX,
        offsetY,
        isNew: false,
        chainElements: chainEls,
      }, e.clientX, e.clientY);
    });
  }

  /** Collect the block element and all "next" chain elements */
  _collectChainElements(startId) {
    const elements = [];
    let currentId = startId;
    while (currentId) {
      const block = this.workspace.getBlock(currentId);
      if (!block) break;
      elements.push(block.element);
      currentId = block.next;
    }
    return elements;
  }

  // ── Start Drag ────────────────────────────────────────
  _startDrag(data, clientX, clientY) {
    this.dragging = true;
    this.dragData = data;

    // Create ghost container (follows mouse, holds the block visuals)
    this.ghost = document.createElement('div');
    this.ghost.className = 'drag-ghost';

    if (data.isNew) {
      // New block from palette — just put the new element in the ghost
      this.ghost.appendChild(data.element);
    } else {
      // Existing block — move element (and chain) into ghost
      const chainEls = data.chainElements || [data.element];

      // Remember the parent so we can clean up wrappers
      const oldParent = data.element.parentNode;

      chainEls.forEach(el => this.ghost.appendChild(el));

      // Clean up empty stack wrapper
      if (oldParent && oldParent.classList.contains('block-stack-wrapper') && !oldParent.children.length) {
        oldParent.remove();
      }
      // Clean up empty mouth
      // (the mouth element stays — it's part of a C-block)
    }

    this.ghost.style.left = (clientX - data.offsetX) + 'px';
    this.ghost.style.top = (clientY - data.offsetY) + 'px';
    document.body.appendChild(this.ghost);

    // Show delete zone
    const dz = document.getElementById('delete-zone');
    if (dz) dz.classList.add('active');

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  // ── Mouse Move ────────────────────────────────────────
  _onMouseMove(e) {
    if (!this.dragging || !this.ghost) return;

    const gx = e.clientX - this.dragData.offsetX;
    const gy = e.clientY - this.dragData.offsetY;
    this.ghost.style.left = gx + 'px';
    this.ghost.style.top = gy + 'px';

    // Delete zone hover
    const dz = document.getElementById('delete-zone');
    if (dz) {
      const dzRect = dz.getBoundingClientRect();
      const overDz = e.clientX >= dzRect.left && e.clientX <= dzRect.right &&
                     e.clientY >= dzRect.top && e.clientY <= dzRect.bottom;
      dz.classList.toggle('hover', overDz);
    }

    // Determine dragged block shape
    const dragDef = BLOCK_DEFS[this.dragData.blockType];
    const isInline = dragDef.shape === 'reporter' || dragDef.shape === 'boolean';

    // Clear previous highlights
    this._clearSnapHighlight();

    let bestTarget = null;
    let bestDist = SNAP_THRESHOLD;

    // Ghost position (the block's approximate position on screen)
    const ghostRect = this.ghost.getBoundingClientRect();
    const ghostTopY = ghostRect.top;
    const ghostCenterX = ghostRect.left + ghostRect.width / 2;
    const ghostCenterY = ghostRect.top + ghostRect.height / 2;
    const ghostNotchX = ghostRect.left + 27;

    this.workspace.blocks.forEach((block) => {
      // Don't snap to self or blocks in the dragged chain
      if (block.id === this.dragData.instanceId) return;
      if (this.dragData.chainElements?.some(el => el.dataset.blockId === block.id)) return;

      // Skip blocks that are currently in the ghost (being dragged)
      if (this.ghost.contains(block.element)) return;

      const bRect = block.element.getBoundingClientRect();
      if (bRect.width === 0) return; // not visible

      // ── Stack connections (for non-inline blocks) ──
      if (!isInline) {
        // 1. Connect below this block (target's bottom → dragged block's top)
        if (block.def.shape !== 'cap') {
          const targetBottomY = bRect.bottom - 3; // account for tab overlap
          const targetNotchX = bRect.left + 27;
          const dist = Math.hypot(ghostNotchX - targetNotchX, ghostTopY - targetBottomY);

          // Allow connecting if target has no next, OR if we'd insert between
          if (dist < bestDist && !block.next) {
            bestDist = dist;
            bestTarget = { type: 'next', targetId: block.id };
          }
        }

        // 2. C-block mouths
        if (block.mouths) {
          const mouths = block.element.querySelectorAll(':scope > .block-c-mouth');
          mouths.forEach((mouthEl, i) => {
            const mRect = mouthEl.getBoundingClientRect();
            if (mRect.width === 0) return;
            const mx = mRect.left + 27;
            const my = mRect.top + 4;
            const md = Math.hypot(ghostNotchX - mx, ghostTopY - my);
            // Allow connecting to empty mouths or mouths without a first block
            if (md < bestDist && !block.mouths[i]) {
              bestDist = md;
              bestTarget = { type: 'mouth', targetId: block.id, mouthIndex: i, el: mouthEl };
            }
          });
        }
      }

      // ── Inline slots (for reporter/boolean blocks) ──
      if (isInline) {
        const slots = block.element.querySelectorAll('.input-slot');
        slots.forEach(slot => {
          // Only consider slots that belong directly to this block
          const ownerBlock = slot.closest('.block[data-block-id]');
          if (!ownerBlock || ownerBlock.dataset.blockId !== block.id) return;
          // Don't drop into a slot that already has a block
          if (slot.classList.contains('has-block')) return;

          const slotType = slot.dataset.slotType;
          const canDrop = (slotType === 'value') ||
                          (slotType === 'bool' && dragDef.shape === 'boolean');
          if (!canDrop) return;

          const sRect = slot.getBoundingClientRect();
          const sx = sRect.left + sRect.width / 2;
          const sy = sRect.top + sRect.height / 2;
          const sd = Math.hypot(ghostCenterX - sx, ghostCenterY - sy);
          if (sd < bestDist) {
            bestDist = sd;
            bestTarget = { type: 'slot', targetId: block.id, slot };
          }
        });
      }
    });

    this.snapTarget = bestTarget;
    if (bestTarget) this._showSnapHighlight(bestTarget);
  }

  // ── Mouse Up (drop) ──────────────────────────────────
  _onMouseUp(e) {
    if (!this.dragging) return;

    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);

    const dz = document.getElementById('delete-zone');
    const overDelete = dz?.classList.contains('hover');
    if (dz) dz.classList.remove('active', 'hover');

    this._clearSnapHighlight();

    // Check if dropped on palette (delete existing block)
    const paletteRect = this.paletteEl.getBoundingClientRect();
    const overPalette = e.clientX >= paletteRect.left && e.clientX <= paletteRect.right &&
                        e.clientY >= paletteRect.top && e.clientY <= paletteRect.bottom;

    if ((overPalette || overDelete) && !this.dragData.isNew) {
      this._deleteBlocks();
    } else if (this.snapTarget) {
      this._snapToTarget();
    } else {
      this._dropFree(e);
    }

    // Clean up ghost
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }

    this.dragging = false;
    this.dragData = null;
    this.snapTarget = null;
  }

  // ── Snap to target ────────────────────────────────────
  _snapToTarget() {
    const { element, instanceId, blockType, isNew, chainElements } = this.dragData;
    const target = this.snapTarget;

    // Register block in workspace if new
    if (isNew) {
      this.workspace.addBlock(instanceId, blockType, element);
    }

    if (target.type === 'next') {
      const targetBlock = this.workspace.getBlock(target.targetId);
      const parentContainer = targetBlock.element.parentNode;

      // Move block (and chain) into the DOM after the target
      parentContainer.insertBefore(element, targetBlock.element.nextSibling);
      if (chainElements) {
        let prev = element;
        for (let i = 1; i < chainElements.length; i++) {
          parentContainer.insertBefore(chainElements[i], prev.nextSibling);
          prev = chainElements[i];
        }
      }

      this.workspace.connectNext(target.targetId, instanceId);
      this._animateSnap(element);

    } else if (target.type === 'mouth') {
      const mouthEl = target.el;
      mouthEl.appendChild(element);
      if (chainElements) {
        for (let i = 1; i < chainElements.length; i++) {
          mouthEl.appendChild(chainElements[i]);
        }
      }

      this.workspace.connectToMouth(target.targetId, target.mouthIndex, instanceId);
      this._animateSnap(element);

    } else if (target.type === 'slot') {
      const slot = target.slot;
      // Hide the text input
      const input = slot.querySelector('.block-input');
      if (input) input.style.display = 'none';
      // Place the reporter/boolean block in the slot
      slot.appendChild(element);
      slot.classList.add('has-block');

      // Register in workspace if new
      if (isNew) {
        // Already registered above
      }
      element.dataset.slotParent = target.targetId;
      element.dataset.slotName = slot.dataset.slotName;
    }
  }

  // ── Drop freely on workspace ──────────────────────────
  _dropFree(e) {
    const { element, instanceId, blockType, isNew, chainElements } = this.dragData;
    const pos = this.workspace.screenToWorkspace(
      e.clientX - this.dragData.offsetX,
      e.clientY - this.dragData.offsetY
    );

    if (isNew) {
      this.workspace.addBlock(instanceId, blockType, element, pos.x, pos.y);
    }

    // Create a wrapper for this free-floating stack
    const wrapper = document.createElement('div');
    wrapper.className = 'block-stack-wrapper';
    wrapper.style.left = pos.x + 'px';
    wrapper.style.top = pos.y + 'px';
    wrapper.appendChild(element);

    if (chainElements) {
      for (let i = 1; i < chainElements.length; i++) {
        wrapper.appendChild(chainElements[i]);
      }
    }

    this.workspaceEl.appendChild(wrapper);

    const block = this.workspace.getBlock(instanceId);
    if (block) {
      block.x = pos.x;
      block.y = pos.y;
    }
  }

  // ── Delete blocks ─────────────────────────────────────
  _deleteBlocks() {
    const { instanceId, chainElements } = this.dragData;
    if (chainElements) {
      // Delete from bottom up to avoid issues
      for (let i = chainElements.length - 1; i >= 0; i--) {
        const id = chainElements[i].dataset.blockId;
        if (id) {
          const block = this.workspace.getBlock(id);
          if (block) {
            // Also delete blocks in mouths
            if (block.mouths) {
              block.mouths.forEach(mouthFirstId => {
                if (mouthFirstId) this._deleteChainRecursive(mouthFirstId);
              });
            }
            this.workspace.blocks.delete(id);
          }
        }
        chainElements[i].remove();
      }
    } else {
      this.workspace.removeChain(instanceId);
    }
  }

  _deleteChainRecursive(id) {
    let currentId = id;
    while (currentId) {
      const block = this.workspace.getBlock(currentId);
      if (!block) break;
      if (block.mouths) {
        block.mouths.forEach(mId => {
          if (mId) this._deleteChainRecursive(mId);
        });
      }
      const nextId = block.next;
      block.element.remove();
      this.workspace.blocks.delete(currentId);
      currentId = nextId;
    }
  }

  // ── Snap highlight ────────────────────────────────────
  _showSnapHighlight(target) {
    if (target.type === 'slot') {
      target.slot.classList.add('slot-hover');
      return;
    }

    this.snapIndicator = document.createElement('div');
    this.snapIndicator.className = 'snap-indicator';
    this.snapIndicator.style.position = 'fixed';

    if (target.type === 'next') {
      const targetBlock = this.workspace.getBlock(target.targetId);
      const bRect = targetBlock.element.getBoundingClientRect();
      this.snapIndicator.style.left = bRect.left + 'px';
      this.snapIndicator.style.top = (bRect.bottom - 3) + 'px';
      this.snapIndicator.style.width = bRect.width + 'px';
    } else if (target.type === 'mouth') {
      const mRect = target.el.getBoundingClientRect();
      this.snapIndicator.style.left = mRect.left + 'px';
      this.snapIndicator.style.top = mRect.top + 'px';
      this.snapIndicator.style.width = mRect.width + 'px';
    }

    document.body.appendChild(this.snapIndicator);
  }

  _clearSnapHighlight() {
    if (this.snapIndicator) {
      this.snapIndicator.remove();
      this.snapIndicator = null;
    }
    document.querySelectorAll('.slot-hover').forEach(el => el.classList.remove('slot-hover'));
  }

  _animateSnap(el) {
    el.classList.add('snap-anim');
    setTimeout(() => el.classList.remove('snap-anim'), 250);
  }
}
