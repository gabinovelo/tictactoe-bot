import threading
import uuid

from models.tictactoe import TicTacToe
from algorithms.bot import LEVELS, bot_move
from algorithms.search import evaluate_moves
from algorithms.stats import SearchStats

HUMAN = "human"


class Match:
    """Uma partida: quem controla cada símbolo, as opções da busca e o jogo.

    `players` diz quem joga com cada símbolo: "human" ou um nível do bot.
    Com um humano, o bot responde sozinho depois de cada jogada dele.
    Sem humano (bot contra bot), cada jogada do bot é pedida com play_bot().
    """

    def __init__(
        self,
        players: dict[str, str | int],
        first_player: str = "X",
        random_tiebreak: bool = True,
    ):
        if set(players) != {"X", "O"}:
            raise ValueError("players must define X and O")
        for who in players.values():
            if who != HUMAN and who not in LEVELS:
                raise ValueError(f"invalid level: {who}")
        if list(players.values()).count(HUMAN) > 1:
            raise ValueError("at most one human player")

        self.id = uuid.uuid4().hex
        self._players = dict(players)
        self._random_tiebreak = random_tiebreak
        self._game = TicTacToe(first_player)
        self._first_player = first_player
        self._last_bot_move: int | None = None
        self._last_bot_stats: SearchStats | None = None
        # o servidor atende requisições em paralelo, e o minimax mexe no
        # tabuleiro (move/undo): só uma operação por vez em cada partida
        self._lock = threading.Lock()

        with self._lock:
            self._play_bots_until_human()

    @classmethod
    def human_vs_bot(
        cls,
        level: int,
        human_symbol: str = "X",
        human_starts: bool = True,
        random_tiebreak: bool = True,
    ) -> "Match":
        if human_symbol not in ("X", "O"):
            raise ValueError(f"invalid symbol: {human_symbol}")
        bot_symbol = "O" if human_symbol == "X" else "X"
        return cls(
            {human_symbol: HUMAN, bot_symbol: level},
            human_symbol if human_starts else bot_symbol,
            random_tiebreak,
        )

    @classmethod
    def bot_vs_bot(
        cls,
        x_level: int,
        o_level: int,
        random_tiebreak: bool = True,
    ) -> "Match":
        return cls({"X": x_level, "O": o_level}, "X", random_tiebreak)

    def _has_human(self) -> bool:
        return HUMAN in self._players.values()

    def _is_human_turn(self) -> bool:
        return self._players[self._game.current_player()] == HUMAN

    def _play_bot_once(self) -> None:
        stats = SearchStats()
        level = self._players[self._game.current_player()]
        pos = bot_move(self._game, level, self._random_tiebreak, stats)
        self._game.move(pos)
        self._last_bot_move = pos
        self._last_bot_stats = stats

    def _play_bots_until_human(self) -> None:
        if not self._has_human():
            return
        while not self._game.is_over() and not self._is_human_turn():
            self._play_bot_once()

    def play_human(self, position: int) -> None:
        with self._lock:
            if self._game.is_over():
                raise ValueError("the game is already over")
            if not self._is_human_turn():
                raise ValueError("it is not the human's turn")
            self._game.move(position)
            self._play_bots_until_human()

    def play_bot(self) -> None:
        with self._lock:
            if self._game.is_over():
                raise ValueError("the game is already over")
            if self._is_human_turn():
                raise ValueError("it is the human's turn")
            self._play_bot_once()

    def analysis(self) -> dict[int, int]:
        """Valor de cada casa vazia para o humano (positivo: vitória)."""
        with self._lock:
            if self._game.is_over() or not self._is_human_turn():
                raise ValueError("analysis is only available on the human's turn")
            return evaluate_moves(self._game)

    def state(self) -> dict:
        with self._lock:
            game = self._game
            over = game.is_over()
            return {
                "id": self.id,
                "board": game.board(),
                "current_player": game.current_player(),
                "human_turn": not over and self._is_human_turn(),
                "over": over,
                "winner": game.winner(),
                "winning_line": game.winning_line(),
                "draw": over and game.winner() is None,
                "last_bot_move": self._last_bot_move,
                "last_bot_stats": (
                    self._last_bot_stats.to_dict() if self._last_bot_stats else None
                ),
                "settings": {
                    "players": dict(self._players),
                    "first_player": self._first_player,
                    "random_tiebreak": self._random_tiebreak,
                },
            }
