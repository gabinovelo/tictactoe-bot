# tictactoe-bot

Jogo da velha em Python com um bot baseado no algoritmo **minimax**, com quatro níveis de dificuldade. Projeto acadêmico: o foco é o minimax, e a interface web existe para jogar contra o bot e ver o algoritmo funcionando.

**Jogue online:** [[link do site]](https://tictactoe-bot-beta.vercel.app/)

## Apresentação

Os slides usados na apresentação do projeto estão em
[docs/tictactoe_minimax.pdf](docs/tictactoe_minimax.pdf).

## Como rodar localmente

Requisitos: **Python 3.10 ou superior**.

```bash
git clone https://github.com/gabinovelo/tictactoe-bot.git
cd tictactoe-bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd src
python -m api.app    # interface web em http://127.0.0.1:5000
python main.py       # ou: jogo no terminal (não precisa de Flask)
```

Os comandos precisam ser executados **de dentro de `src/`**, porque os imports do projeto partem dessa pasta. Rodar de outro lugar gera `ModuleNotFoundError`.

## Como jogar

Na interface web, clique numa casa para jogar. No canto superior ficam o **menu de dificuldade** e a **engrenagem** de configurações:

| Opção | O que faz |
|---|---|
| Modo escuro | Alterna o tema da tela |
| Quem começa | Você ou o bot |
| Seu símbolo | X ou O |
| Mostrar árvore de busca | Exibe o painel lateral com as possibilidades da posição e a árvore da última jogada do bot |
| Mostrar avaliação das casas | Na sua vez, mostra o valor do minimax para você em cada casa vazia, com números e cores na sua perspectiva |
| Estatísticas da busca | Após cada jogada do bot, mostra estados visitados, profundidade e tempo |
| Desempate aleatório | Desligado, o bot sempre escolhe a primeira entre as jogadas de mesmo valor e fica previsível |
| Bot contra bot | O bot joga sozinho dos dois lados, com um nível para cada |
| Velocidade do bot | Atraso visual antes da jogada do bot (não afeta o algoritmo) |

Com a opção **Mostrar árvore de busca** habilitada, aparece ao lado do tabuleiro a **árvore de busca**, com duas abas: **Suas opções** mostra as jogadas possíveis de quem deve jogar agora, e **Jogada do bot** mostra a busca que decidiu a última jogada do bot. As árvores só aparecem quando restam 5 ou menos casas vazias; antes disso, o painel avisa que a árvore é grande demais. Arraste o fundo do painel para navegar e use o botão de expandir para ocupar toda a tela (`Esc` sai).

Os números e as cores seguem a perspectiva do jogador: valores positivos são vantagem sua, negativos são vantagem do bot, e zero é empate. Folhas verdes são vitória sua, vermelhas são derrota sua e brancas são empate. O tabuleiro e a árvore usam a mesma tradução no frontend, então o valor de uma casa e o nó correspondente têm o mesmo sinal. No modelo teórico, o bot é **MAX** e você é **MIN**; no slide, os scores aparecem na perspectiva do bot, enquanto a interface os traduz para a sua. A aba **Suas opções** parte da sua vez porque é o turno atual.

No terminal, você joga com **X** e começa, contra o bot no nível 2. As casas são numeradas de 0 a 8:

```
 0 | 1 | 2
---+---+---
 3 | 4 | 5
---+---+---
 6 | 7 | 8
```

## Níveis de dificuldade

Todos os níveis usam o mesmo minimax, variando dois parâmetros: a **profundidade** (quantas jogadas à frente o bot enxerga; 9 cobre a partida inteira) e o **erro** (chance de jogar numa casa aleatória em vez da melhor).

| Nível | Profundidade | Erro | Comportamento |
|---|---|---|---|
| 1 | 1 | 0% | Aproveita vitórias imediatas, mas não bloqueia o adversário |
| 2 | 2 | 25% | Costuma bloquear ameaças, mas cai em armadilhas de duas ameaças |
| 3 | 9 | 10% | Joga perfeitamente quase sempre, às vezes deixa uma brecha |
| 4 | 9 | 0% | Imbatível |

## Como o bot funciona

O minimax simula as jogadas possíveis até o fim da partida. Na vez do bot, escolhe a jogada de maior valor; na vez do adversário, supõe que ele escolhe a de menor valor para o bot. Assim, cada jogada vale o melhor resultado garantido contra um adversário perfeito.

A pontuação de um fim de jogo é sempre do ponto de vista do bot:

- vitória: `10 + profundidade restante`;
- derrota: `-10 - profundidade restante`;
- empate, ou limite de profundidade atingido sem o jogo acabar: `0`.

Somar a profundidade restante faz o bot preferir vencer rápido e adiar uma derrota. Com o tabuleiro vazio, o nível 4 avalia 549.945 estados para escolher a primeira jogada.

## Estrutura

```
src/
├── main.py           # jogo no terminal
├── models/           # regras do jogo (classe TicTacToe)
├── algorithms/       # minimax, níveis do bot e estatísticas da busca
├── services/         # fluxo de uma partida e partidas abertas
├── api/              # API Flask; também serve a interface
└── web/              # interface (HTML, CSS e JavaScript)
wsgi.py               # ponto de entrada para a Vercel
pyproject.toml        # dependências e configuração da Vercel
```

Os imports seguem um único sentido: `web → api → services → algorithms → models`. As regras do jogo não dependem de nada do projeto, e o minimax só usa os métodos públicos da classe `TicTacToe` (`valid_positions`, `move`, `undo`, `winner`, `is_over`, `current_player`).

## Deploy

O projeto está configurado para a Vercel: basta importar o repositório, sem comando de build. O `pyproject.toml` aponta a entrada para `wsgi:app`, e o `wsgi.py` coloca `src/` no caminho de busca dos imports.

**Limitação conhecida:** as partidas ficam na memória do servidor. Na Vercel, essa memória pode ser descartada entre requisições, e uma partida pode sumir no meio do jogo (erro `match not found`). Nesse caso, basta começar uma nova partida.
