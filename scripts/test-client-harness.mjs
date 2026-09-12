/**
 * Runtime harness for dsh-codex-tool-view.
 *
 * Loads lib/client.js the way DSH 0.1.5 loads a client bundle (window.__ModuleLoader__
 * factory-form CJS), mounts it with a ctx.effect-compatible context, and drives a
 * minimal DOM that answers exactly the selectors the plugin uses. Existing
 * `data-codex-tool-group` headers stand in for "the plugin already rendered", so a
 * scheduled render can be recognized without inspecting private state.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = fs.readFileSync(path.join(ROOT, "lib/client.js"), "utf8");

/** Base class the plugin's `instanceof HTMLElement` guards see. */
class FakeElement {}

/** Map a `data-x-y` attribute name to its `dataset.xY` key and back. */
const dataKey = (name) =>
  name
    .slice(5)
    .replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
const attributeName = (key) => `data-${key.replace(/[A-Z]/g, (chr) => `-${chr.toLowerCase()}`)}`;

/** A `dataset` view that reads and writes the real attributes, as the DOM's does. */
const datasetView = (element) =>
  new Proxy(
    {},
    {
      get: (_, key) => (typeof key === "string" ? element.attributes.get(attributeName(key)) : undefined),
      set: (_, key, value) => {
        element.setAttribute(attributeName(key), value);
        return true;
      },
      deleteProperty: (_, key) => {
        element.removeAttribute(attributeName(key));
        return true;
      },
      has: (_, key) => typeof key === "string" && element.attributes.has(attributeName(key)),
    },
  );

class FakeNode extends FakeElement {
  constructor(kind) {
    super();
    this.nodeKind = kind;
    this.parent = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = datasetView(this);
    this.listeners = new Map();
  }

  get parentElement() {
    return this.parent;
  }

  get ownerDocument() {
    return this.ownerDoc ?? null;
  }

  get tagName() {
    return (this.tag ?? "").toUpperCase();
  }

  get classList() {
    return this.attr("class").split(/\s+/).filter(Boolean);
  }

  attr(name) {
    return this.attributes.get(name) ?? "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.document?.notify(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    this.document?.notify(name);
  }

  append(...nodes) {
    for (const node of nodes) this.insertBefore(node, null);
  }

  appendChild(node) {
    this.insertBefore(node, null);
    return node;
  }

  removeChild(node) {
    node.remove();
    return node;
  }

  insertBefore(node, reference) {
    node.remove();
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    if (index < 0) throw new Error("insertBefore: reference node is not a child");
    this.children.splice(index, 0, node);
    node.parent = this;
    node.ownerDoc = this.ownerDoc ?? this;
    this.document?.notify();
  }

  remove() {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
    this.document?.notify();
  }

  get isConnected() {
    let node = this;
    while (node.parent !== null) node = node.parent;
    return node === this.document?.body || node === this.document?.documentElement;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler({ type, target: this, ...event });
  }

  click() {
    this.dispatch("click", { currentTarget: this });
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  }

  get scrollHeight() {
    return 0;
  }

  get clientHeight() {
    return 0;
  }

  matches(selector) {
    for (const part of selector.split(",")) {
      if (matchOne(this, part.trim())) return true;
    }
    return false;
  }

  closest(selector) {
    let node = this;
    while (node !== null) {
      if (node.nodeKind === "element" && node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.nodeKind === "element") {
          if (child.matches(selector)) out.push(child);
          walk(child);
        } else if (child.nodeKind === "text") {
          continue;
        }
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** Index assignment needs to invalidate any cached header lookup. */
  get document() {
    return this.ownerDoc ?? null;
  }
}

function childrenOf(node) {
  return node.children;
}

function matchOne(element, selector) {
  // Compound selectors such as `[data-turn-process][aria-expanded="true"]` are a
  // conjunction of simple selectors; the plugin relies on them.
  const compound = selector.match(/\[[^\]]+\]|\.[A-Za-z0-9_-]+|^[a-zA-Z][a-zA-Z0-9]*/g);
  if (compound !== null && compound.length > 1 && !selector.includes(" ")) {
    return compound.every((part) => matchSimple(element, part));
  }
  return matchSimple(element, selector);
}

function matchSimple(element, selector) {
  const idMatch = /^\[([a-zA-Z-]+)\]$/.exec(selector);
  if (idMatch !== null) return element.attributes.has(idMatch[1]);
  const eqMatch = /^\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(selector);
  if (eqMatch !== null) return element.getAttribute(eqMatch[1]) === eqMatch[2];
  const prefixMatch = /^\[([a-zA-Z-]+)\^="([^"]*)"\]$/.exec(selector);
  if (prefixMatch !== null) return (element.getAttribute(prefixMatch[1]) ?? "").startsWith(prefixMatch[2]);
  if (selector.startsWith(".")) return element.classList.includes(selector.slice(1));
  const tag = /^[a-zA-Z][a-zA-Z0-9]*$/.exec(selector);
  if (tag !== null) return element.tag === selector.toLowerCase() || element.tag === selector;
  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    const last = parts.at(-1);
    if (!matchOne(element, last)) return false;
    let node = element.parent;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      let found = false;
      while (node !== null) {
        if (node.nodeKind === "element" && matchOne(node, parts[index])) {
          found = true;
          node = node.parent;
          break;
        }
        node = node.parent;
      }
      if (!found) return false;
    }
    return true;
  }
  return false;
}

