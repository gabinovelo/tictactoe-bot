// Interface do jogo da velha. Só desenha e envia ações: regras, vitória e
// jogadas do bot vêm sempre da API.

const $ = (id) => document.getElementById(id);

const el = {
  board: $("board"), status: $("status"), stats: $("stats"),
  newMatch: $("new-match"), level: $("level"),
  gear: $("gear"), panel: $("panel"), backdrop: $("backdrop"), closePanel: $("close-panel"),
  dark: $("dark"), alphabeta: $("alphabeta"),
  showAnalysis: $("show-analysis"), showStats: $("show-stats"), tiebreak: $("tiebreak"),
  bvb: $("bvb"), bvbLevels: $("bvb-levels"), xLevel: $("x-level"), oLevel: $("o-level"),
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      const v = analysis[i];
      const kind = v > 0 ? "win" : v < 0 ? "loss" : "draw";
      const label = { win: "vitória", draw: "empate", loss: "derrota" }[kind];
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";
      cell.append(value);
      cell.classList.add(`eval-${kind}`);
      cell.title = `Minimax: ${v} (${label} para você)`;
      cell.setAttribute("aria-label", `Casa ${i + 1}: vazia, minimax ${v}, ${label}`);
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

function setState(next) {
  state = next;
  pendingCell = null;
  analysis = null;
  version++;
  render();
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

  // mudanças que afetam a partida ou a busca começam uma partida nova
  const restarting = [el.level, el.alphabeta, el.tiebreak, el.bvb, el.xLevel, el.oLevel,
    ...document.querySelectorAll('input[name="starter"], input[name="symbol"]')];
  restarting.forEach((input) => input.addEventListener("change", newMatch));

  // opções só de exibição
  el.dark.addEventListener("change", () => applyDark(el.dark.checked, true));
  el.showStats.addEventListener("change", render);
  el.showAnalysis.addEventListener("change", () => {
    if (el.showAnalysis.checked) loadAnalysis();
    else { analysis = null; render(); }
  });

  el.newMatch.addEventListener("click", newMatch);
  el.gear.addEventListener("click", () => togglePanel(el.panel.hidden));
  el.closePanel.addEventListener("click", () => togglePanel(false));
  el.backdrop.addEventListener("click", () => togglePanel(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.panel.hidden) togglePanel(false);
  });

  newMatch();
}

init();
