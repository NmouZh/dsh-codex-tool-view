/**
 * Behavioural tests for the client bundle, run against the minimal DOM in
 * test-client-harness.mjs. Each test asserts one guarantee the plugin makes on a
 * DSH 0.1.5-rc.2 transcript.
 */
import assert from "node:assert/strict";
import { addRow, addTurnProcessRow, flush, headers, mountPlugin } from "./test-client-harness.mjs";

const check = async (name, run) => {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    process.exitCode = 1;
  }
};

await check("groups consecutive same-phase tools into one header", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const readA = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  const readB = addRow(document, { kind: "tool-call", key: "t2", tools: ["read"] });
  await flush();
  const list = headers(readA.column);
  assert.equal(list.length, 1, `expected 1 header, got ${list.length}`);
  assert.equal(list[0].title, "读取了文件");
  assert.equal(list[0].detail, "2 项");
  assert.equal(list[0].expanded, false, "completed groups default to collapsed");
  assert.equal(readA.row.getAttribute("data-codex-trace-hidden"), "true");
  assert.equal(readB.row.getAttribute("data-codex-trace-hidden"), "true");
});

await check("classifies the current DSH tool names", async () => {
  const cases = [
    [["bash", "pwsh"], "运行了命令"],
    [["grep", "glob", "web_search"], "搜索了代码"],
    [["write", "edit", "run_code"], "编辑了文件"],
    [["web_fetch"], "访问了网页"],
    [["todo_write"], "更新了计划"],
    [["subagent"], "调用了子任务"],
    [["unknown_tool"], "使用了工具"],
  ];
  for (const [tools, title] of cases) {
    const { document } = await mountPlugin();
    addRow(document, { kind: "user", key: "u1" });
    const first = addRow(document, { kind: "tool-call", key: "t1", tools: [tools[0]] });
    for (const [index, name] of tools.slice(1).entries()) {
      addRow(document, { kind: "tool-call", key: `t${index + 2}`, tools: [name] });
    }
    await flush();
    const list = headers(first.column);
    assert.equal(list.length, 1, `${tools.join("+")} should form one header`);
    assert.equal(list[0].title, title, `${tools.join("+")} -> ${list[0].title}`);
  }
});

await check("splits phases that are not adjacent", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const first = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  addRow(document, { kind: "tool-call", key: "t2", tools: ["bash"] });
  addRow(document, { kind: "tool-call", key: "t3", tools: ["read"] });
  await flush();
  const list = headers(first.column);
  assert.deepEqual(
    list.map((item) => item.title),
    ["读取了文件", "运行了命令", "读取了文件"],
  );
});

await check("keeps a running group open and reports progress", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const running = addRow(document, { kind: "tool-call", key: "t1", tools: ["bash"], state: "running" });
  await flush();
  const list = headers(running.column);
  assert.equal(list[0].title, "正在运行命令");
  assert.equal(list[0].expanded, true);
  assert.equal(running.row.getAttribute("data-codex-trace-member"), "true");
});

await check("opens a failed group and shows the error title", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const failed = addRow(document, { kind: "tool-call", key: "t1", tools: ["bash"], state: "error" });
  await flush();
  const list = headers(failed.column);
  assert.equal(list[0].title, "执行过程中出现错误");
  assert.equal(list[0].error, true);
  assert.equal(list[0].expanded, true);
});

await check("collapses and re-expands a finished group on click", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const first = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  await flush();
  const [header] = headers(first.column);
  header.button.click();
  assert.equal(header.button.getAttribute("aria-expanded"), "true");
  assert.equal(first.row.getAttribute("data-codex-trace-hidden"), null);
  assert.equal(first.row.getAttribute("data-codex-trace-member"), "true");
  header.button.click();
  assert.equal(header.button.getAttribute("aria-expanded"), "false");
  assert.equal(first.row.getAttribute("data-codex-trace-hidden"), "true");
});

await check("does not add headers over rows the native Turn-process already hides", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const first = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  await flush();
  assert.equal(headers(first.column).length, 1, "expanded Turn must keep the header");

  // DSH hides a folded Turn's members with `hidden="until-found"` and shows its own
  // button with the same counts; the plugin must yield the fold to it.
  const nativeButton = document.createElement("button");
  nativeButton.setAttribute("data-turn-process", "1");
  nativeButton.setAttribute("aria-expanded", "false");
  first.row.setAttribute("hidden", "until-found");
  await flush();
  assert.equal(headers(first.column).length, 0, "folded Turn must not keep an empty header");
  assert.equal(first.row.closest("[hidden]") !== null, true);
});

