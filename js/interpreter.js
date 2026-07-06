// ============================================================
// interpreter.js — Tree-walking block program interpreter
// ============================================================

export class Interpreter {
  constructor(workspace, consoleEl) {
    this.workspace = workspace;
    this.consoleEl = consoleEl;
    this.running = false;
    this.variables = {};
    this.functions = {};
    this.stepDelay = 150; // ms between steps for visual feedback
    this._abortController = null;
  }

  /** Run all event_start blocks */
  async run() {
    if (this.running) return;
    this.running = true;
    this.variables = {};
    this.functions = {};
    this._abortController = new AbortController();

    this.log('Program started...', 'info');

    // First, register all function definitions
    this.workspace.blocks.forEach(block => {
      if (block.type === 'func_define') {
        const inputs = this.workspace._readInputs(block);
        const name = inputs.name || 'unnamed';
        const tree = this.workspace.buildTree(block.id);
        this.functions[name] = tree.children;
      }
    });

    // Find and run all event_start blocks
    const eventBlocks = this.workspace.getEventBlocks();
    const startBlocks = eventBlocks.filter(b => b.type === 'event_start');

    if (startBlocks.length === 0) {
      this.log('No "When start clicked" block found!', 'warn');
      this.running = false;
      return;
    }

    try {
      for (const startBlock of startBlocks) {
        const tree = this.workspace.buildTree(startBlock.id);
        if (tree) {
          await this.executeNode(tree);
        }
      }
      if (this.running) {
        this.log('Program finished.', 'info');
      }
    } catch (err) {
      if (err.message === 'STOPPED') {
        this.log('Program stopped.', 'warn');
      } else {
        this.log(`Error: ${err.message}`, 'error');
      }
    }

    this._clearHighlights();
    this.running = false;
  }

  /** Stop execution */
  stop() {
    this.running = false;
    if (this._abortController) {
      this._abortController.abort();
    }
    this._clearHighlights();
  }

  /** Clear console */
  clearConsole() {
    this.consoleEl.innerHTML = '';
  }

