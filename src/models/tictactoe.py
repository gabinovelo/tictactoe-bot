class TicTacToe:

    WINNING_LINES = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),    # linhas
        (0, 3, 6), (1, 4, 7), (2, 5, 8),    # colunas
        (0, 4, 8), (2, 4, 6),               # diagonais
    ]

    def __init__(self):
        self._board = [" "] * 9
        self._current_player = "X"
        self._history = []  # pilha que guarda a ordem das jogadas      

    def current_player(self) -> str:
        return self._current_player

    def _switch_current_player(self) -> None:
        if self._current_player == "X":
            self._current_player = "O"
        else:
            self._current_player = "X" 

    def valid_positions(self) -> list[int]:
        valid_positions = []

        for i, position in enumerate(self._board):
            if position == " ":
                valid_positions.append(i)

        return valid_positions

    def move(self, position: int) -> None:

        if self.is_over():
            raise ValueError("the game is already over")

        if position not in self.valid_positions():
            raise ValueError(f"invalid position: {position}")

        self._board[position] = self._current_player
        self._history.append(position)
        self._switch_current_player()

    def undo(self) -> None:
        if not self._history:
            raise ValueError("no moves to undo")

        position = self._history.pop()
        self._board[position] = " "
        self._switch_current_player()

    def winner(self) -> str | None:

        for a, b, c in self.WINNING_LINES:
            if self._board[a] == self._board[b] == self._board[c] != " ":
                return self._board[a]

        return None

    def is_over(self) -> bool:
        return self.winner() is not None or " " not in self._board

    def __str__(self) -> str:
        t = self._board
        return (
            f" {t[0]} | {t[1]} | {t[2]}\n"
            "---+---+---\n"
            f" {t[3]} | {t[4]} | {t[5]}\n"
            "---+---+---\n"
            f" {t[6]} | {t[7]} | {t[8]}"
        )

if __name__ == "__main__":
    
    game = TicTacToe()
    while not game.is_over():
        try:
            game.move(int(input("pos: ")))
        except ValueError as e:
            print(f"Erro: {e}")

    w = game.winner()
    print(f"winner: {w}" if w else "draw")