const createElement = (tag) => {
  const element = new FakeNode("element");
  element.tag = String(tag).toLowerCase();
  return element;
};

const createTextNode = (text) => {
  const node = new FakeNode("text");
  node.textContent = String(text);
  return node;
};

class FakeDocument extends FakeNode {
  constructor() {
    super("document");
    this.ownerDoc = this;
    this.documentElement = createElement("html");
    this.head = createElement("head");
    this.body = createElement("body");
    this.scrollingElement = this.documentElement;
    this.documentElement.ownerDoc = this;
    this.head.ownerDoc = this;
    this.body.ownerDoc = this;
    this.documentElement.append(this.head, this.body);
    this._observer = null;
    this._pending = false;
    this._pendingAttributes = new Set();
  }

  createElement(tag) {
    const element = createElement(tag);
    element.ownerDoc = this;
    return element;
  }

  createTextNode(text) {
    const node = createTextNode(text);
    node.ownerDoc = this;
    return node;
  }

  get defaultView() {
    return globalThis.window;
  }

  /** A real document's queries walk its element tree, rooted at <html>. */
  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  /** Depth-first text-node walker, the shape the plugin's prose probe consumes. */
  createTreeWalker(root) {
    const nodes = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.nodeKind === "text") nodes.push(child);
        else walk(child);
      }
    };
    walk(root);
    let index = 0;
    return {
      nextNode() {
        const node = nodes[index] ?? null;
        index += 1;
        return node;
      },
    };
  }

  /** Schedule one microtask-batched notification, like a MutationObserver callback. */
  notify(attribute) {
    if (attribute !== undefined) this._pendingAttributes.add(attribute);
    if (this._pending) return;
    this._pending = true;
    queueMicrotask(() => {
      this._pending = false;
      const attributes = new Set(this._pendingAttributes);
      this._pendingAttributes.clear();
      this.body._observer?.fire(attributes);
    });
  }
}

class FakeObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target, options = {}) {
    this.target = target;
    this.options = options;
    target._observer = this;
  }

  disconnect() {
    if (this.target !== undefined) this.target._observer = null;
  }

  /**
   * Report one mutation batch. `attributeFilter` narrows which attribute records
   * are delivered; a batch whose only records are filtered out is dropped, which
   * keeps the plugin's own `data-codex-*` writes from re-triggering a render while
   * a `hidden` toggle still re-renders the transcript.
   */
  fire(attributes = new Set()) {
    const filter = this.options?.attributeFilter;
    if (attributes.size > 0 && filter !== undefined && ![...attributes].some((name) => filter.includes(name))) {
      return;
    }
    this.callback([], this);
  }
}

const installGlobals = (document) => {
  globalThis.document = document;
  globalThis.HTMLElement = FakeElement;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.MutationObserver = FakeObserver;
  globalThis.window = {
    document,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    getComputedStyle: () => ({ overflowY: "visible" }),
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key, value) {
        this.store.set(key, String(value));
      },
    },
    __ModuleLoader__: {
      load(record) {
        globalThis.__pluginRecord = record;
      },
    },
  };
};

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * Load the client bundle and mount it.
 * @returns the mounted document, the plugin exports, and the disposer.
 */
export async function mountPlugin() {
  const document = new FakeDocument();
  installGlobals(document);
  new Function(SOURCE)();
  const record = globalThis.__pluginRecord;
  if (record === undefined) throw new Error("client bundle did not call __ModuleLoader__.load");
  const plugin = record.factory((spec) => {
    throw new Error(`unexpected require(${spec})`);
  });
  const disposers = [];
  const ctx = {
    effect(factory) {
      disposers.push(factory());
    },
  };
  plugin.apply(ctx);
  await flush();
  return {
    document,
    plugin,
    dispose() {
      for (const disposer of disposers) disposer?.();
    },
  };
}

/** Append one flow row to the transcript column. */
export function addRow(document, { kind, key, tools = [], state, think = false, prose }) {
  const column = document.body.querySelector("[data-chat-column]") ?? (() => {
    const created = document.createElement("div");
    created.setAttribute("data-chat-column", "true");
    document.body.append(created);
    return created;
  })();
  const row = document.createElement("div");
  row.setAttribute("data-chat-flow-kind", kind);
  if (key !== undefined) row.setAttribute("data-chat-flow-key", key);
  if (think) {
    const reason = document.createElement("div");
    reason.setAttribute("data-variant", "think");
    reason.append(document.createTextNode("考虑一下"));
    row.append(reason);
  }
  if (prose !== undefined) {
    const body = document.createElement("p");
    body.append(document.createTextNode(prose));
    row.append(body);
  }
  for (const name of tools) {
    const tool = document.createElement("div");
    tool.setAttribute("data-tool", name);
    tool.setAttribute("data-state", state ?? "ok");
    row.append(tool);
  }
  column.append(row);
  document.notify();
  return { column, row };
}

/** Collect the rendered group headers of a column. */
export function headers(column) {
  return column.querySelectorAll("[data-codex-tool-group]").map((group) => ({
    key: group.getAttribute("data-codex-tool-group"),
    expanded: group.getAttribute("data-expanded") === "true",
    error: group.getAttribute("data-has-error") === "true",
    title: group.querySelector("[data-codex-tool-group-title]")?.textContent ?? "",
    detail: group.querySelector("[data-codex-tool-group-detail]")?.textContent ?? "",
    button: group.querySelector("[data-codex-tool-group-main]"),
  }));
}

export { flush };
