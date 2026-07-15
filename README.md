# Scratch Clone — Engine Documentation

This document provides a comprehensive overview of the Scratch Clone visual block programming engine. It covers the high-level architecture, details the purpose of each file and its core functions, and lists any features present in the user interface that are not yet fully implemented in the logic.

---

## 1. High-Level Overview

Scratch Clone is a Scratch-inspired visual programming environment. It is built entirely using standard HTML, CSS, and vanilla JavaScript (ES Modules). Instead of rendering blocks onto an HTML5 `<canvas>`, Scratch Clone represents every block as a styled DOM element. This allows it to leverage native browser features for text inputs, dropdowns, and CSS styling.

The architecture is split into four primary domains:

1. **Rendering (`renderer.js`)**: Converts abstract block template strings into tangible HTML elements.
2. **State & Connection Management (`workspace.js`)**: Keeps track of all blocks on the canvas, their positions, and how they are logically connected (e.g., block A is connected below block B, or block C is inside the "if" mouth of block D).
3. **Interactivity (`dragDrop.js`)**: Handles the complex mouse events required to drag blocks from the palette or move them around the workspace. It includes spatial math to detect when a dragged block is close enough to "snap" into another block.
4. **Execution (`interpreter.js`)**: Reads the logical connections from the workspace, converts them into an Abstract Syntax Tree (AST), and executes the logic asynchronously. It handles variable scoping, loops, function calls, and provides visual highlighting of blocks as they run.

---

## 2. Detailed File and Function Explanation

### `js/blockDefs.js`

This file serves as the configuration dictionary for the engine. It defines the visual categories and the specific behavior, shape, and syntax template for every available block.

- **`CATEGORIES`**: A constant defining the sidebar categories (Events, Variables, Control, etc.) along with their associated colors.
- **`BLOCK_DEFS`**: A constant mapping block type identifiers (e.g., `control_if`) to their definition objects. Definitions include `shape` (stack, c-block, hat, reporter), `template` (the visual text and inputs), and specific flags like `isEvent` or `mouths`.

### `js/app.js`

The application entry point. It wires together the DOM and the core JavaScript classes.

- **`renderPalette(paletteEl)`**: Reads `BLOCK_DEFS`, groups the blocks by their assigned category, generates preview DOM elements for them, and injects them into the left sidebar palette.
- **Initialization**: Instantiates `Workspace`, `Interpreter`, and `DragDropManager`.
- **Event Listeners**: Binds UI buttons (Run, Stop, Import, Export, Clear, Projects) to their respective actions. Also handles the project saving/loading modal logic and global keyboard shortcuts (like pressing `Delete` to remove a selected block).

### `js/renderer.js`

Responsible for translating block definitions into actual DOM elements.

- **`generateId()`**: Generates a unique string ID for a new block instance.
- **`parseTemplate(template)`**: Parses the custom block template strings (e.g., `set {name:text:x} to {value:value:0}`) and returns an array of segments (labels, text inputs, dropdowns, slots).
- **`createBlockElement(blockType, instanceId)`**: The main factory function. It reads the block definition, creates the wrapper `<div>`, loops over the parsed segments, and appends them. Returns an object containing the DOM element and its ID.
- **`_createCBlock(def, id, catClass)`**: A specialized helper for building complex "C-shaped" blocks (like `if`, `while`, or `define`) which require distinct top, mouth, middle (optional), and bottom DOM elements.
- **`_createSegment(seg)`**: A helper that returns a specific DOM node (e.g., a `<span>`, `<input>`, `<select>`) depending on the type of segment parsed from the template.
- **`cloneBlockForDrag(paletteElement)`**: Clones a template block from the palette to be dragged onto the workspace.

### `js/workspace.js`

Manages the internal data structure representing the program and handles workspace panning/zooming.

- **`Workspace` Class**:
  - **`addBlock(...)`, `removeBlock(...)`, `removeChain(...)`**: Methods for adding and removing block records from the internal `Map`. `removeChain` ensures all connected blocks below or inside the target are also deleted.
  - **`connectNext(targetId, srcId)`**: Logically connects `srcId` immediately below `targetId` and handles reparenting the DOM elements to reflect the connection.
  - **`connectToMouth(parentId, mouthIndex, srcId)`**: Places `srcId` as the first block inside a specific mouth of a C-block.
  - **`disconnect(id)`**: Detaches a block from its previous sibling or parent mouth, making it a free-floating stack.
  - **`_getTail(id)`**: Follows `.next` pointers to find the absolute last block in a connected stack.
  - **`_domInsertAfter`, `_domMoveChainAfter`, `_domMoveChainInto`**: Internal helper functions that physically move DOM nodes when logical connections are established.
  - **`buildTree(startId)`**: Recursively traverses the logical connections starting from a block and returns an Abstract Syntax Tree (AST) node, including all extracted input values and child branches.
  - **`_readInputs(block)`**: Scans the block's DOM element to extract current values from text inputs, number inputs, dropdowns, and nested reporter/boolean blocks.
  - **`getEventBlocks()`, `getTopBlocks()`**: Helper methods to find entry points (blocks with no parent/previous block).
  - **`clear()`, `toJSON()`, `loadJSON()`**: Methods for clearing the workspace and handling serialization/deserialization of the block program for saving and loading.
  - **`_initPanZoom()`, `_applyTransform()`, `screenToWorkspace()`**: Methods managing infinite canvas panning, zooming via scroll wheel, and coordinate translations.