  /** Log a message to the console panel */
  log(message, type = '') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = String(message);
    this.consoleEl.appendChild(line);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }

  /** Execute a single AST node and follow the chain */
  async executeNode(node) {
    if (!this.running) throw new Error('STOPPED');
    if (!node) return;

    // Highlight the executing block
    this._highlightBlock(node.id);
    await this._delay(this.stepDelay);

    const result = await this._executeOne(node);

    this._unhighlightBlock(node.id);

    // Execute next in chain
    if (node.next) {
      await this.executeNode(node.next);
    }

    return result;
  }

  /** Execute one block */
  async _executeOne(node) {
    if (!this.running) throw new Error('STOPPED');

    switch (node.type) {
      // ── Events ──
      case 'event_start':
        // Just continue to next
        return;

      case 'event_key':
        // Would need key listener — for now just continue
        return;

      // ── Variables ──
      case 'var_declare':
        this.variables[node.inputs.name || 'x'] = this._resolveValue(node.inputs.value);
        return;

      case 'var_set':
        this.variables[node.inputs.name || 'x'] = this._resolveValue(node.inputs.value);
        return;

      case 'var_change': {
        const name = node.inputs.name || 'x';
        const by = Number(this._resolveValue(node.inputs.value)) || 0;
        this.variables[name] = (Number(this.variables[name]) || 0) + by;
        return;
      }

      case 'var_get':
        return this.variables[node.inputs.name] ?? 0;

      // ── Control ──
      case 'control_if': {
        const cond = await this._evaluateCondition(node.inputs.cond);
        if (cond && node.children.length > 0) {
          for (const child of node.children) {
            await this.executeNode(child);
          }
        }
        return;
      }

      case 'control_if_else': {
        const cond = await this._evaluateCondition(node.inputs.cond);
        if (cond && node.children.length > 0) {
          for (const child of node.children) {
            await this.executeNode(child);
          }
        } else if (!cond && node.children2.length > 0) {
          for (const child of node.children2) {
            await this.executeNode(child);
          }
        }
        return;
      }

      case 'control_wait': {
        const secs = Number(node.inputs.secs) || 1;
        await this._delay(secs * 1000);
        return;
      }

      case 'control_stop':
        this.running = false;
        throw new Error('STOPPED');

      // ── Loops ──
      case 'loop_repeat': {
        const count = Number(this._resolveValue(node.inputs.count)) || 0;
        for (let i = 0; i < count && this.running; i++) {
          if (node.children.length > 0) {
            for (const child of node.children) {
              await this.executeNode(child);
            }
          }
        }
        return;
      }

      case 'loop_while': {
        let guard = 0;
        while (this.running && guard < 10000) {
          const cond = await this._evaluateCondition(node.inputs.cond);
          if (!cond) break;
          if (node.children.length > 0) {
            for (const child of node.children) {
              await this.executeNode(child);
            }
          }
          guard++;
        }
        if (guard >= 10000) this.log('Loop limit reached (10000 iterations)', 'warn');
        return;
      }

      case 'loop_forever': {
        let guard = 0;
        while (this.running && guard < 10000) {
          if (node.children.length > 0) {
            for (const child of node.children) {
              await this.executeNode(child);
            }
          }
          guard++;
        }
        if (guard >= 10000) this.log('Loop limit reached (10000 iterations)', 'warn');
        return;
      }

      // ── Functions ──
      case 'func_define':
        // Already registered in run()
        return;

      case 'func_call': {
        const fname = node.inputs.name || '';
        const fbody = this.functions[fname];
        if (!fbody) {
          this.log(`Function "${fname}" not defined!`, 'error');
          return;
        }
        for (const child of fbody) {
          await this.executeNode(child);
        }
        return;
      }

      // ── Output ──
      case 'output_print':
        this.log(this._resolveValue(node.inputs.msg));
        return;

      case 'output_alert':
        alert(this._resolveValue(node.inputs.msg));
        return;

      // ── Operators (reporter/boolean — usually evaluated inline) ──
      case 'op_math':
        return this._evalMath(node);

      case 'op_compare':
        return this._evalCompare(node);

      case 'op_logic':
        return this._evalLogic(node);

      case 'op_not':
        return !this._evalConditionSync(node.inputs.a);

      case 'op_random': {
        const min = Number(node.inputs.min) || 0;
        const max = Number(node.inputs.max) || 10;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      case 'op_join':
        return String(this._resolveValue(node.inputs.a)) + String(this._resolveValue(node.inputs.b));

      case 'op_length':
        return String(this._resolveValue(node.inputs.a)).length;

      default:
        this.log(`Unknown block: ${node.type}`, 'error');
    }
  }

  /** Resolve a value — handles variable references and block references */
  _resolveValue(val) {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object' && val._blockRef) {
      // Evaluate the referenced reporter block
      const refBlock = this.workspace.getBlock(val._blockRef);
      if (refBlock) {
        const tree = this.workspace.buildTree(val._blockRef);
        // Synchronous evaluation for reporters
        return this._evalReporterSync(tree);
      }
      return 0;
    }
    // Check if it's a variable name
    const str = String(val);
    if (str in this.variables) return this.variables[str];
    // Try to parse as number
    const num = Number(str);
    if (!isNaN(num) && str.trim() !== '') return num;
    return str;
  }

  /** Synchronously evaluate a reporter block */
  _evalReporterSync(node) {
    if (!node) return 0;
    switch (node.type) {
      case 'var_get':
        return this.variables[node.inputs.name] ?? 0;
      case 'op_math':
        return this._evalMath(node);
      case 'op_compare':
        return this._evalCompare(node);
      case 'op_logic':
        return this._evalLogic(node);
      case 'op_not':
        return !this._evalConditionSync(node.inputs.a);
      case 'op_random': {
        const min = Number(node.inputs.min) || 0;
        const max = Number(node.inputs.max) || 10;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      case 'op_join':
        return String(this._resolveValue(node.inputs.a)) + String(this._resolveValue(node.inputs.b));
      case 'op_length':
        return String(this._resolveValue(node.inputs.a)).length;
      default:
        return 0;
    }
  }

  _evalMath(node) {
    const a = Number(this._resolveValue(node.inputs.a)) || 0;
    const b = Number(this._resolveValue(node.inputs.b)) || 0;
    const op = node.inputs.op || '+';
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      case '%': return b !== 0 ? a % b : 0;
      default: return 0;
    }
  }

  _evalCompare(node) {
    const a = this._resolveValue(node.inputs.a);
    const b = this._resolveValue(node.inputs.b);
    const op = node.inputs.op || '=';
    const na = Number(a), nb = Number(b);
    const useNum = !isNaN(na) && !isNaN(nb);
    switch (op) {
      case '=':  return useNum ? na === nb : a == b;
      case '≠': return useNum ? na !== nb : a != b;
      case '<':  return useNum ? na < nb : a < b;
      case '>':  return useNum ? na > nb : a > b;
      case '≤': return useNum ? na <= nb : a <= b;
      case '≥': return useNum ? na >= nb : a >= b;
      default: return false;
    }
  }

  _evalLogic(node) {
    const a = this._evalConditionSync(node.inputs.a);
    const b = this._evalConditionSync(node.inputs.b);
    const op = node.inputs.op || 'and';
    return op === 'and' ? a && b : a || b;
  }

  _evalConditionSync(val) {
    if (val === undefined || val === null) return false;
    if (typeof val === 'object' && val._blockRef) {
      const tree = this.workspace.buildTree(val._blockRef);
      return this._toBool(this._evalReporterSync(tree));
    }
    return this._toBool(val);
  }

  async _evaluateCondition(val) {
    return this._evalConditionSync(val);
  }

  _toBool(val) {
    if (val === true || val === false) return val;
    if (val === 'true') return true;
    if (val === 'false' || val === '' || val === '0' || val === null || val === undefined) return false;
    return Boolean(val);
  }

  _delay(ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (this._abortController) {
        this._abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('STOPPED'));
        });
      }
    });
  }

  _highlightBlock(id) {
    const block = this.workspace.getBlock(id);
    if (block) block.element.classList.add('executing');
  }

  _unhighlightBlock(id) {
    const block = this.workspace.getBlock(id);
    if (block) block.element.classList.remove('executing');
  }

  _clearHighlights() {
    document.querySelectorAll('.executing').forEach(el => el.classList.remove('executing'));
  }
}
