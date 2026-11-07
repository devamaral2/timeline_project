const SVG_NS = "http://www.w3.org/2000/svg";

const form = document.querySelector("#scan-form");
const pathInput = document.querySelector("#path");
const scanButton = document.querySelector("#scan");
const statusEl = document.querySelector("#status");
const emptyEl = document.querySelector("#empty");
const reportEl = document.querySelector("#report");
const themeButton = document.querySelector("#theme");

let todos = [];
let sortKey = "path";
let sortDir = 1;

function svg(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function setState(mode, message) {
  form.classList.toggle("is-loading", mode === "loading");
  form.classList.toggle("is-error", mode === "error");
  form.setAttribute("aria-busy", mode === "loading" ? "true" : "false");
  scanButton.disabled = mode === "loading";
  statusEl.textContent = message;
}

function syncThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeButton.textContent = dark ? "Tema claro" : "Tema escuro";
  themeButton.setAttribute("aria-pressed", dark ? "true" : "false");
}

themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("reposcope-theme", next);
  syncThemeButton();
});

syncThemeButton();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const path = pathInput.value.trim();
  if (!path) {
    setState("error", "Informe a pasta a medir.");
    return;
  }
  setState("loading", "Medindo a pasta…");
  try {
    const response = await fetch(`/api/scan?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    if (!response.ok) {
      setState("error", data.error || "Não foi possível medir a pasta.");
      return;
    }
    render(data);
    setState("ready", "Leitura pronta.");
  } catch {
    setState("error", "O servidor não respondeu. Confira se o RepoScope ainda está no ar.");
  }
});

function render(data) {
  emptyEl.hidden = true;
  reportEl.hidden = false;
  document.querySelector("#n-files").textContent = String(data.files);
  document.querySelector("#n-lines").textContent = String(data.total_lines);
  document.querySelector("#n-marks").textContent = String(data.todos.length);
  document.querySelector("#n-authors").textContent = data.git.available
    ? String(data.git.authors.length)
    : "—";
  document.querySelector("#scanned-path").textContent = data.path;
  drawLanguages(data.by_language);
  drawWeeks(data.git);
  drawLargest(data.largest);
  todos = data.todos;
  document.querySelector("#todo-filter").value = "";
  drawTodos();
}

function drawLanguages(rows) {
  const chart = document.querySelector("#lang-chart");
  clear(chart);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((sum, row) => sum + row.lines, 0);
  if (rest > 0) top.push({ language: "Outras", lines: rest, files: 0 });
  const summary = top.length
    ? top.map((row) => `${row.language}: ${row.lines} linhas`).join(", ")
    : "Nenhuma linha de texto nesta pasta.";
  chart.setAttribute("aria-label", summary);
  if (!top.length) {
    const label = svg("text", { x: "0", y: "24", class: "chart-label" });
    label.textContent = "Nenhuma linha de texto nesta pasta.";
    chart.append(label);
    return;
  }
  const width = 640;
  const height = 250;
  const pad = { l: 44, r: 12, t: 16, b: 58 };
  const max = Math.max(...top.map((row) => row.lines), 1);
  const step = (width - pad.l - pad.r) / Math.max(top.length - 1, 1);
  const yAt = (value) => pad.t + (1 - value / max) * (height - pad.t - pad.b);
  const xAt = (index) => pad.l + (top.length === 1 ? (width - pad.l - pad.r) / 2 : index * step);

  chart.append(svg("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: height - pad.b, class: "chart-axis" }));
  chart.append(svg("line", { x1: pad.l, y1: height - pad.b, x2: width - pad.r, y2: height - pad.b, class: "chart-axis" }));
  for (const tick of [0, 0.5, 1]) {
    const y = yAt(max * tick);
    chart.append(svg("line", { x1: pad.l, y1: y, x2: width - pad.r, y2: y, class: "chart-grid" }));
    const label = svg("text", { x: "4", y: y + 4, class: "chart-label" });
    label.textContent = String(Math.round(max * tick));
    chart.append(label);
  }

  const points = top.map((row, index) => `${xAt(index)},${yAt(row.lines)}`).join(" ");
  if (top.length > 1) chart.append(svg("polyline", { points, class: "chart-line" }));
  top.forEach((row, index) => {
    chart.append(svg("circle", { cx: xAt(index), cy: yAt(row.lines), r: "4.5", class: "chart-dot" }));
    const label = svg("text", {
      x: xAt(index),
      y: height - 28,
      class: "chart-label",
      "text-anchor": "end",
      transform: `rotate(-40 ${xAt(index)} ${height - 28})`,
    });
    label.textContent = row.language.length > 14 ? `${row.language.slice(0, 13)}…` : row.language;
    chart.append(label);
  });
}

function drawWeeks(git) {
  const chart = document.querySelector("#week-chart");
  const note = document.querySelector("#git-note");
  clear(chart);
  if (!git.available) {
    chart.setAttribute("aria-label", git.reason);
    note.hidden = false;
    note.textContent = `Git indisponível: ${git.reason}.`;
    return;
  }
  note.hidden = true;
  const weeks = git.weeks;
  const total = weeks.reduce((sum, week) => sum + week.commits, 0);
  chart.setAttribute(
    "aria-label",
    `${total} commits nas últimas 12 semanas. ${git.authors
      .map((author) => `${author.name}: ${author.commits}`)
      .join(", ")}`,
  );
  const width = 640;
  const height = 250;
  const pad = { l: 28, r: 8, t: 12, b: 36 };
  const max = Math.max(...weeks.map((week) => week.commits), 1);
  const slot = (width - pad.l - pad.r) / weeks.length;
  chart.append(svg("line", {
    x1: pad.l,
    y1: height - pad.b,
    x2: width - pad.r,
    y2: height - pad.b,
    class: "chart-axis",
  }));
  weeks.forEach((week, index) => {
    const barHeight = (week.commits / max) * (height - pad.t - pad.b);
    const x = pad.l + index * slot + slot * 0.2;
    const y = height - pad.b - barHeight;
    chart.append(svg("rect", {
      x,
      y,
      width: slot * 0.6,
      height: Math.max(barHeight, week.commits ? 2 : 0),
      class: "chart-bar",
    }));
    if (index % 2 === 0) {
      const label = svg("text", {
        x: x + slot * 0.3,
        y: height - 16,
        class: "chart-label",
        "text-anchor": "middle",
      });
      const [, month, day] = week.start.split("-");
      label.textContent = `${day}/${month}`;
      chart.append(label);
    }
  });
}

function drawLargest(files) {
  const list = document.querySelector("#largest");
  clear(list);
  if (!files.length) {
    const item = document.createElement("li");
    item.className = "note";
    item.textContent = "Nenhum arquivo nesta pasta.";
    list.append(item);
    return;
  }
  const max = files[0].bytes || 1;
  files.forEach((file) => {
    const item = document.createElement("li");
    item.className = "file";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = file.path;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${formatBytes(file.bytes)} · ${file.lines} linhas`;
    const meter = document.createElement("div");
    meter.className = "meter";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(4, (file.bytes / max) * 100)}%`;
    meter.append(fill);
    item.append(name, meta, meter);
    list.append(item);
  });
}

function drawTodos() {
  const body = document.querySelector("#todo-body");
  const query = document.querySelector("#todo-filter").value.trim().toLowerCase();
  const filtered = todos
    .filter((row) => {
      if (!query) return true;
      return `${row.path} ${row.kind} ${row.text} ${row.line}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const left = sortKey === "line" ? a.line : String(a[sortKey]);
      const right = sortKey === "line" ? b.line : String(b[sortKey]);
      let diff = 0;
      if (typeof left === "number") diff = left - right;
      else diff = left.localeCompare(right, "pt");
      if (diff === 0) diff = a.path.localeCompare(b.path, "pt") || a.line - b.line;
      return diff * sortDir;
    });

  clear(body);
  document.querySelector("#todo-count").textContent = `${filtered.length} de ${todos.length}`;
  document.querySelector("#todo-empty").hidden = filtered.length > 0 || todos.length === 0;
  if (!todos.length) {
    document.querySelector("#todo-empty").hidden = false;
    document.querySelector("#todo-empty").textContent = "Nenhuma marca TODO, FIXME ou HACK.";
  } else if (!filtered.length) {
    document.querySelector("#todo-empty").textContent = "Nenhuma marca com esse filtro.";
  }

  document.querySelectorAll("th").forEach((cell) => {
    const key = cell.querySelector("button")?.dataset.sort;
    if (!key) return;
    cell.setAttribute("aria-sort", key === sortKey ? (sortDir === 1 ? "ascending" : "descending") : "none");
  });

  filtered.forEach((row) => {
    const tr = document.createElement("tr");
    const path = document.createElement("td");
    path.className = "path";
    path.textContent = row.path;
    const line = document.createElement("td");
    line.textContent = String(row.line);
    const kind = document.createElement("td");
    kind.className = `kind ${row.kind}`;
    kind.textContent = row.kind;
    const text = document.createElement("td");
    text.textContent = row.text;
    tr.append(path, line, kind, text);
    body.append(tr);
  });
}

document.querySelector("#todo-filter").addEventListener("input", drawTodos);

document.querySelectorAll("th button").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (sortKey === key) sortDir *= -1;
    else {
      sortKey = key;
      sortDir = 1;
    }
    drawTodos();
  });
});
