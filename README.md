# Bronx — Barber Fighter

Jogo de luta 2D para navegador. Feito com Canvas, JavaScript e CSS, sem dependências de runtime.

## Jogar no computador

Requer Node.js 20 ou superior.

```sh
npm run dev
```

Abra <http://localhost:4173>. O servidor local também permite partidas entre dois aparelhos na mesma rede Wi-Fi.

Se a porta 4173 já estiver ocupada, o servidor escolhe outra porta livre e mostra o endereço correto no terminal. Use esse endereço para abrir o jogo. Para definir uma porta manualmente no Prompt de Comando do Windows, use `set PORT=4174` e depois `npm run dev`. No PowerShell, use `$env:PORT="4174"` e depois `npm run dev`.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` gera os arquivos estáticos e publica o jogo quando há push para `main` (ou ao executá-lo manualmente em **Actions**).

1. Envie os arquivos desta pasta para um repositório GitHub.
2. Em **Settings → Pages**, selecione **GitHub Actions** como fonte.
3. Envie um commit para a branch `main` e aguarde o workflow terminar. O endereço do jogo aparece no resumo da execução.

Para gerar o site manualmente, execute `npm run build`; a pasta `dist/` contém os arquivos prontos para hospedagem estática.

No GitHub Pages, funcionam História, Arcade, Versus local e Treino. O modo **Versus Wi-Fi** conecta aparelhos na mesma rede e precisa do servidor Node local; uma hospedagem estática do Pages não mantém um servidor de partidas pela internet.

## Modos

- **História:** escolha um dos seis lutadores regulares e enfrente os demais antes do chefe Lorehy.
- **Arcade:** luta contra a CPU, com dificuldades configuráveis.
- **Versus local:** duas pessoas no mesmo aparelho. Só fica disponível quando dois controles são detectados. P1 escolhe com o primeiro controle; P2 escolhe com o segundo, usando o direcional ou o analógico esquerdo, e P1 inicia a luta.
- **Treino:** oponente passivo ou CPU, com opções de vida/energia infinitas e hitboxes.
- **Versus Wi-Fi:** dois aparelhos na mesma rede, com um anfitrião e um convidado. O convidado escolhe o lutador de P2 no próprio aparelho e confirma; o anfitrião inicia após essa confirmação. Requer `npm run dev`.
- **História:** depois da penúltima luta, `assets/cinematics/boss_intro.mp4` toca como introdução do chefe. Se o navegador bloquear autoplay, toque em **INICIAR INTRODUÇÃO**; ao terminar, a luta com Lorehy começa.

## Controles

- **Teclado P1:** setas para mover, pular e agachar; J soco, K chute, L defesa, I especial.
- **Teclado P2:** WASD; F soco, G chute, H defesa, T especial.
- **Xbox, PlayStation e controles USB/Bluetooth padrão:** conecte cada controle e pressione um botão após a página abrir. O primeiro controle é P1; o segundo é P2. Use o direcional ou o analógico esquerdo para mover. O mapeamento padrão usa A/× para soco, B/○ para chute, X/□ para defesa e Y/△ para especial.
- As ações podem ser remapeadas em **Opções → Controles**. O navegador precisa de HTTPS ou localhost para disponibilizar a API de controles; o GitHub Pages usa HTTPS.
- **Partida:** Start no controle, P ou Esc pausa/retoma a luta. Em celular, o jogo exige orientação horizontal e mostra uma tela de bloqueio se o aparelho estiver na vertical. Use os novos controles de toque na tela.

## Instalar no celular

O ícone fornecido está configurado para a tela inicial. Depois de publicar o jogo no GitHub Pages:

- **Android:** abra o endereço no Chrome, toque no menu ⋮ e escolha **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone:** abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início** e abra o jogo pelo ícone criado.

Ao iniciar uma luta, o jogo solicita tela cheia nos navegadores que permitem esse recurso. No iPhone, abrir pelo ícone da tela inicial esconde a barra do Safari; uma página aberta no navegador não pode forçar tela cheia em todos os aparelhos.

## Personagens e atlas

Os arquivos de origem do Christian estão em `personagens/Christian/`. O jogo carrega o atlas e os retratos derivados em `assets/fighters/christian/`.

O atlas do Christian foi reconstruído do zero com as quatro folhas de sprites (88 quadros no total). Os retratos e o retrato de corpo inteiro são os arquivos fornecidos em `personagens/Christian/portait/` e `personagens/Christian/bg_portait/`. Para gerá-lo novamente após substituir uma folha ou retrato, instale Python 3 com as dependências e execute:

```sh
python -m pip install -r tools/requirements-sprites.txt
python tools/rebuild-christian.py
```

Depois, execute `npm run build` para atualizar a pasta `dist/`.

## Versus Wi-Fi

1. Em um computador, extraia o projeto e execute `npm run dev`.
2. No primeiro aparelho, abra o endereço `http://127.0.0.1:<porta>` mostrado no terminal e escolha **Versus Wi-Fi → Criar partida**.
3. No segundo aparelho, conectado à mesma rede, abra o endereço de rede mostrado no terminal e escolha **Entrar na partida**. Nesse aparelho, P2 seleciona o personagem e confirma; a escolha aparece no anfitrião.
4. Mantenha o servidor aberto durante a partida. Se o firewall perguntar, permita acesso à rede privada.

## Limites da hospedagem estática

GitHub Pages hospeda o jogo para que qualquer pessoa o abra pela internet. Isso permite jogar contra a CPU ou localmente com outra pessoa no mesmo dispositivo. Partidas entre pessoas em redes diferentes precisam de um servidor de jogo e de sinalização; esse serviço não faz parte deste repositório.
