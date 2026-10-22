"""API web: traduz HTTP em chamadas a services/ e devolve JSON.

Rodar a partir de src/:  python -m api.app
"""
from pathlib import Path

from flask import Flask, jsonify, request

from algorithms.bot import LEVELS
from services.match import Match
from services.registry import MatchNotFound, MatchRegistry

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="")
registry = MatchRegistry()


class BadRequest(Exception):
    pass


@app.errorhandler(BadRequest)
@app.errorhandler(ValueError)
def bad_request(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(MatchNotFound)
def not_found(error):
    return jsonify(error="match not found"), 404


def _field(body: dict, name: str, kind: type, default):
    value = body.get(name, default)
    # bool é subclasse de int em Python: True não pode passar como nível
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise BadRequest(f"'{name}' must be {kind.__name__}")
    return value


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/config")
def config():
    return jsonify(
        levels=sorted(LEVELS),
        options={
            "alphabeta": False,  # poda ainda não implementada
            "show_analysis": True,
            "search_stats": True,
            "show_tree": True,
            "random_tiebreak": True,
            "bot_vs_bot": True,
        },
    )


@app.post("/matches")
def create_match():
    body = request.get_json(silent=True) or {}
    search = {"random_tiebreak": _field(body, "random_tiebreak", bool, True)}
    mode = _field(body, "mode", str, "human_vs_bot")

    if mode == "human_vs_bot":
        match = Match.human_vs_bot(
            _field(body, "level", int, 2),
            _field(body, "human_symbol", str, "X"),
            _field(body, "human_starts", bool, True),
            **search,
        )
    elif mode == "bot_vs_bot":
        match = Match.bot_vs_bot(
            _field(body, "x_level", int, 4),
            _field(body, "o_level", int, 4),
            **search,
        )
    else:
        raise BadRequest(f"invalid mode: {mode}")

    registry.add(match)
    return jsonify(match.state()), 201


@app.get("/matches/<match_id>")
def get_match(match_id: str):
    return jsonify(registry.get(match_id).state())


@app.post("/matches/<match_id>/moves")
def human_move(match_id: str):
    match = registry.get(match_id)
    body = request.get_json(silent=True) or {}
    match.play_human(_field(body, "position", int, None))
    return jsonify(match.state())


@app.post("/matches/<match_id>/bot-moves")
def bot_move(match_id: str):
    """Uma jogada do bot, usada no modo bot contra bot."""
    match = registry.get(match_id)
    match.play_bot()
    return jsonify(match.state())


@app.get("/matches/<match_id>/analysis")
def analysis(match_id: str):
    values = registry.get(match_id).analysis()
    return jsonify(values={str(pos): v for pos, v in values.items()})


if __name__ == "__main__":
    app.run(debug=True)
