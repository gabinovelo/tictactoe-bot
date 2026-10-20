from models.tictactoe import TicTacToe
import random

def score(game: TicTacToe, bot: str, depth: int) -> int:
    winner = game.winner()
    
    if winner == bot: return 10 + depth
    if winner is None: return 0
    return -10 - depth

def minimax(game: TicTacToe, bot: str, depth: int) -> int:
    if game.is_over():
        return score(game, bot, depth)

    if depth == 0:
        return 0

    maximizing = game.current_player() == bot
    scores = []

    for pos in game.valid_positions():
        game.move(pos)
        scores.append(minimax(game, bot, depth - 1))
        game.undo()

    return max(scores) if maximizing else min(scores)

def best_move(game: TicTacToe, depth: int) -> int:
    bot = game.current_player()
    positions = game.valid_positions()
    random.shuffle(positions)

    best_pos = None
    best_score = float("-inf")

    for pos in positions:
        game.move(pos)
        s = minimax(game, bot, depth - 1)
        game.undo()

        if s > best_score:
            best_score = s
            best_pos = pos

    return best_pos