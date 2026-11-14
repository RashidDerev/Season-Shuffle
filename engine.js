(function (root) {
  'use strict';
  const CAPACITY = 12, COLUMNS = 4, COLOR_COUNT = 4, ACTIVE_ROW = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  function random(state, count) {
    let n = state.rng | 0;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    state.rng = n >>> 0;
    return Math.floor((state.rng / 4294967296) * count);
  }
  function token(state, color) { return { id: ++state.uid, color }; }
  function randomRow(state) {
    return Array.from({ length: COLUMNS }, () => token(state, random(state, COLOR_COUNT)));
  }
  function compatible(tokens) {
    return tokens.every(t => t.color === tokens[0].color);
  }
  function matchIndex(stack) {
    for (let i = stack.length - 3; i >= 0; i--) {
      if (compatible(stack.slice(i, i + 3))) return i;
    }
    return -1;
  }
  function settle(stack) {
    const events = [];
    let index;
    while ((index = matchIndex(stack)) >= 0) {
      const removed = stack.splice(index, 3);
      events.push({ removed, after: stack.slice() });
    }
    return events;
  }
  function create(seed) {
    const state = { version: 8, rng: (seed >>> 0) || 714235, seed: (seed >>> 0) || 714235,
      uid: 0, stacks: [], closed: Array(COLUMNS).fill(false), rows: [], moves: 0, status: 'playing' };
    state.stacks = Array.from({ length: COLUMNS }, () => {
      const first = random(state, COLOR_COUNT);
      const second = (first + 1 + random(state, COLOR_COUNT - 1)) % COLOR_COUNT;
      return [token(state, first), token(state, second)];
    });
    state.rows = Array.from({ length: 3 }, () => randomRow(state));
    return state;
  }
  function rotate(state, direction = 'up') {
    if (state.status !== 'playing') return false;
    if (direction === 'down') state.rows.push(state.rows.shift());
    else state.rows.unshift(state.rows.pop());
    return true;
  }
  function canRescue(stack, incoming) {
    return stack.length === CAPACITY && !!incoming && compatible([...stack.slice(-2), incoming]);
  }
  function shift(state, direction) {
    if (state.status !== 'playing' || !['left','right'].includes(direction)) return false;
    const row = state.rows[ACTIVE_ROW];
    const offset = direction === 'left' ? 1 : row.length - 1;
    state.rows[ACTIVE_ROW] = row.map((_, i) => row[(i + offset) % row.length]);
    return true;
  }
  function drop(state) {
    if (state.status !== 'playing') return null;
    const row = state.rows[ACTIVE_ROW];
    const active = state.closed.map((closed, i) => closed ? -1 : i).filter(i => i >= 0);
    const overflow = active.filter(i => state.stacks[i].length >= CAPACITY && !canRescue(state.stacks[i], row[i]));
    // A full column gets a last chance: the incoming token must match its top two.
    if (overflow.length) {
      state.status = 'lost';
      state.moves++;
      return { overflow, columns: [], won: false };
    }
    const columns = active.map(i => {
      const landing = state.stacks[i].length;
      const incoming = row[i];
      state.stacks[i].push(incoming);
      const events = settle(state.stacks[i]);
      if (!state.stacks[i].length) state.closed[i] = true;
      return { column: i, landing, incoming, events, closed: state.closed[i], rescue: landing === CAPACITY };
    });
    state.moves++;
    state.rows[ACTIVE_ROW] = randomRow(state);
    if (state.closed.every(Boolean)) state.status = 'won';
    return { overflow: [], columns, won: state.status === 'won' };
  }
  function bestColor(stack) {
    return stack.at(-1)?.color ?? 0;
  }
  function assess(state, column) {
    if (state.closed[column]) return 'closed';
    const incoming = state.rows[ACTIVE_ROW][column];
    if (state.stacks[column].length >= CAPACITY) return canRescue(state.stacks[column], incoming) ? 'rescue' : 'danger';
    const trial = [...state.stacks[column], incoming];
    if (matchIndex(trial) >= 0) return 'match';
    return incoming.color === bestColor(state.stacks[column]) ? 'pair' : 'neutral';
  }
  function valid(state) {
    if (!state || state.version !== 8 || !Array.isArray(state.stacks) || state.stacks.length !== COLUMNS ||
        !Array.isArray(state.closed) || state.closed.length !== COLUMNS || !Array.isArray(state.rows) || state.rows.length !== 3 ||
        !['playing','won','lost'].includes(state.status) ||
        !Number.isInteger(state.rng) || !Number.isInteger(state.uid) || !Number.isInteger(state.moves)) return false;
    const ids = new Set();
    const check = t => t && Number.isInteger(t.id) && !ids.has(t.id) && (ids.add(t.id), true) && Number.isInteger(t.color) && t.color >= 0 && t.color < COLOR_COUNT;
    return state.rows.every(row => Array.isArray(row) && row.length === COLUMNS && row.every(check)) && state.stacks.every((stack, i) =>
      Array.isArray(stack) && stack.length <= CAPACITY && stack.every(check) && state.closed[i] === (stack.length === 0));
  }
  function migrate(state) {
    if (!state || typeof state !== 'object') return null;
    const next = clone(state);
    if (next.version === 3 || next.version === 4) {
      if (!Array.isArray(next.closed) || next.closed.length !== COLUMNS || !next.closed.every(v => typeof v === 'boolean') ||
          !Array.isArray(next.preview) || next.preview.length !== COLUMNS ||
          !Array.isArray(next.stacks) || next.stacks.length !== COLUMNS ||
          !next.stacks.every(stack => Array.isArray(stack) && stack.every(Boolean))) return null;
      next.version = 5;
      delete next.changes;
      delete next.merges;
      next.stacks.forEach((stack, i) => {
        const remaining = stack.filter(t => t.color !== 'w');
        settle(remaining);
        next.stacks[i] = remaining;
        if (!remaining.length) {
          next.closed[i] = true;
          next.preview[i] = null;
        } else if (next.preview[i]?.color === 'w') {
          next.preview[i].color = random(next, COLOR_COUNT);
        }
      });
      if (next.closed.every(Boolean)) next.status = 'won';
    }
    if (next.version === 5) {
      if (!Array.isArray(next.preview) || next.preview.length !== COLUMNS ||
          !Array.isArray(next.closed) || next.closed.length !== COLUMNS) return null;
      next.preview = next.preview.map((incoming, i) =>
        next.closed[i] && incoming === null ? token(next, random(next, COLOR_COUNT)) : incoming);
      next.version = 6;
    }
    if (next.version === 6) {
      if (!Array.isArray(next.preview) || next.preview.length !== COLUMNS) return null;
      next.rows = [randomRow(next), next.preview, randomRow(next)];
      delete next.preview;
      delete next.changes;
      next.version = 8;
    }
    return valid(next) ? next : null;
  }
  const api = { CAPACITY, COLUMNS, COLOR_COUNT, ACTIVE_ROW, clone, create, rotate, shift, drop, settle, compatible, matchIndex, canRescue, bestColor, assess, valid, migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WoodGame = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
