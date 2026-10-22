from models.tictactoe import TicTacToe
import random


def score(game: TicTacToe, bot: str, depth: int) -> int:
    winner = game.winner()

    if winner == bot:
        return 10 + depth
    if winner is None:
        return 0
    return -10 - depth


def _new_node(game: TicTacToe, bot: str, move: int | None = None) -> dict:
    """Cria um nó da árvore com o estado atual do tabuleiro."""
    return {
        "board": game.board(),
        "player": "MAX" if game.current_player() == bot else "MIN",
        "move": move,
        "score": 0,
        "terminal": game.is_over(),
        "cutoff": False,
        "children": [],
    }


def minimax(
    game: TicTacToe,
    bot: str,
    depth: int,
    node: dict | None = None,
) -> int:
    """Calcula o valor minimax e, opcionalmente, preenche a árvore da busca.

    Quando `node` é passado, o dicionário recebe o tabuleiro, de quem é a vez
    (MAX/MIN), o score e a lista de filhos. Sem `node`, o comportamento e o
    custo são os mesmos de antes.
    """
    if node is not None:
        node["board"] = game.board()
        node["player"] = "MAX" if game.current_player() == bot else "MIN"
        node["terminal"] = game.is_over()

    if game.is_over():
        result = score(game, bot, depth)
        if node is not None:
            node["score"] = result
        return result

    if depth == 0:
        if node is not None:
            node["score"] = 0
            node["cutoff"] = True
        return 0

    maximizing = game.current_player() == bot
    scores = []

    for pos in game.valid_positions():
        game.move(pos)
        child = _new_node(game, bot, pos) if node is not None else None
        if node is not None:
            node["children"].append(child)

        scores.append(minimax(game, bot, depth - 1, child))
        game.undo()

    result = max(scores) if maximizing else min(scores)
    if node is not None:
        node["score"] = result
    return result


def build_position_tree(game: TicTacToe, bot: str, depth: int = 9) -> dict:
    """Monta a árvore completa a partir da posição atual do tabuleiro.

    Diferente de `search_root`, aqui não escolhemos uma jogada: a raiz é o
    estado atual e todos os filhos são as possibilidades de quem deve jogar.
    Os scores continuam do ponto de vista de `bot`.
    """
    node = _new_node(game, bot)
    minimax(game, bot, depth, node)
    return node


def search_root(
    game: TicTacToe,
    depth: int,
    random_tiebreak: bool = True,
    build_tree: bool = False,
) -> tuple[int, dict | None]:
    """Escolhe a jogada da raiz e, se pedido, devolve a árvore completa.

    A raiz representa a vez do bot (MAX). Cada filho é uma jogada possível,
    avaliada pelo minimax com a profundidade restante.
    """
    bot = game.current_player()
    positions = game.valid_positions()

    if random_tiebreak:
        random.shuffle(positions)

    root = _new_node(game, bot) if build_tree else None
    best_pos = None
    best_score = float("-inf")

    for pos in positions:
        game.move(pos)
        child = _new_node(game, bot, pos) if root is not None else None
        if root is not None:
            root["children"].append(child)

        value = minimax(game, bot, depth - 1, child)
        game.undo()

        if value > best_score:
            best_pos = pos
            best_score = value

    if root is not None:
        root["score"] = 0 if best_pos is None else best_score

    return best_pos, root


def best_move(game: TicTacToe, depth: int) -> int:
    position, _ = search_root(game, depth)
    return position
