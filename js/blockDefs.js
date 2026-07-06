// ============================================================
// blockDefs.js — Block type definitions & category registry
// ============================================================

export const CATEGORIES = {
  events:    { name: 'Events',    color: '#f59e0b', icon: 'zap' },
  variables: { name: 'Variables', color: '#8b5cf6', icon: 'variable' },
  control:   { name: 'Control',  color: '#f97316', icon: 'git-branch' },
  loops:     { name: 'Loops',    color: '#22c55e', icon: 'repeat' },
  functions: { name: 'Functions',color: '#3b82f6', icon: 'boxes' },
  output:    { name: 'Output',   color: '#ec4899', icon: 'message-square' },
  operators: { name: 'Operators',color: '#14b8a6', icon: 'calculator' },
};

/*
  Template syntax for block labels:
    - Plain text: rendered as <span>
    - {name:text:default}       — text input
    - {name:number:default}     — number input
    - {name:dropdown:opt1|opt2} — dropdown select
    - {name:value:default}      — value slot (accepts reporter blocks or typed input)
    - {name:bool}               — boolean slot (accepts boolean blocks)
*/

export const BLOCK_DEFS = {
  // ── Events ──────────────────────────────────────────────
  event_start: {
    type: 'event_start',
    category: 'events',
    shape: 'hat',
    template: '⚡ When start clicked',
    isEvent: true,
  },
  event_key: {
    type: 'event_key',
    category: 'events',
    shape: 'hat',
    template: '⌨ When {key:dropdown:space|up|down|left|right|a|b|c} key pressed',
    isEvent: true,
  },

  // ── Variables ───────────────────────────────────────────
  var_declare: {
    type: 'var_declare',
    category: 'variables',
    shape: 'stack',
    template: 'declare {name:text:myVar} = {value:value:0}',
  },
  var_set: {
    type: 'var_set',
    category: 'variables',
    shape: 'stack',
    template: 'set {name:text:myVar} to {value:value:0}',
  },
  var_change: {
    type: 'var_change',
    category: 'variables',
    shape: 'stack',
    template: 'change {name:text:myVar} by {value:value:1}',
  },
  var_get: {
    type: 'var_get',
    category: 'variables',
    shape: 'reporter',
    template: '{name:text:myVar}',
  },

  // ── Control ─────────────────────────────────────────────
  control_if: {
    type: 'control_if',
    category: 'control',
    shape: 'c-block',
    template: 'if {cond:bool} then',
    mouths: 1,
  },
  control_if_else: {
    type: 'control_if_else',
    category: 'control',
    shape: 'c-block',
    template: 'if {cond:bool} then',
    mouthLabels: ['else'],
    mouths: 2,
  },
  control_wait: {
    type: 'control_wait',
    category: 'control',
    shape: 'stack',
    template: 'wait {secs:number:1} seconds',
  },
  control_stop: {
    type: 'control_stop',
    category: 'control',
    shape: 'cap',
    template: '🛑 stop',
  },

  // ── Loops ───────────────────────────────────────────────
  loop_repeat: {
    type: 'loop_repeat',
    category: 'loops',
    shape: 'c-block',
    template: 'repeat {count:number:10} times',
    mouths: 1,
  },
  loop_while: {
    type: 'loop_while',
    category: 'loops',
    shape: 'c-block',
    template: 'while {cond:bool}',
    mouths: 1,
  },
  loop_forever: {
    type: 'loop_forever',
    category: 'loops',
    shape: 'c-block',
    template: 'forever',
    mouths: 1,
  },

  // ── Functions ───────────────────────────────────────────
  func_define: {
    type: 'func_define',
    category: 'functions',
    shape: 'hat-c',
    template: '🔧 define {name:text:myFunc}',
    mouths: 1,
    isEvent: false,
  },
  func_call: {
    type: 'func_call',
    category: 'functions',
    shape: 'stack',
    template: '▶ call {name:text:myFunc}',
  },

  // ── Output ──────────────────────────────────────────────
  output_print: {
    type: 'output_print',
    category: 'output',
    shape: 'stack',
    template: 'print {msg:value:Hello!}',
  },
  output_alert: {
    type: 'output_alert',
    category: 'output',
    shape: 'stack',
    template: 'alert {msg:value:Hello!}',
  },

  // ── Operators ───────────────────────────────────────────
  op_math: {
    type: 'op_math',
    category: 'operators',
    shape: 'reporter',
    template: '{a:value:0} {op:dropdown:+|-|*|/|%} {b:value:0}',
  },
  op_compare: {
    type: 'op_compare',
    category: 'operators',
    shape: 'boolean',
    template: '{a:value:0} {op:dropdown:=|≠|<|>|≤|≥} {b:value:0}',
  },
  op_logic: {
    type: 'op_logic',
    category: 'operators',
    shape: 'boolean',
    template: '{a:bool} {op:dropdown:and|or} {b:bool}',
  },
  op_not: {
    type: 'op_not',
    category: 'operators',
    shape: 'boolean',
    template: 'not {a:bool}',
  },
  op_random: {
    type: 'op_random',
    category: 'operators',
    shape: 'reporter',
    template: 'random {min:number:1} to {max:number:10}',
  },
  op_join: {
    type: 'op_join',
    category: 'operators',
    shape: 'reporter',
    template: 'join {a:value:hello} {b:value: world}',
  },
  op_length: {
    type: 'op_length',
    category: 'operators',
    shape: 'reporter',
    template: 'length of {a:value:hello}',
  },
};