### `js/dragDrop.js`

Handles all custom drag-and-drop interactions and "snapping" spatial mathematics.

- **`DragDropManager` Class**:
  - **`_initPaletteListeners()`**: Binds mousedown events on the palette to spawn new blocks and initiate a drag.
  - **`_initWorkspaceListeners()`**: Binds mousedown events on workspace blocks. It picks up the clicked block and any blocks attached below it (`_collectChainElements`), disconnecting it from its parent.
  - **`_startDrag(...)`**: Creates a floating "ghost" container that follows the mouse cursor and holds the dragged elements.
  - **`_onMouseMove(e)`**: Updates the ghost position. Crucially, it loops over all other blocks on the canvas to calculate geometric distances between connection points (notches, mouths, inline slots) to find the closest valid snap target.
  - **`_onMouseUp(e)`**: Evaluates where the drag ended. It can trigger deletion (if dropped on the palette), snapping (if close to a target), or a free drop.
  - **`_snapToTarget()`**: Applies the appropriate workspace connection methods (`connectNext`, `connectToMouth`) based on the target discovered during mouse move.
  - **`_dropFree(e)`**: Wraps the dropped block in a stack wrapper and places it freely on the canvas coordinates.
  - **`_deleteBlocks()`, `_deleteChainRecursive()`**: Methods to safely destroy dragged blocks.
  - **`_showSnapHighlight()`, `_clearSnapHighlight()`, `_animateSnap()`**: Manages the visual indicators (yellow lines, hovering effects) that show the user where a block will land.

### `js/interpreter.js`

The execution engine that walks the generated AST. It runs asynchronously to allow for visual delays and infinite loops without freezing the browser thread.

- **`Interpreter` Class**:
  - **`run()`**: The main execution entry point. It clears previous state, parses function definitions (`func_define`), finds the `event_start` blocks, and begins execution.
  - **`stop()`**: Stops execution instantly using an `AbortController`.
  - **`executeNode(node)`**: Executes a single AST node. It highlights the block in the UI, pauses for the step delay, executes the node's specific logic via `_executeOne`, un-highlights the block, and recursively calls the `next` node.
  - **`_executeOne(node)`**: A massive switch statement that handles the behavior for every single block type (`var_declare`, `control_if`, `loop_repeat`, `output_print`, etc.).
  - **`_resolveValue(val)`**: Takes an input value and resolves it. If it's a raw string/number, it returns it. If it's a variable name, it looks it up. If it's a reference to an inline reporter block, it evaluates that block synchronously.
  - **`_evalReporterSync(node)`**: Synchronously processes math, comparison, logic, or string manipulation blocks that sit inside input slots.
  - **`_evalMath()`, `_evalCompare()`, `_evalLogic()`, `_evalConditionSync()`**: Specific execution helpers for operators.
  - **`_delay(ms)`**: A Promise wrapper around `setTimeout` that pauses execution between blocks for visual feedback.
  - **`_highlightBlock()`, `_unhighlightBlock()`, `_clearHighlights()`**: Manages adding and removing the `.executing` CSS class that makes blocks glow while running.

---

## 3. Core System Flows

### 3.1. Application Startup

1. **`DOMContentLoaded` (`app.js`)**: The entry point fires.
2. **Initialization**: `Workspace`, `Interpreter`, and `DragDropManager` classes are instantiated.
3. **`renderPalette(paletteEl)` (`app.js`)**:
   - Iterates through `CATEGORIES` and `BLOCK_DEFS` from `blockDefs.js`.
   - Calls `createBlockElement(blockType)` from `renderer.js` for each definition to generate preview DOM nodes.
   - Appends these nodes to the sidebar palette.
4. **Binding Events**: UI buttons (Run, Stop, Import, etc.) are attached to their respective listeners.

### 3.2. Drag and Drop Interaction

When a user clicks and moves a block, a sequence of precise events fires.

#### A. Initiating Drag

- **From Palette (`_initPaletteListeners` in `dragDrop.js`)**:
  - `createBlockElement(blockType)` is called to generate a fresh DOM element and a unique ID (e.g., `blk_1_xyz`).
  - `_startDrag()` creates a `.drag-ghost` container that follows the mouse, holding the newly cloned element.
- **From Workspace (`_initWorkspaceListeners` in `dragDrop.js`)**:
  - `_collectChainElements(startId)` traverses `block.next` pointers to grab the block and all blocks logically connected below it.
  - `workspace.disconnect(id)` breaks the logical ties (updates `prev.next` or `parent.mouths` to `null`).
  - `_startDrag()` moves the existing elements into the ghost container.

