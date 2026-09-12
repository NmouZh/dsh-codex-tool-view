window.__ModuleLoader__.load({ id: "dsh-codex-tool-view", factory: (require) => {
  const module = { exports: {} };
  const exports = module.exports;

  const PLUGIN_ID = "dsh-codex-tool-view";
  const EXPANDED_KEY = "dsh-codex-tool-view.expanded";
  const PHASE_META = {
    thinking: { title: "思考过程", running: "正在思考", unit: "段" },
    edits: { title: "编辑了文件", running: "正在编辑文件", unit: "项" },
    commands: { title: "运行了命令", running: "正在运行命令", unit: "条" },
    reads: { title: "读取了文件", running: "正在读取文件", unit: "项" },
    searches: { title: "搜索了代码", running: "正在搜索代码", unit: "项" },
    web: { title: "访问了网页", running: "正在访问网页", unit: "项" },
    agents: { title: "调用了子任务", running: "正在调用子任务", unit: "项" },
    planning: { title: "更新了计划", running: "正在更新计划", unit: "项" },
    context: { title: "处理了上下文", running: "正在处理上下文", unit: "项" },
    system: { title: "执行了系统操作", running: "正在执行系统操作", unit: "项" },
    tools: { title: "使用了工具", running: "正在使用工具", unit: "项" }
  };
  // DSH names each tool row by its wire tool name (`data-tool`), so the phase map
  // tracks the current tool registry first and keeps older aliases for other builds.
  // Current DSH: bash/pwsh (commands), read/read_image/web_fetch (reads),
  // grep/glob/web_search (searches), write/edit/run_code (edits), todo/task/subagent.
  const TOOL_PHASES = new Map([
    ["bash", "commands"], ["pwsh", "commands"], ["shell", "commands"],
    ["powershell", "commands"], ["exec", "commands"], ["exec_command", "commands"],
    ["run_command", "commands"],
    ["read", "reads"], ["read_image", "reads"], ["read_file", "reads"],
    ["read_many_files", "reads"],
    ["grep", "searches"], ["glob", "searches"], ["web_search", "searches"],
    ["find", "searches"], ["search", "searches"], ["search_files", "searches"],
    ["write", "edits"], ["edit", "edits"], ["run_code", "edits"],
    ["write_file", "edits"], ["apply_patch", "edits"], ["str_replace_editor", "edits"],
    ["create_file", "edits"],
    ["web_fetch", "web"], ["open_url", "web"], ["fetch", "web"],
    ["todo_write", "planning"], ["todo", "planning"], ["update_plan", "planning"],
    ["task", "agents"], ["subagent", "agents"], ["spawn_agent", "agents"],
    ["subagent_fork", "agents"], ["send_message", "agents"],
    ["wait_agent", "agents"], ["list_agents", "agents"],
    ["cordis_package_inspect", "reads"], ["cordis_runtime_inspect", "reads"],
    ["cordis_define", "edits"], ["cordis_run", "commands"], ["cordis_stop", "commands"],
    ["cordis_undefine", "commands"]
  ]);

  const STYLE = String.raw`
body [data-codex-trace-hidden="true"] {
  display: none !important;
}

body [data-codex-final-think-hidden="true"] {
  display: none !important;
}

body [data-codex-trace-member="true"] {
  position: relative;
  padding-inline-start: 12px;
}

body [data-codex-trace-member="true"]::before {
  content: "";
  position: absolute;
  inset-block: 2px;
  inset-inline-start: 1px;
  width: 1px;
  border-radius: 1px;
  background: var(--dsw-alias-border-l2);
}

body [data-codex-tool-group] {
  width: fit-content;
  max-width: 100%;
  display: flex;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 22px;
}

body [data-codex-tool-group][data-has-error="true"] {
  color: var(--dsw-alias-state-error-primary);
}

body [data-codex-tool-group-main] {
  width: auto;
  max-width: 100%;
  min-width: 0;
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}

body [data-codex-tool-group-main]:hover,
body [data-codex-tool-group-main]:focus-visible {
  outline: none;
  background: var(--dsw-alias-interactive-bg-hover);
}

body [data-codex-tool-group-icon] {
  width: 16px;
  height: 16px;
  flex: none;
  display: inline-grid;
  place-items: center;
  color: var(--dsw-alias-label-tertiary);
}

body [data-codex-tool-group-icon] svg {
  width: 14px;
  height: 14px;
}

body [data-codex-tool-group-copy] {
  min-width: 0;
  flex: 0 1 auto;
  display: flex;
  align-items: baseline;
  gap: 7px;
}

body [data-codex-tool-group-title] {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-weight: 500;
}

body [data-codex-tool-group-detail] {
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

body [data-codex-tool-group-chevron] {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transform: rotate(0deg);
  transition: transform 120ms ease;
}

body [data-codex-tool-group][data-expanded="true"] [data-codex-tool-group-chevron] {
  transform: rotate(90deg);
}

@media (max-width: 700px) {
  body [data-codex-tool-group-copy] {
    gap: 5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  body [data-codex-tool-group-main],
  body [data-codex-tool-group-chevron] {
    transition: none;
  }
}
`;

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private or locked-down browser profiles may reject storage.
    }
  }

  function loadExpanded() {
    try {
      const value = JSON.parse(safeStorageGet(EXPANDED_KEY) ?? "{}");
      return value !== null && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function saveExpanded(expanded) {
    const entries = Object.entries(expanded).slice(-200);
    safeStorageSet(EXPANDED_KEY, JSON.stringify(Object.fromEntries(entries)));
  }

  function directFlowRows(parent) {
    return Array.from(parent.children).filter((child) =>
      child instanceof HTMLElement && child.dataset.chatFlowKind !== undefined
    );
  }

  function flowParents(document2) {
    const parents = new Set();
    for (const row of document2.querySelectorAll("[data-chat-flow-kind]")) {
      if (row.parentElement !== null) parents.add(row.parentElement);
    }
    return parents;
  }

  function isRunning(row) {
    return row.querySelector('[data-state="running"]') !== null;
  }

  // DSH folds a Turn's process behind its native turn-process disclosure, which
  // hides the member rows with `hidden="until-found"`. Group headers must follow
  // that state, otherwise a collapsed Turn would show headers with nothing under
  // them.
  function rowVisible(row) {
    if (row.closest("[hidden]") !== null) return false;
    return row.getAttribute("data-codex-trace-hidden") !== "true";
  }

  function hasError(row) {
    return row.dataset.chatFlowKind === "turn-error" ||
      row.querySelector('[data-state="error"], [data-error]') !== null;
  }

  function toolNames(rows) {
    const names = [];
    for (const row of rows) {
      for (const tool of row.querySelectorAll("[data-tool]")) {
        const name = tool.getAttribute("data-tool");
        if (name !== null && name !== "") names.push(name);
      }
    }
    return names;
  }

  function assistantProse(row) {
    if (row.dataset.chatFlowKind !== "assistant-step") return { text: "", structured: false };
    const nodeFilter = row.ownerDocument.defaultView?.NodeFilter ?? NodeFilter;
    const walker = row.ownerDocument.createTreeWalker(row, nodeFilter.SHOW_TEXT);
    const parts = [];
    let textNode = walker.nextNode();
    while (textNode !== null) {
      const parent = textNode.parentElement;
      if (textNode.textContent?.trim() && parent?.closest('[data-variant="think"]') === null) {
        parts.push(textNode.textContent.trim());
      }
      textNode = walker.nextNode();
    }
    const structured = Array.from(row.querySelectorAll("h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote, hr"))
      .some((element) => element.closest('[data-variant="think"]') === null);
    return { text: parts.join(" ").replace(/\s+/g, " ").trim(), structured };
  }

  function hasSubstantiveAssistantProse(row) {
    const prose = assistantProse(row);
    const hanCount = (prose.text.match(/[\u3400-\u9fff]/g) ?? []).length;
    return prose.structured || hanCount >= 12 || prose.text.length >= 600;
  }

  function groupKey(phase, rows, ordinal) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    return [
      first?.dataset.chatFlowKey ?? first?.dataset.chatAnchorKey ?? "start",
      last?.dataset.chatFlowKey ?? last?.dataset.chatAnchorKey ?? "end",
      phase,
      String(ordinal)
    ].join(":");
  }

  function rowPhase(row) {
    if (row.dataset.chatFlowKind === "assistant-step") {
      const prose = assistantProse(row);
      if (hasSubstantiveAssistantProse(row)) return null;
      if (row.querySelector('[data-variant="think"]') !== null || prose.text !== "") return "thinking";
    }

    const tools = toolNames([row]);
    if (tools.length > 0) {
      const phases = new Set(tools.map((name) => TOOL_PHASES.get(name.toLowerCase()) ?? "tools"));
      return phases.size === 1 ? phases.values().next().value : "tools";
    }

    const kind = row.dataset.chatFlowKind;
    if (kind === "command") return "commands";
    if (kind === "context") return "context";
    if (["manual-compaction", "compaction", "model-retry"].includes(kind ?? "")) return "system";
    return null;
  }

  function phaseText(phase, rows) {
    const meta = PHASE_META[phase] ?? PHASE_META.tools;
    const running = rows.some(isRunning);
    const toolCount = toolNames(rows).length;
    const count = toolCount > 0 ? toolCount : rows.length;
    return {
      title: running ? meta.running : meta.title,
      detail: count > 1 ? `${count} ${meta.unit}` : ""
    };
  }

  /**
   * The open native Turn-process control in one flow container. DSH keeps that
   * control as a sibling of the members it hides, so the container is the anchor
   * for "this Turn is folded behind its own disclosure".
   */
  function openTurnProcessButton(container) {
    const button = container.querySelector('[data-turn-process][aria-expanded="true"]');
    return button instanceof HTMLElement ? button : null;
  }

  function scrollParent(element) {
    let parent = element.parentElement;
    while (parent !== null) {
      const style = window.getComputedStyle(parent);
      if (parent.scrollHeight > parent.clientHeight + 1 && ["auto", "scroll"].includes(style.overflowY)) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.scrollingElement;
  }

  function iconMarkup(phase) {
    if (phase === "edits") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 11.8.4-2.6 6.8-6.8a1.4 1.4 0 0 1 2 2L5.4 11.2l-2.4.6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    }
    if (phase === "commands") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1.75" y="2.5" width="12.5" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="m4.25 6 2 2-2 2M8.5 10h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (phase === "reads") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.25h5l3 3v8.5H4v-11.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 2.5v3h3M6 8h4M6 10.5h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';
    }
    if (phase === "searches" || phase === "web") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.25" stroke="currentColor" stroke-width="1.2"/><path d="m10.25 10.25 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    }
    if (phase === "thinking") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.75c.35 2.7 1.55 3.9 4.25 4.25C9.55 6.35 8.35 7.55 8 10.25 7.65 7.55 6.45 6.35 3.75 6 6.45 5.65 7.65 4.45 8 1.75Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M12.25 10c.15 1.15.6 1.6 1.75 1.75-1.15.15-1.6.6-1.75 1.75-.15-1.15-.6-1.6-1.75-1.75 1.15-.15 1.6-.6 1.75-1.75Z" fill="currentColor"/></svg>';
    }
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4.25h6.5M3 8h10M3 11.75h7.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><circle cx="12.25" cy="4.25" r="1.25" stroke="currentColor" stroke-width="1.2"/></svg>';
  }

  function chevronMarkup() {
    return '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function collectPhaseGroups(rows) {
    const groups = [];
    const silentRows = [];
    const finalAssistantRows = new Set();
    const substantiveAssistantRows = new Set(rows.filter(hasSubstantiveAssistantProse));
    let current = null;
    let pendingThinking = [];

    let turnStart = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const kind = rows[index]?.dataset.chatFlowKind;
      if (kind === "user" || kind === "steering") turnStart = index + 1;
      if (kind !== "turn-tail") continue;
      for (let candidate = index - 1; candidate >= turnStart; candidate -= 1) {
        if (rows[candidate]?.dataset.chatFlowKind === "assistant-step") {
          finalAssistantRows.add(rows[candidate]);
          break;
        }
      }
      turnStart = index + 1;
    }

    const flush = () => {
      if (current !== null && current.rows.length > 0) groups.push(current);
      current = null;
    };

    const discardPendingThinking = () => {
      silentRows.push(...pendingThinking);
      pendingThinking = [];
    };

    for (const row of rows) {
      if (finalAssistantRows.has(row)) {
        flush();
        discardPendingThinking();
        continue;
      }
      const phase = rowPhase(row);
      if (phase === "context") {
        silentRows.push(row);
        continue;
      }
      if (phase === "thinking") {
        flush();
        pendingThinking.push(row);
        continue;
      }
      if (phase === null) {
        flush();
        discardPendingThinking();
        continue;
      }
      if (current === null) {
        current = { phase, rows: [...pendingThinking, row] };
        pendingThinking = [];
        continue;
      }
      if (current.phase !== phase || pendingThinking.length > 0) {
        flush();
        current = { phase, rows: [...pendingThinking, row] };
        pendingThinking = [];
        continue;
      }
      current.rows.push(row);
    }
    flush();
    discardPendingThinking();
    return { groups, silentRows, finalAssistantRows, substantiveAssistantRows };
  }

  function mount(document2) {
    const style = document2.createElement("style");
    style.dataset.plugin = PLUGIN_ID;
    style.textContent = STYLE;
    document2.head.appendChild(style);

    const expanded = loadExpanded();
    let observer;
    let renderTask = 0;
    let disposed = false;

    const clearDecorations = () => {
      for (const group of document2.querySelectorAll("[data-codex-tool-group]")) group.remove();
      for (const row of document2.querySelectorAll("[data-codex-trace-hidden], [data-codex-trace-member]")) {
        delete row.dataset.codexTraceHidden;
        delete row.dataset.codexTraceMember;
      }
      for (const node of document2.querySelectorAll("[data-codex-final-think-hidden]")) {
        delete node.dataset.codexFinalThinkHidden;
      }
    };

    const render = () => {
      renderTask = 0;
      if (disposed) return;
      observer.disconnect();
      clearDecorations();

      for (const parent of flowParents(document2)) {
        const rows = directFlowRows(parent);
        const { groups, silentRows, finalAssistantRows, substantiveAssistantRows } = collectPhaseGroups(rows);
        const carriedByNative = rows.some((row) => row.closest("[hidden]") !== null);
        for (const row of silentRows) row.dataset.codexTraceHidden = "true";
        // A hidden trace row still renders its nested Think view, and a row kept
        // for its prose must not show the reasoning that produced it. Both cases
        // hide that one child instead of the row.
        const thinkHiddenRows = new Set([...finalAssistantRows, ...substantiveAssistantRows, ...silentRows]);
        for (const row of thinkHiddenRows) {
          for (const think of row.querySelectorAll('[data-variant="think"]')) {
            think.dataset.codexFinalThinkHidden = "true";
          }
        }
        groups.forEach(({ phase, rows: rowsInGroup }, ordinal) => {
          const first = rowsInGroup[0];
          if (first === undefined || first.parentElement !== parent) return;
          // The native Turn-process disclosure owns folding while a Turn is
          // collapsed; a header over rows it already hides would be an empty row.
          if (carriedByNative) return;
          const key = groupKey(phase, rowsInGroup, ordinal);
          const error = rowsInGroup.some(hasError);
          const running = rowsInGroup.some(isRunning);
          const open = error || running || expanded[key] === true;
          const text = phaseText(phase, rowsInGroup);

          const group = document2.createElement("div");
          group.dataset.codexToolGroup = key;
          group.dataset.expanded = String(open);
          group.dataset.hasError = String(error);

          const main = document2.createElement("button");
          main.type = "button";
          main.dataset.codexToolGroupMain = "true";
          main.setAttribute("aria-expanded", String(open));
          main.setAttribute("aria-label", open ? "折叠工具轨迹" : "展开工具轨迹");

          const icon = document2.createElement("span");
          icon.dataset.codexToolGroupIcon = "true";
          icon.innerHTML = iconMarkup(phase);

          const copy = document2.createElement("span");
          copy.dataset.codexToolGroupCopy = "true";
          const title = document2.createElement("span");
          title.dataset.codexToolGroupTitle = "true";
          title.textContent = error ? "执行过程中出现错误" : text.title;
          const detail = document2.createElement("span");
          detail.dataset.codexToolGroupDetail = "true";
          detail.textContent = text.detail;
          copy.append(title, detail);

          const chevron = document2.createElement("span");
          chevron.dataset.codexToolGroupChevron = "true";
          chevron.innerHTML = chevronMarkup();

          main.append(icon, copy, chevron);
          main.addEventListener("click", () => {
            if (error || running) return;

            const scroller = scrollParent(main);
            const anchorTop = main.getBoundingClientRect().top;
            const nextOpen = group.dataset.expanded !== "true";
            expanded[key] = nextOpen;
            saveExpanded(expanded);
            group.dataset.expanded = String(nextOpen);
            main.setAttribute("aria-expanded", String(nextOpen));
            main.setAttribute("aria-label", nextOpen ? "折叠工具轨迹" : "展开工具轨迹");

            for (const row of rowsInGroup) {
              if (nextOpen) {
                delete row.dataset.codexTraceHidden;
                row.dataset.codexTraceMember = "true";
              } else {
                delete row.dataset.codexTraceMember;
                row.dataset.codexTraceHidden = "true";
              }
            }

            // Collapsing this group can leave the open native Turn-process
            // disclosure with nothing to show. Hand the fold back to its own
            // control instead of leaving headers with no content under them.
            if (!nextOpen) {
              const native = openTurnProcessButton(parent);
              if (native !== null) native.click();
            }

            const restoreAnchor = () => {
              if (scroller === null || !main.isConnected) return;
              const offset = main.getBoundingClientRect().top - anchorTop;
              if (Math.abs(offset) > 0.5) scroller.scrollTop += offset;
            };
            restoreAnchor();
            window.setTimeout(restoreAnchor, 0);
          });

          group.append(main);
          parent.insertBefore(group, first);

          for (const row of rowsInGroup) {
            if (open) row.dataset.codexTraceMember = "true";
            else row.dataset.codexTraceHidden = "true";
          }
        });
      }

      observer.observe(document2.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "data-chat-flow-kind", "hidden"]
      });
    };

    function schedule() {
      if (disposed || renderTask !== 0) return;
      renderTask = window.setTimeout(render, 0);
    }

    observer = new MutationObserver(schedule);
    observer.observe(document2.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-chat-flow-kind", "hidden"]
    });
    schedule();

    return () => {
      disposed = true;
      if (renderTask !== 0) window.clearTimeout(renderTask);
      observer.disconnect();
      clearDecorations();
      style.remove();
    };
  }

  const name = PLUGIN_ID;
  // The grouping decorates the chat transcript, so wait for the slot service that
  // owns chat rendering before mounting.
  const inject = ["slots"];

  function apply(ctx) {
    ctx.effect(() => mount(document), `${PLUGIN_ID}: native chat trace grouping`);
  }

  exports.apply = apply;
  exports.inject = inject;
  exports.name = name;
  return module.exports;
} });
