import random
from models.tictactoe import TicTacToe
from algorithms.search import choose_move
from algorithms.stats import SearchStats

LEVELS = {
    1: {"depth": 1, "error": 0.0},
    2: {"depth": 2, "error": 0.25},
    3: {"depth": 9, "error": 0.10},
    4: {"depth": 9, "error": 0.0},
}

def bot_move(
    game: TicTacToe,
    level: int,
    random_tiebreak: bool = True,
    stats: SearchStats | None = None,
) -> int:
    if level not in LEVELS:
        raise ValueError(f"invalid level: {level}")

    config = LEVELS[level]

    if random.random() < config["error"]:
        if stats is not None:
            stats.random_move = True
        return random.choice(game.valid_positions())

    return choose_move(game, config["depth"], random_tiebreak, stats)