#### B. Hovering and Snapping (`_onMouseMove`)

- As the mouse moves, `_onMouseMove` recalculates distances between the dragged block's "notch" and all valid targets on the canvas.
- If the distance is under `SNAP_THRESHOLD` (60px), it assigns `this.snapTarget = { type: 'next', targetId: 'blk_2' }` and creates a visual yellow highlight via `_showSnapHighlight()`.

#### C. Dropping the Block (`_onMouseUp`)

Depending on the mouse position and `this.snapTarget`, different flows occur:

- **Drop Freely (No snap target)**:
  - `_dropFree(e)` executes.
  - `workspace.screenToWorkspace(x, y)` calculates absolute canvas coordinates based on zoom/pan.
  - If it's a new block, `workspace.addBlock(...)` is called. The data stored in the `Workspace.blocks` Map looks like:
    ```json
    {
      "id": "blk_1_xyz",
      "type": "control_if",
      "element": "[HTMLElement]",
      "x": 100,
      "y": 250,
      "prev": null,
      "next": null,
      "parent": null,
      "parentMouth": null,
      "mouths": [null]
    }
    ```
  - The DOM elements are wrapped in a `.block-stack-wrapper` and placed on the workspace.

- **Drop Under (Snap to Stack)**:
  - `_snapToTarget()` executes with `target.type === 'next'`.
  - `workspace.connectNext(targetId, instanceId)` updates logical pointers (`target.next = instanceId`, `src.prev = targetId`).
  - DOM `insertBefore` seamlessly moves the dragged elements into the target's stack wrapper.

- **Drop Inside (C-Block Mouth)**:
  - `_snapToTarget()` executes with `target.type === 'mouth'`.
  - `workspace.connectToMouth(parentId, mouthIndex, srcId)` updates the C-block's internal tracking array: `parent.mouths[mouthIndex] = srcId`.
  - The DOM elements are appended directly inside the `.block-c-mouth` container div.

#### D. Deletion

If the block is dropped over the palette or the bottom delete zone:

- `_deleteBlocks()` (`dragDrop.js`) fires.
- If it's a chain of blocks, it loops through them from bottom to top, calling `workspace.blocks.delete(id)` to remove them from the data structure, and `.remove()` to clear the DOM.
- For nested blocks, `_deleteChainRecursive()` is invoked to wipe out any children inside mouths.

### 3.3. Navbar Button Actions

#### Run Button

1. `interpreter.run()` is called.
2. The interpreter scans all blocks to find `func_define` blocks, caching their Abstract Syntax Trees (AST) in `interpreter.functions`.
3. It calls `workspace.getEventBlocks()` to locate all `event_start` blocks.
4. For each starting block, `workspace.buildTree(id)` walks the connected blocks and generates a pure JS object (AST). Sample AST shape:
   ```json
   {
     "id": "blk_start",
     "type": "event_start",
     "inputs": {},
     "children": [],
     "children2": [],
     "next": {
       "id": "blk_print",
       "type": "output_print",
       "inputs": { "msg": "Hello World" },
       "children": [],
       "children2": [],
       "next": null
     }
   }
   ```
5. `interpreter.executeNode(tree)` walks the AST, pausing using `_delay()` for visual feedback, evaluating block operations, and executing logic asynchronously.

#### Export Button

1. `workspace.toJSON()` iterates through the `blocks` Map.
2. `workspace._readInputs(block)` extracts values from DOM `<input>` and `<select>` fields.
3. It bundles everything with pan/zoom states into a JSON string:
   ```json
   {
     "panX": 0,
     "panY": 0,
     "zoom": 1,
     "blocks": [
       {
         "id": "blk_1",
         "type": "var_set",
         "x": 10,
         "y": 20,
         "prev": null,
         "next": "blk_2",
         "parent": null,
         "inputs": { "name": "myVar", "value": "5" }
       }
     ]
   }
   ```
4. `app.js` wraps the JSON into a `Blob`, creates a temporary `<a>` tag with an ObjectURL, and triggers a file download.

---

## 4. Unimplemented Features Visible in UI

While the UI and block palette look complete, the following feature exists as a visual block but is not yet functionally implemented in the underlying execution engine:

- **Keyboard Event Execution triggers**:
  - **UI Presence**: The Events palette contains a "When [key] key pressed" block (`event_key`).
  - **Missing Logic**: In `interpreter.js` (line 122), the logic for `event_key` only contains the comment: `// Would need key listener — for now just continue`.
  - **Result**: Currently, placing this block on the workspace does not bind actual keyboard event listeners to the window. Pressing keys on the keyboard will not trigger the attached script to run. The execution engine only supports triggering code via the "When start clicked" block (`event_start`) tied to the "Run" button.

---

_Note: This project was built with AI assistance, and this documentation was written by AI._
