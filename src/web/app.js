// Interface do jogo da velha. Só desenha e envia ações: regras, vitória e
// jogadas do bot vêm sempre da API.

const $ = (id) => document.getElementById(id);

const el = {
  board: $("board"), status: $("status"), stats: $("stats"), analysisNote: $("analysis-note"),
  newMatch: $("new-match"), level: $("level"),
  gear: $("gear"), panel: $("panel"), backdrop: $("backdrop"), closePanel: $("close-panel"),
  dark: $("dark"), alphabeta: $("alphabeta"),
  showTree: $("show-tree"), showAnalysis: $("show-analysis"),
  showStats: $("show-stats"), tiebreak: $("tiebreak"),
  bvb: $("bvb"), bvbLevels: $("bvb-levels"), xLevel: $("x-level"), oLevel: $("o-level"),
  treePanel: $("tree-panel"), treeViewport: $("tree-viewport"),
  treeCanvas: $("tree-canvas"), treeInfo: $("tree-info"),
  treeLegend: $("tree-legend"),
  treeMessage: $("tree-message"), treeFullscreen: $("tree-fullscreen"),
  treePlayerTab: $("tree-player-tab"), treeBotTab: $("tree-bot-tab"),
};

const radio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

let levels = [];        // níveis do bot, vindos de GET /config
let state = null;       // último estado recebido da API
let pendingCell = null; // casa clicada enquanto o bot pensa (só visual)
let analysis = null;    // valores do minimax para o estado atual
let busy = false;       // há uma requisição de jogada em andamento
let token = 0;          // muda a cada nova partida; descarta respostas antigas
let version = 0;        // muda a cada estado novo; descarta análises antigas
let drawn = Array(9).fill(" "); // o que já estava na tela (para animar só o novo)
let activeTree = "player";      // árvore exibida: "player" ou "bot"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// medidas compartilhadas com o CSS da árvore
const TREE = { nodeW: 120, nodeH: 112, gapX: 18, levelH: 142, pad: 24 };
const pan = {
  x: 0, y: 0, width: 0, height: 0,
  dragging: false, startX: 0, startY: 0, originX: 0, originY: 0,
};

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `erro ${res.status}`);
  return data;
}

// ---------- modo escuro (só no navegador) ----------

