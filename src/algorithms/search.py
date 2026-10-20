"""Usos do minimax pela interface, sem alterar minimax.py."""
import time

from models.tictactoe import TicTacToe
from algorithms.minimax import best_move, minimax
from algorithms.stats import CountingGame, SearchStats


def choose_move(
    game: TicTacToe,
    depth: int,
    random_tiebreak: bool = True,
    stats: SearchStats | None = None,
) -> int:
    """Como best_move, mas com estatísticas e desempate opcional.

    Com random_tiebreak=True chama o próprio best_move. Desligado, avalia as
    casas em ordem e fica com a primeira de maior valor (bot previsível).
    """
    start = time.perf_counter()
    counter = CountingGame(game)
    positions = game.valid_positions()

    if random_tiebreak:
        pos = best_move(counter, depth)
    else:
        bot = game.current_player()
        pos, best_score = None, float("-inf")
        for p in positions:
            counter.move(p)
            s = minimax(counter, bot, depth - 1)
            counter.undo()
            if s > best_score:
                pos, best_score = p, s

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
