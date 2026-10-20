from services.match import Match


class MatchNotFound(LookupError):
    pass


class MatchRegistry:
    """Guarda as partidas em memória. Ao reiniciar o servidor, elas somem."""

    def __init__(self, max_matches: int = 200):
        self._matches: dict[str, Match] = {}
        self._max_matches = max_matches

    def add(self, match: Match) -> Match:
        # descarta as mais antigas para a memória não crescer sem limite
        while len(self._matches) >= self._max_matches:
            oldest = next(iter(self._matches))
            del self._matches[oldest]
        self._matches[match.id] = match
        return match

    def get(self, match_id: str) -> Match:
        if match_id not in self._matches:
            raise MatchNotFound(match_id)
        return self._matches[match_id]
