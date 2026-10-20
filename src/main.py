from models.tictactoe import TicTacToe
from algorithms.bot import bot_move

game = TicTacToe()

while not game.is_over():
    print(game)
    if game.current_player() == "X":
        try:
            game.move(int(input("pos: ")))
        except ValueError as e:
            print(e)
    else:
        try:
            game.move(bot_move(game, 2))
        except ValueError as e:
            print(e)

print(game)
w = game.winner()
print(f"winner: {w}" if w else "draw")