function loadDark() {
  try {
    const saved = localStorage.getItem("ttt-dark");
    if (saved !== null) return saved === "1";
  } catch { /* sem storage */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDark(on, save) {
  document.documentElement.classList.toggle("dark", on);
  if (save) {
    try { localStorage.setItem("ttt-dark", on ? "1" : "0"); } catch { /* sem storage */ }
  }
}

// ---------- árvore habilitada no menu ----------

function loadShowTree() {
  try {
    const saved = localStorage.getItem("ttt-show-tree");
    if (saved !== null) return saved === "1";
  } catch { /* sem storage */ }
  return false;
}

function applyShowTree(on, save) {
  el.treePanel.hidden = !on;
  if (save) {
    try { localStorage.setItem("ttt-show-tree", on ? "1" : "0"); } catch { /* sem storage */ }
  }
  if (on) {
    updateTreeTabs();
    renderTree(state);
  }
}

// ---------- desenho ----------

const SVG_NS = "http://www.w3.org/2000/svg";

function markSvg(symbol, extraClass = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", `mark ${symbol.toLowerCase()} ${extraClass}`);
  svg.setAttribute("aria-hidden", "true");
  if (symbol === "X") {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M22 22 78 78M78 22 22 78");
    svg.append(path);
  } else {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "30");
    svg.append(circle);
  }
  return svg;
}

function symbolSpan(symbol) {
  const span = document.createElement("span");
  span.className = `sym-${symbol.toLowerCase()}`;
  span.textContent = symbol;
  return span;
}

function dots() {
  const span = document.createElement("span");
  span.className = "dots";
  span.setAttribute("aria-hidden", "true");
  span.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  return span;
}

function humanSymbol() {
  if (!state) return radio("symbol");
  const players = state.settings.players;
  return Object.keys(players).find((s) => players[s] === "human") || null;
}

// devolve uma lista de pedaços (texto ou elementos) para a linha de status
function statusParts() {
  if (!state) return ["Começando", dots()];
  const human = humanSymbol();
  const players = state.settings.players;

  if (state.over) {
    if (state.draw) return ["Empate"];
    if (!human) return [symbolSpan(state.winner), ` (nível ${players[state.winner]}) venceu`];
    return [state.winner === human ? "Você venceu!" : "O bot venceu"];
  }
  if (state.human_turn && pendingCell === null) return ["Sua vez ", symbolSpan(human)];
  if (!human) {
    const p = state.current_player;
    return [symbolSpan(p), ` nível ${players[p]} pensando`, dots()];
  }
  return ["Bot pensando", dots()];
}

function statsText() {
  const s = state && state.last_bot_stats;
  if (!s) return "";
  if (s.random_move) return "Última jogada do bot: aleatória (erro do nível), sem busca";
  const visited = s.states_visited.toLocaleString("pt-BR");
  const ms = s.elapsed_ms < 10 ? s.elapsed_ms.toFixed(1) : Math.round(s.elapsed_ms);
  return `${visited} estados visitados · profundidade ${s.depth} · ${ms} ms`;
}

function render() {
  const board = state ? [...state.board] : Array(9).fill(" ");
  const human = humanSymbol();
  if (pendingCell !== null) board[pendingCell] = human;

  const canPlay = state && state.human_turn && !busy;
  const line = state && state.winning_line;

  el.board.replaceChildren(...board.map((mark, i) => {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    const playable = canPlay && mark === " ";
    cell.disabled = !playable;

    if (mark !== " ") {
      cell.append(markSvg(mark));
      if (drawn[i] !== mark) cell.classList.add("placed");
      cell.setAttribute("aria-label", `Casa ${i + 1}: ${mark}`);
    } else if (playable && analysis && i in analysis) {
      // A API devolve o valor na perspectiva de quem joga (o humano). A tela
      // mostra o score do bot, mas mantém as cores na perspectiva do jogador.
      const humanValue = analysis[i];
      const botValue = -humanValue;
      const kind = humanValue > 0 ? "win" : humanValue < 0 ? "loss" : "draw";
      const result = {
        win: "vitória sua",
        draw: "empate",
        loss: "derrota sua",
      }[kind];
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = formatScore(botValue);
      cell.append(value);
      cell.classList.add(`eval-${kind}`);
      cell.title = `Score do bot: ${formatScore(botValue)} — ${result}`;
      cell.setAttribute(
        "aria-label",
        `Casa ${i + 1}: vazia, score do bot ${formatScore(botValue)}, ${result}`,
      );
    } else {
      if (playable) cell.append(markSvg(human, "ghost"));
      cell.setAttribute("aria-label", `Casa ${i + 1}: vazia`);
    }

    if (state && i === state.last_bot_move && pendingCell === null && !state.over) {
      cell.classList.add("last");
    }
    if (line) cell.classList.add(line.includes(i) ? "winning" : "faded");

    cell.addEventListener("click", () => playHuman(i));
    return cell;
  }));
  drawn = board;

  el.analysisNote.hidden = !(analysis && canPlay && state && !state.over);
  el.status.classList.remove("error");
  el.status.replaceChildren(...statusParts());

  const stats = el.showStats.checked ? statsText() : "";
  el.stats.textContent = stats;
  el.stats.hidden = !stats;

  el.level.disabled = el.bvb.checked;
  el.level.title = el.bvb.checked ? "No modo bot contra bot, os níveis ficam no painel" : "";
  el.bvbLevels.hidden = !el.bvb.checked;
  // quem começa e símbolo não se aplicam ao bot contra bot
  document.querySelectorAll('input[name="starter"], input[name="symbol"]')
    .forEach((input) => { input.disabled = el.bvb.checked; });
}

// ---------- árvore de busca ----------

function formatScore(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

function setTreeMessage(text) {
  el.treeCanvas.replaceChildren();
  el.treeCanvas.style.transform = "";
  el.treeInfo.textContent = "";
  el.treeMessage.textContent = text;
  el.treeMessage.hidden = false;
  pan.width = 0;
  pan.height = 0;
}

function miniBoard(board) {
  const mini = document.createElement("div");
  mini.className = "mini-board";
  for (let i = 0; i < 9; i++) {
    const mark = Array.isArray(board) ? board[i] : " ";
    const cell = document.createElement("span");
    cell.className = mark === "X" ? "mini-x" : mark === "O" ? "mini-o" : "mini-empty";
    cell.textContent = mark === "X" || mark === "O" ? mark : "·";
    mini.append(cell);
  }
  return mini;
}

function turnSymbol(board) {
  const first = state && state.settings ? state.settings.first_player : "X";
  const marks = Array.isArray(board) ? board : [];
  const x = marks.filter((mark) => mark === "X").length;
  const o = marks.filter((mark) => mark === "O").length;
  if (first === "X") return x === o ? "X" : "O";
  return o === x ? "O" : "X";
}

function turnLabel(data, human) {
  if (human) return data.player === "MIN" ? "MIN · Sua Vez" : "MAX · Vez do Bot";
  // Bot contra bot: não há humano, então identifica o símbolo da vez.
  return `Vez do ${turnSymbol(data.board)}`;
}

function treeNode(data, item, score, human) {
  const node = document.createElement("div");
  node.className = "tree-node";
  if (item.parent === null) node.classList.add("root");

  // O backend pontua sempre a favor do bot. Na tela, invertemos apenas a
  // leitura visual: score negativo = sucesso do humano; positivo = ameaça.
  const displayScore = human ? -score : score;

  if (data.terminal) {
    node.classList.add("terminal");
    node.classList.add(displayScore > 0 ? "win" : displayScore < 0 ? "loss" : "draw");
  } else if (data.cutoff) {
    node.classList.add("cutoff");
  }

  node.style.left = `${TREE.pad + item.x}px`;
  node.style.top = `${TREE.pad + item.depth * TREE.levelH}px`;
  node.style.width = `${TREE.nodeW}px`;
  node.style.height = `${TREE.nodeH}px`;

  const head = document.createElement("div");
  head.className = "node-head";
  const label = turnLabel(data, human);
  const player = document.createElement("span");
  player.className = "node-player";
  player.textContent = label;
  const value = document.createElement("span");
  value.className = "node-score";
  value.textContent = formatScore(score);
  head.append(player, value);

  const foot = document.createElement("div");
  foot.className = "node-foot";
  const move = Number.isInteger(data.move) ? `jogada ${data.move}` : "raiz";
  const kind = data.terminal ? "fim" : data.cutoff ? "limite" : `${data.children.length} filhos`;
  foot.textContent = `${move} · ${kind}`;

  const result = !data.terminal
    ? "não terminal"
    : score === 0
      ? "empate"
      : human
        ? (score > 0 ? "derrota para você" : "vitória para você")
        : (score > 0 ? "vitória do bot" : "derrota do bot");
  node.title = `${label}: score do bot ${score} (${result})`;
  node.setAttribute("aria-label", node.title);

  node.append(head, miniBoard(data.board), foot);
  return node;
}

function applyPan() {
  const margin = 80;
  const vw = el.treeViewport.clientWidth;
  const vh = el.treeViewport.clientHeight;
  pan.x = Math.min(vw - margin, Math.max(margin - pan.width, pan.x));
  pan.y = Math.min(vh - margin, Math.max(margin - pan.height, pan.y));
  el.treeCanvas.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}

function renderTree(current) {
  if (el.treePanel.hidden) return;

  const human = humanSymbol();
  el.treeLegend.textContent = human
    ? "Números: score do bot (MAX). Cores: verde = você vence; vermelho = bot vence."
    : "Números: score do bot de referência (MAX). Cores: verde = ele vence; vermelho = ele perde.";

  const fromBot = activeTree === "bot";
  const tree = current && (fromBot ? current.last_bot_tree : current.current_tree);
  if (!tree) {
    const status = current
      ? (fromBot ? current.last_bot_tree_status : current.current_tree_status)
      : "none";
    if (status === "too_large") {
      setTreeMessage("Árvore muito grande para exibir. Ela aparece quando restarem 5 ou menos casas vazias.");
    } else if (status === "random_move") {
      setTreeMessage("A última jogada do bot foi aleatória (erro do nível), então não houve busca para exibir.");
    } else if (status === "game_over") {
      setTreeMessage("A partida terminou; não há jogadas futuras para analisar.");
    } else if (status === "none") {
      setTreeMessage(current ? "Aguardando o bot jogar…" : "Aguardando a partida começar…");
    } else {
      setTreeMessage("Aguardando a próxima jogada…");
    }
    return;
  }

  el.treeMessage.hidden = true;
  el.treeCanvas.replaceChildren();

  // posiciona as folhas da esquerda para a direita e centraliza cada pai
  const nodes = [];
  let nextLeafX = 0;

  function visit(data, depth, parent) {
    const index = nodes.length;
    nodes.push({ data, depth, parent, x: 0 });
    const children = Array.isArray(data.children) ? data.children : [];

    if (children.length === 0) {
      nodes[index].x = nextLeafX;
      nextLeafX += TREE.nodeW + TREE.gapX;
    } else {
      const indexes = children.map((child) => visit(child, depth + 1, index));
      const first = nodes[indexes[0]].x;
      const last = nodes[indexes[indexes.length - 1]].x;
      nodes[index].x = (first + last) / 2;
    }
    return index;
  }

  visit(tree, 0, null);

  const maxDepth = nodes.reduce((max, item) => Math.max(max, item.depth), 0);
  const contentW = Math.max(TREE.nodeW, nextLeafX - TREE.gapX);
  const width = contentW + TREE.pad * 2;
  const height = maxDepth * TREE.levelH + TREE.nodeH + TREE.pad * 2;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tree-edges");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  for (let i = 1; i < nodes.length; i++) {
    const item = nodes[i];
    const parent = nodes[item.parent];
    const x1 = TREE.pad + parent.x + TREE.nodeW / 2;
    const y1 = TREE.pad + parent.depth * TREE.levelH + TREE.nodeH;
    const x2 = TREE.pad + item.x + TREE.nodeW / 2;
    const y2 = TREE.pad + item.depth * TREE.levelH;
    const midY = (y1 + y2) / 2;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    svg.append(path);
  }
  el.treeCanvas.append(svg);

  const fragment = document.createDocumentFragment();
  for (const item of nodes) {
    const score = Number(item.data.score) || 0;
    fragment.append(treeNode(item.data, item, score, human));
  }
  el.treeCanvas.append(fragment);

  el.treeInfo.textContent =
    `${nodes.length} nós · profundidade ${maxDepth} · arraste para navegar`;

  // começa com a raiz visível no topo; o restante é alcançado arrastando
  pan.width = width;
  pan.height = height;
  pan.x = el.treeViewport.clientWidth / 2 - (TREE.pad + nodes[0].x + TREE.nodeW / 2);
  pan.y = 18 - TREE.pad;
  applyPan();
}

function updateTreeTabs() {
  const human = state ? humanSymbol() : radio("symbol");
  el.treePlayerTab.textContent = human ? "Suas opções" : "Próxima jogada";

  const tabs = [[el.treePlayerTab, "player"], [el.treeBotTab, "bot"]];
  for (const [tab, kind] of tabs) {
    const active = activeTree === kind;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
}

function setActiveTree(kind) {
  if (kind !== "player" && kind !== "bot") return;
  activeTree = kind;
  updateTreeTabs();
  renderTree(state);
}

function toggleTreeFullscreen(force) {
  const on = typeof force === "boolean"
    ? force
    : !el.treePanel.classList.contains("is-fullscreen");

  el.treePanel.classList.toggle("is-fullscreen", on);
  document.body.classList.toggle("tree-fullscreen", on);
  el.treeFullscreen.setAttribute("aria-pressed", String(on));
  el.treeFullscreen.setAttribute(
    "aria-label",
    on ? "Sair da tela cheia" : "Expandir árvore para toda a tela",
  );
  el.treeFullscreen.title = on ? "Sair da tela cheia" : "Tela cheia";

  renderTree(state);
  if (on) el.treeFullscreen.focus();
}

function setupTreePan() {
  const viewport = el.treeViewport;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pan.dragging = true;
    pan.startX = event.clientX;
    pan.startY = event.clientY;
    pan.originX = pan.x;
    pan.originY = pan.y;
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pan.dragging) return;
    pan.x = pan.originX + event.clientX - pan.startX;
    pan.y = pan.originY + event.clientY - pan.startY;
    applyPan();
  });

  const stop = (event) => {
    if (!pan.dragging) return;
    pan.dragging = false;
    viewport.classList.remove("dragging");
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };
  viewport.addEventListener("pointerup", stop);
  viewport.addEventListener("pointercancel", stop);
}

