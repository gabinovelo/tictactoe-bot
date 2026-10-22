"""Usos do minimax pela interface, sem alterar minimax.py."""
import time

from models.tictactoe import TicTacToe
from algorithms.minimax import minimax, search_root
from algorithms.stats import CountingGame, SearchStats


def choose_move(
    game: TicTacToe,
    depth: int,
    random_tiebreak: bool = True,
    stats: SearchStats | None = None,
    tree_out: dict | None = None,
) -> int:
    """Escolhe a jogada do bot, com estatísticas e árvore opcional.

    `tree_out`, quando passado, é preenchido com a árvore da busca (raiz,
    filhos, tabuleiros, scores e nós terminais). Sem ele, nada é construído.
    """
    start = time.perf_counter()
    counter = CountingGame(game)
    positions = game.valid_positions()

    pos, root = search_root(
        counter,
        depth,
        random_tiebreak=random_tiebreak,
        build_tree=tree_out is not None,
    )
    if tree_out is not None and root is not None:
        tree_out.update(root)

    if stats is not None:
        stats.states_visited = counter.moves
        stats.depth = min(depth, len(positions))
        stats.elapsed_ms = (time.perf_counter() - start) * 1000

    return pos


def evaluate_moves(game: TicTacToe, depth: int = 9) -> dict[int, int]:
    """Valor do minimax de cada casa vazia, do ponto de vista de quem joga agora."""
    player = game.current_player()
    values = {}

    for pos in game.valid_positions():
        game.move(pos)
        values[pos] = minimax(game, player, depth - 1)
        game.undo()

    return values