await check("hands the Turn back to its native control when the last group collapses", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const first = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  await flush();
  // A native disclosure control really toggles its own state, so the plugin's
  // handback must produce a folded Turn rather than an endless re-click.
  const nativeButton = document.createElement("button");
  let expanded = true;
  nativeButton.setAttribute("data-turn-process", "1");
  nativeButton.setAttribute("aria-expanded", "true");
  let clicked = 0;
  nativeButton.addEventListener("click", () => {
    clicked += 1;
    expanded = !expanded;
    nativeButton.setAttribute("aria-expanded", String(expanded));
    if (expanded) for (const row of [first.row]) row.removeAttribute("hidden");
    else for (const row of [first.row]) row.setAttribute("hidden", "until-found");
  });
  first.column.insertBefore(nativeButton, first.column.children[0]);
  first.row.removeAttribute("hidden");

  const [header] = headers(first.column);
  header.button.click(); // expand the group
  assert.equal(first.row.getAttribute("data-codex-trace-hidden"), null);
  header.button.click(); // collapse it again -> the Turn has nothing left to show
  assert.equal(clicked, 1, "collapsing the last visible group must fold the native disclosure");
  assert.equal(nativeButton.getAttribute("aria-expanded"), "false");
  assert.equal(first.row.getAttribute("hidden"), "until-found");
});

await check("hides trace-only assistant steps but keeps prose rows", async () => {
  const { document } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const traceOnly = addRow(document, { kind: "assistant-step", key: "a1", think: true });
  await flush();
  assert.equal(traceOnly.row.getAttribute("data-codex-trace-hidden"), "true");
  assert.equal(
    traceOnly.row.querySelector('[data-variant="think"]').getAttribute("data-codex-final-think-hidden"),
    "true",
  );

  const withProse = addRow(document, {
    kind: "assistant-step",
    key: "a2",
    think: true,
    prose: "这是一段足够长的说明文字，用来判断该步骤是否需要保留在阅读流中，而不是被折叠进工具轨迹。",
  });
  await flush();
  assert.equal(withProse.row.getAttribute("data-codex-trace-hidden"), null, "prose rows stay visible");
});

await check("summarises a folded Turn on the native disclosure row", async () => {
  const { document } = await mountPlugin();
  const { button, column } = addTurnProcessRow(document, { turn: 1 });
  addRow(document, { kind: "user", key: "u1", turn: 1 });
  addRow(document, { kind: "tool-call", key: "t1", tools: ["read"], turn: 1, hidden: true });
  addRow(document, { kind: "tool-call", key: "t2", tools: ["read"], turn: 1, hidden: true });
  addRow(document, { kind: "tool-call", key: "t3", tools: ["bash"], turn: 1, hidden: true });
  await flush();
  assert.equal(
    button.getAttribute("data-codex-phase-summary"),
    "读取 2 · 命令 1",
    "folded Turn must read as its phase mix",
  );
  assert.equal(headers(column).length, 0, "a folded Turn still gets no group headers");
});

await check("swaps the folded summary for headers when the Turn opens", async () => {
  const { document } = await mountPlugin();
  const { button, column } = addTurnProcessRow(document, { turn: 1, expanded: true });
  addRow(document, { kind: "tool-call", key: "t1", tools: ["read"], turn: 1 });
  addRow(document, { kind: "tool-call", key: "t2", tools: ["bash"], turn: 1 });
  await flush();
  assert.equal(button.getAttribute("data-codex-phase-summary"), null, "an open Turn carries no summary");
  assert.deepEqual(
    headers(column).map((item) => item.title),
    ["读取了文件", "运行了命令"],
  );

  button.click(); // fold the Turn again
  await flush();
  assert.equal(button.getAttribute("data-codex-phase-summary"), "读取 1 · 命令 1");
  assert.equal(headers(column).length, 0, "headers yield to the folded native row");
});

await check("folds the phase tail away when a Turn is very mixed", async () => {
  const { document } = await mountPlugin();
  const { button } = addTurnProcessRow(document, { turn: 1 });
  addRow(document, { kind: "user", key: "u1", turn: 1 });
  for (const [index, name] of ["read", "bash", "grep", "write", "web_fetch", "todo_write"].entries()) {
    addRow(document, { kind: "tool-call", key: `t${String(index)}`, tools: [name], turn: 1, hidden: true });
  }
  await flush();
  assert.equal(
    button.getAttribute("data-codex-phase-summary"),
    "读取 1 · 命令 1 · 搜索 1 · 编辑 1 · …",
  );
});

await check("removes every decoration when disposed", async () => {
  const { document, dispose } = await mountPlugin();
  addRow(document, { kind: "user", key: "u1" });
  const first = addRow(document, { kind: "tool-call", key: "t1", tools: ["read"] });
  await flush();
  assert.equal(headers(first.column).length, 1);
  dispose();
  assert.equal(document.body.querySelectorAll("[data-codex-tool-group]").length, 0);
  assert.equal(document.body.querySelectorAll("[data-codex-trace-hidden]").length, 0);
  assert.equal(document.body.querySelectorAll("[data-codex-trace-member]").length, 0);
  assert.equal(document.body.querySelectorAll("[data-codex-phase-summary]").length, 0);
  assert.equal(document.head.querySelectorAll('style[data-plugin="dsh-codex-tool-view"]').length, 0);
});

console.log(process.exitCode === 1 ? "\nsome checks failed" : "\nall checks passed");