function setState(next) {
  state = next;
  pendingCell = null;
  analysis = null;
  version++;
  render();
  updateTreeTabs();
  renderTree(state);
  loadAnalysis();
}

function showError(err) {
  el.status.classList.add("error");
  el.status.textContent = `Erro: ${err.message}`;
}

// ---------- ações ----------

function matchSettings() {
  const search = { random_tiebreak: el.tiebreak.checked };
  if (el.bvb.checked) {
    return {
      mode: "bot_vs_bot",
      x_level: Number(el.xLevel.value),
      o_level: Number(el.oLevel.value),
      ...search,
    };
  }
  return {
    mode: "human_vs_bot",
    level: Number(el.level.value),
    human_symbol: radio("symbol"),
    human_starts: radio("starter") === "human",
    ...search,
  };
}

// atraso visual antes de mostrar a jogada do bot (não afeta o algoritmo)
function botDelay() {
  const ms = Number(radio("speed"));
  return el.bvb.checked ? Math.max(ms, 250) : ms;
}

async function newMatch() {
  const my = ++token;
  state = null;
  pendingCell = null;
  analysis = null;
  busy = true;
  renderTree(null);
  render();

  try {
    const settings = matchSettings();
    const botStarts = settings.mode === "human_vs_bot" && !settings.human_starts;
    const [next] = await Promise.all([
      api("POST", "/matches", settings),
      sleep(botStarts ? botDelay() : 0),
    ]);
    if (my !== token) return;
    busy = false;
    setState(next);
    if (settings.mode === "bot_vs_bot") runBotVsBot(my);
  } catch (err) {
    if (my !== token) return;
    busy = false;
    showError(err);
  }
}

