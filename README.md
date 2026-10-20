# tictactoe-bot

Jogo da velha em Python com um bot baseado no algoritmo **minimax**, com quatro níveis de dificuldade. É um projeto acadêmico: o foco é implementar e entender o minimax, e a interface existe para demonstrá-lo.

> **Status:** em desenvolvimento. A lógica do jogo e o bot já funcionam pelo terminal; a camada de partida, a API web e a interface ainda não foram implementadas. Veja o [Roteiro](#roteiro).

## Sumário

- [Como rodar](#como-rodar)
- [Estrutura e arquitetura](#estrutura-e-arquitetura)
- [A classe `TicTacToe`](#a-classe-tictactoe)
- [O bot](#o-bot)
- [Poda alfa-beta (opcional)](#poda-alfa-beta-opcional)
- [Interface web: especificação](#interface-web-especificação)
- [Roteiro](#roteiro)
- [Diretrizes para contribuir](#diretrizes-para-contribuir)
- [Uso de LLMs neste projeto](#uso-de-llms-neste-projeto)

## Como rodar

Requisitos: **Python 3.10 ou superior** (o código usa a sintaxe `str | None`). Ainda não há dependências externas.

```bash
git clone <url-do-repositorio>
cd tictactoe-bot/src
python main.py
```

O comando precisa ser executado **de dentro de `src/`**: os imports (`from models...`, `from algorithms...`) são resolvidos a partir dessa pasta. Rodar de outro lugar gera `ModuleNotFoundError`. Para executar outro módulo diretamente, use `-m` a partir de `src/`, por exemplo `python -m algorithms.minimax`.

As casas são numeradas de 0 a 8:

```
 0 | 1 | 2
---+---+---
 3 | 4 | 5
---+---+---
 6 | 7 | 8
```

Hoje o humano joga sempre com **X** e começa; o bot joga com **O** no nível 2. Essas opções estão fixas em `main.py`.

## Estrutura e arquitetura

### Estrutura atual

```
src/
├── main.py              # ponto de entrada: loop de jogo no terminal
├── models/
│   └── tictactoe.py     # regras do jogo (classe TicTacToe)
└── algorithms/
    ├── minimax.py       # minimax com profundidade limitada e best_move
    └── bot.py           # níveis de dificuldade e escolha da jogada do bot
```

### Estrutura planejada

Pastas novas devem seguir este desenho. Se algo não couber nele, discuta antes de criar uma estrutura diferente.

```
src/
├── main.py              # terminal
├── models/              # regras do jogo; não importa nada do projeto
├── algorithms/          # minimax, alfa-beta, níveis do bot
├── services/
│   └── match.py         # fluxo de uma partida (humano, bot, configurações)
├── api/
│   └── app.py           # API web fina: traduz HTTP em chamadas a services
├── web/                 # HTML, CSS e JS estáticos da interface
└── tools/
    └── simulate.py      # simulações em massa para calibrar os níveis
tests/                   # testes automatizados (na raiz do repositório)
```

### Regra de dependência

Os imports apontam sempre num único sentido. Nenhuma camada importa uma camada à sua esquerda:

```
web (JS) ─HTTP→ api → services → algorithms → models
                       main.py ──↗
                       tools ────↗
```

- `models/` não importa nada do projeto. Importar o bot dentro de `tictactoe.py` causa importação circular.
- `algorithms/` conhece só `models/`.
- `services/` organiza o fluxo de uma partida e é o único ponto de contato da `api/` com o resto.
- `api/` não contém regra de jogo nem lógica de IA: só valida a requisição, chama `services/` e devolve JSON.
- `web/` não reimplementa regras: tudo o que exibe vem da API.

### Responsabilidades de cada camada

| Camada | Pode | Não pode |
|---|---|---|
| `models` | validar jogadas, guardar estado | `print`, `input`, aleatoriedade, conhecer o bot |
| `algorithms` | buscar e avaliar jogadas, coletar estatísticas | `print`, `input`, conhecer HTTP ou a interface |
| `services` | criar partidas, aplicar jogadas do humano e do bot, montar o estado em `dict` | conhecer HTTP |
| `api` | rotas, validação de entrada, códigos de erro HTTP | lógica de jogo ou de busca |
| `web` | desenhar e enviar ações do jogador | decidir jogadas, checar vitória |

## A classe `TicTacToe`

É a interface pública que o resto do projeto usa. O tabuleiro é uma lista de 9 posições, mas isso é detalhe interno: outras camadas não acessam `_board` nem `_history`.

| Método | Descrição |
|---|---|
| `current_player()` | `"X"` ou `"O"`, quem joga agora |
| `valid_positions()` | lista das casas vazias |
| `move(position)` | marca a casa e passa a vez; lança `ValueError` se a casa estiver ocupada ou o jogo já tiver terminado |
| `undo()` | desfaz a última jogada (usado pelo minimax para explorar jogadas) |
| `winner()` | `"X"`, `"O"` ou `None` (sem vencedor: jogo em andamento ou empate) |
| `is_over()` | `True` se alguém venceu ou o tabuleiro encheu |

Para diferenciar empate de jogo em andamento: `is_over() and winner() is None` indica empate.

Para a API, será preciso um método que exponha o tabuleiro (por exemplo, `board()` retornando uma **cópia** da lista). Adicione métodos públicos assim, nunca acesse atributos com `_` de fora da classe.

## O bot

`minimax.py` avalia cada estado supondo que os dois lados jogam da melhor forma possível:

- vitória do bot vale `10 + profundidade restante` e derrota vale `-10 - profundidade restante`, de modo que o bot prefere vencer rápido e adiar derrotas;
- empate, ou estado em que o limite de profundidade foi atingido, vale `0`;
- as jogadas são embaralhadas antes da avaliação para variar as partidas quando há empate de pontuação;
- o padrão de busca é `move` → recursão → `undo`, e cada chamada deixa o tabuleiro exatamente como encontrou.

`bot.py` combina **profundidade** com uma **probabilidade de erro** (jogada aleatória):

| Nível | Profundidade | Erro | Comportamento |
|---|---|---|---|
| 1 | 1 | 0% | Aproveita vitórias imediatas, mas não bloqueia o adversário |
| 2 | 2 | 25% | Costuma bloquear ameaças, cai em armadilhas de duas ameaças |
| 3 | 9 | 10% | Joga perfeitamente quase sempre, às vezes deixa uma brecha |
| 4 | 9 | 0% | Imbatível (para testes e comparações) |

Os valores de erro são uma calibração inicial e ainda não foram validados com simulações.

```python
from models.tictactoe import TicTacToe
from algorithms.bot import bot_move

game = TicTacToe()
game.move(bot_move(game, level=4))
```

## Poda alfa-beta (opcional)

O projeto da disciplina pede **minimax**. A poda alfa-beta é uma otimização dele: devolve o mesmo valor e uma jogada de mesmo valor, visitando menos estados. No jogo da velha ela não é necessária por desempenho (o minimax completo responde em cerca de um a dois segundos na primeira jogada).

**Antes de implementar, quem for desenvolver deve avaliar se ela cabe no contexto da apresentação** (o que o enunciado e o professor esperam, tempo disponível para explicar). Se a decisão for implementar:

- o `minimax` puro **continua existindo e inalterado**, como implementação principal;
- a poda fica numa função separada (por exemplo, `minimax_alphabeta` em `algorithms/`), selecionada por um parâmetro, nunca substituindo a original;
- deve haver um teste garantindo que as duas versões dão o mesmo valor para os mesmos estados;
- o ganho deve ser medido (estados visitados e tempo nas duas versões), e esse comparativo é o que justifica a poda na apresentação.

Se a decisão for não implementar, a opção correspondente simplesmente não aparece na interface (veja a seguir).

## Interface web: especificação

A interface é **ultra simples**. Ela serve para jogar e para mostrar o minimax funcionando, não para decorar.

### Layout

- Uma única tela com **fundo de cor sólida**. Sem gradientes, imagens ou animações elaboradas.
- O **tabuleiro 3×3 centralizado** na tela (horizontal e verticalmente), com casas grandes e clicáveis.
- Abaixo do tabuleiro, uma linha curta de status: "Sua vez", "Bot pensando…", "Você venceu", "Empate" etc., e um botão **Nova partida**.
- Em um canto superior:
  - um **menu dropdown de dificuldade** (Nível 1 a 4);
  - um **ícone de engrenagem** que abre o painel de configurações.
- Nada mais na tela. Qualquer elemento novo deve ir para dentro do painel de configurações.
- HTML, CSS e JavaScript puros em `web/`, sem frameworks de front-end nem etapa de build.
- Mudar a dificuldade ou uma configuração que afete a busca começa uma nova partida (ou pede confirmação), para que uma partida nunca misture configurações.

### Painel de configurações (engrenagem)

Cada opção é um interruptor ou seletor simples. As opções da lista "essenciais" fazem parte do escopo; as de "demonstração do minimax" existem para tornar o algoritmo visível na apresentação e podem ser implementadas aos poucos.

**Essenciais**

| Opção | Tipo | O que faz |
|---|---|---|
| Modo escuro | liga/desliga | Alterna entre duas cores sólidas de fundo e o contraste do tabuleiro. Preferência guardada no navegador (`localStorage`) |
| Quem começa | Você / Bot | Define o primeiro a jogar |
| Seu símbolo | X / O | Símbolo do humano |
| Poda alfa-beta | liga/desliga | Usa `minimax_alphabeta` em vez de `minimax`. **Só aparece se a poda tiver sido implementada** (veja a seção anterior); o jogo do bot deve ser o mesmo nas duas posições |

**Demonstração do minimax**

| Opção | Tipo | O que faz |
|---|---|---|
| Mostrar avaliação das casas | liga/desliga | Na vez do humano, cada casa vazia mostra o valor que o minimax atribui a ela (do ponto de vista do humano), com cor indicando vitória, empate ou derrota. Mostra o "raciocínio" do algoritmo |
| Estatísticas da busca | liga/desliga | Após cada jogada do bot, mostra estados visitados, profundidade usada e tempo gasto. Com a poda disponível, permite comparar as duas versões ao vivo |
| Preferir vitórias rápidas | liga/desliga | Liga ou desliga a penalidade por profundidade na pontuação. Desligada, o bot continua invencível no nível 4, mas pode "enrolar" em vez de vencer na hora, o que ilustra por que a penalidade existe |
| Desempate aleatório | liga/desliga | Desligado, o bot sempre escolhe a primeira jogada entre as de mesmo valor e fica previsível |
| Bot contra bot | liga/desliga + seletor de nível para cada lado | O bot joga sozinho dos dois lados, com um pequeno intervalo entre jogadas. Nível 4 contra nível 4 deve sempre empatar |
| Velocidade do bot | Instantâneo / Normal / Lento | Atraso visual antes da jogada do bot, só na interface; não afeta o algoritmo |

Regras para implementar o painel:

- A interface só exibe uma opção se a API indicar que ela é suportada (por exemplo, `GET /config` devolvendo a lista de opções disponíveis). Assim, opções não implementadas nunca aparecem quebradas.
- Opções que mudam a busca (alfa-beta, vitórias rápidas, desempate) viram **parâmetros** das funções em `algorithms/`, com valores padrão iguais ao comportamento atual. Nunca use variáveis globais para isso.
- Estatísticas são coletadas em `algorithms/` e devolvidas como dados (por exemplo, um objeto ou `dict` de estatísticas), nunca impressas.
- Opções puramente visuais (modo escuro, velocidade) ficam só no `web/` e não chegam à API.

### API esperada

Esboço; os nomes podem mudar, mas o formato (estado completo em JSON a cada resposta) deve ser mantido.

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/config` | Níveis disponíveis e quais opções do painel são suportadas |
| `POST` | `/matches` | Cria uma partida com nível e configurações; se o bot começar, já joga. Devolve `id` e estado |
| `GET` | `/matches/{id}` | Estado atual |
| `POST` | `/matches/{id}/moves` | Recebe a posição do humano; devolve o estado já com a resposta do bot e as estatísticas da busca |
| `GET` | `/matches/{id}/analysis` | Valor do minimax para cada casa vazia (para "Mostrar avaliação das casas") |

O estado devolvido deve conter, no mínimo: tabuleiro, jogador da vez, se terminou, vencedor (ou empate), última jogada do bot e configurações da partida. Jogadas inválidas retornam erro HTTP 400 com a mensagem do `ValueError`.

## Roteiro

- [ ] Permitir escolher o nível e o símbolo (X/O) no início da partida, no terminal
- [ ] Testes automatizados para `TicTacToe` e para o minimax (ex.: nível 4 contra nível 4 sempre empata)
- [ ] Coleta de estatísticas da busca (estados visitados, tempo) em `algorithms/`
- [ ] Script de simulação em `tools/`: partidas em massa entre níveis e contra um jogador aleatório, para calibrar as probabilidades de erro
- [ ] Método `board()` no `TicTacToe`, retornando uma cópia do tabuleiro
- [ ] Classe `Match` em `services/`
- [ ] API web (FastAPI ou Flask) em `api/`
- [ ] Interface web em `web/`, seguindo a especificação acima
- [ ] Opções do painel de demonstração do minimax
- [ ] *(Opcional, após avaliação)* poda alfa-beta, com comparativo de desempenho
- [ ] Adicionar `requirements.txt` quando surgirem dependências

## Diretrizes para contribuir

### Fluxo

1. Escolha um item do [Roteiro](#roteiro) e avise o grupo para não haver trabalho duplicado.
2. Crie uma branch a partir da `main` (ex.: `feat/match-service`, `fix/undo-history`).
3. Faça commits pequenos e com mensagens descritivas.
4. Abra um pull request explicando o que mudou e como testar. Ao concluir um item, marque-o no Roteiro no mesmo PR.

### Padrões de código

- **Uma responsabilidade por módulo.** Se um arquivo começa a fazer duas coisas, separe.
- **Respeite a [regra de dependência](#regra-de-dependência).** Se precisar de um import no sentido contrário, o código está na camada errada.
- **Interfaces pequenas e explícitas.** Exponha métodos públicos; atributos internos começam com `_` e não são acessados de fora.
- **Sem efeitos colaterais escondidos.** Funções de busca deixam o jogo como receberam (`move` sempre seguido de `undo`).
- **Erros com exceções**, nunca ignorados em silêncio. Use `ValueError` para jogadas ou parâmetros inválidos.
- **Sem `print`/`input` fora de `main.py` e `tools/`.**
- **Configuração por parâmetro**, com padrão igual ao comportamento atual, para não quebrar quem já usa a função.
- **Type hints** em funções públicas e nomes em inglês no código. Comentários e documentação podem ser em português.
- **Não adicione dependências** sem necessidade clara; quando adicionar, registre no `requirements.txt`.
- **Simplicidade antes de generalização.** Não crie abstrações "para o futuro" (o tabuleiro é 3×3; não generalize para N×N sem que isso esteja no Roteiro).

## Uso de LLMs neste projeto

É esperado que colaboradores usem assistentes de IA. Para manter o projeto coerente:

- **Dê este README como contexto** ao assistente antes de pedir código, junto com os arquivos que serão alterados. Ele descreve a arquitetura e as regras que o código gerado precisa seguir.
- **Peça mudanças pequenas e localizadas**, uma camada por vez. Evite pedir "a interface completa" ou "a API inteira" de uma vez.
- **Revise antes de commitar**, conferindo em especial:
  - se algum import quebra a regra de dependência;
  - se lógica de jogo ou de busca vazou para `api/` ou `web/`;
  - se o assistente reescreveu o `minimax` puro (ele deve permanecer como está) ou acessou atributos `_` de fora da classe;
  - se surgiram dependências, frameworks ou pastas fora da estrutura planejada;
  - se a interface ganhou elementos fora da especificação (a tela deve continuar ultra simples).
- **Entenda o que entrega.** O projeto é avaliado pela compreensão do minimax: todo código de `algorithms/` precisa poder ser explicado por quem o enviou.
- **Atualize este README** quando uma decisão de arquitetura mudar, para que ele continue sendo a referência para pessoas e assistentes.
