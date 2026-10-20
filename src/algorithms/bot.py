import random
from models.tictactoe import TicTacToe
from algorithms.minimax import best_move

LEVELS = {
    1: {"depth": 1, "error": 0.0},
    2: {"depth": 2, "error": 0.25},
    3: {"depth": 9, "error": 0.10},
    4: {"depth": 9, "error": 0.0},
}

def bot_move(game: TicTacToe, level: int) -> int:
    config = LEVELS[level]

    if random.random() < config["error"]:
        return random.choice(game.valid_positions())
    
    return best_move(game, config["depth"])