async function playHuman(position) {
  if (!state || !state.human_turn || busy) return;
  const my = token;
  busy = true;
  pendingCell = position;
  render();

  try {
    const [next] = await Promise.all([
      api("POST", `/matches/${state.id}/moves`, { position }),
      sleep(botDelay()),
    ]);
    if (my !== token) return;
    busy = false;
    setState(next);
  } catch (err) {
    if (my !== token) return;
    busy = false;
    pendingCell = null;
    render();
    showError(err);
  }
}

async function runBotVsBot(my) {
  while (my === token && state && !state.over) {
    try {
      const [next] = await Promise.all([
        api("POST", `/matches/${state.id}/bot-moves`),
        sleep(botDelay()),
      ]);
      if (my !== token) return;
      setState(next);
    } catch (err) {
      if (my === token) showError(err);
      return;
    }
  }
}

async function loadAnalysis() {
  if (!el.showAnalysis.checked || !state || !state.human_turn) return;
  const v = version;
  try {
    const data = await api("GET", `/matches/${state.id}/analysis`);
    if (v !== version) return; // o estado mudou enquanto calculava
    analysis = data.values;
    render();
  } catch (err) {
    if (v === version) showError(err);
  }
}

// ---------- painel ----------

function togglePanel(open) {
  el.panel.hidden = !open;
  el.backdrop.hidden = !open;
  el.gear.setAttribute("aria-expanded", String(open));
  if (open) el.closePanel.focus();
  else el.gear.focus();
}

