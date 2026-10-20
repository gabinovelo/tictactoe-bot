from dataclasses import dataclass, asdict

from models.tictactoe import TicTacToe


@dataclass
class SearchStats:
    """Números de uma busca, preenchidos por choose_move e bot_move."""

    states_visited: int = 0   # chamadas de minimax (cada uma é um estado)
    depth: int = 0            # profundidade efetivamente usada
    elapsed_ms: float = 0.0
    random_move: bool = False # True se o bot "errou" de propósito e não buscou

    def to_dict(self) -> dict:
        return asdict(self)


class CountingGame:
    """Envolve um TicTacToe e conta as jogadas feitas nele.

    Serve para medir a busca sem alterar o minimax: cada chamada de minimax
    acontece logo depois de um move(), então contar os move() é contar os
    estados visitados. Todo o resto é repassado para o jogo original.
    """

    def __init__(self, game: TicTacToe):
        self._game = game
        self.moves = 0

    def move(self, position: int) -> None:
        self.moves += 1
        self._game.move(position)

    def __getattr__(self, name):
        return getattr(self._game, name)