// ---------- inicialização ----------

function fillLevels(select, value) {
  select.replaceChildren(...levels.map((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = `Nível ${n}`;
    return opt;
  }));
  select.value = value;
}

async function init() {
  el.dark.checked = loadDark();
  applyDark(el.dark.checked, false);

  let config;
  try {
    config = await api("GET", "/config");
  } catch (err) {
    showError(err);
    return;
  }

  levels = config.levels;
  fillLevels(el.level, 2);
  fillLevels(el.xLevel, 4);
  fillLevels(el.oLevel, 4);

  // só aparecem as opções que a API diz suportar
  document.querySelectorAll("[data-option]").forEach((node) => {
    node.hidden = !config.options[node.dataset.option];
  });

  el.showTree.checked = config.options.show_tree && loadShowTree();
  applyShowTree(el.showTree.checked, false);

  // mudanças que afetam a partida ou a busca começam uma partida nova
  const restarting = [el.level, el.alphabeta, el.tiebreak, el.bvb, el.xLevel, el.oLevel,
    ...document.querySelectorAll('input[name="starter"], input[name="symbol"]')];
  restarting.forEach((input) => input.addEventListener("change", newMatch));

  // opções só de exibição
  el.dark.addEventListener("change", () => applyDark(el.dark.checked, true));
  el.showTree.addEventListener("change", () => applyShowTree(el.showTree.checked, true));
  el.showStats.addEventListener("change", render);
  el.showAnalysis.addEventListener("change", () => {
    if (el.showAnalysis.checked) loadAnalysis();
    else { analysis = null; render(); }
  });

  el.newMatch.addEventListener("click", newMatch);
  setupTreePan();
  el.treeFullscreen.addEventListener("click", () => toggleTreeFullscreen());
  el.treePlayerTab.addEventListener("click", () => setActiveTree("player"));
  el.treeBotTab.addEventListener("click", () => setActiveTree("bot"));
  updateTreeTabs();
  el.gear.addEventListener("click", () => togglePanel(el.panel.hidden));
  el.closePanel.addEventListener("click", () => togglePanel(false));
  el.backdrop.addEventListener("click", () => togglePanel(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (el.treePanel.classList.contains("is-fullscreen")) {
      toggleTreeFullscreen(false);
    } else if (!el.panel.hidden) {
      togglePanel(false);
    }
  });

  newMatch();
}

init();
