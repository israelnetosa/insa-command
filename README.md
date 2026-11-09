# INSA Command · Fase 1

Centro de comando **privado** da carteira INSA Dividend Army. É a sucessora do INSA Wallet (Manus).

## O que mudou em relação ao original

| | INSA Wallet (Manus) | INSA Command |
|---|---|---|
| Privacidade | `/api/portfolio` e PDFs **públicos**, modo público por padrão | Tudo fechado; só o dono entra |
| Login | OAuth do Manus → Google | Passkey (biometria), dono único |
| Rastreadores | Plausible + manus-analytics | Nenhum. Fontes servidas pelo próprio app |
| Dados | Fotografia estática gerada offline | Livro-razão vivo; posições, PM e caixa são derivados |
| Renda | Só estimada | Estimada **e** recebida (lançamentos reais) |
| Lançamentos | — | Prévia do efeito antes de gravar; anulação com trilha |
| Cotações | Yahoo | brapi.dev (B3) + Yahoo de reserva, atraso medido |
| Peso do app | 412 KB de JS | 35 KB (12 KB comprimido) |
| Hospedagem | Presa ao Manus | Sua conta Cloudflare (plano gratuito) |

## Novidades da 2.0.1 · Núcleo em toro

- O centro do cockpit trocou os anéis por um **toro 3D de fios**, inspirado num painel de pesquisa. Cada fio é uma parte do patrimônio de um ativo, na proporção do valor, colorido pela classe: dourado para FIIs, branco para ações, violeta para ETF e ciano para cripto.
- O patrimônio fica no furo do toro, e as chamadas nos cantos continuam: marco, maior pelotão e zona de ataque.
- Uma mira percorre os ativos (compras do plano primeiro), com um rótulo do candidato embaixo.
- O resto do app não mudou. O painel completo da 2.0.0 foi desfeito, e o código dele fica no histórico do repositório.
- **Leve:**
  - até 24 quadros/s (20 no celular), só com o núcleo visível;
  - menos fios se o aparelho não acompanhar;
  - botão de pausa, lembrado em cada aparelho;
  - parado com "reduzir movimento".

## Novidades da 1.9 · Voz J.A.R.V.I.S.

- **Voz natural masculina:** a voz padrão passa a ser a do Gemini. A instrução de estilo pede português do Brasil, um mordomo digital elegante, humor seco e um ritmo fluido.
  - Há oito timbres masculinos, e Charon é o padrão.
  - A voz do aparelho continua como alternativa grátis e offline, com escolha da voz em Ajustes, guardada só naquele aparelho.
- **Leitura sem tropeços:** antes de falar, o texto é preparado.
  - Valores em dinheiro viram "reais e centavos", "/mês" vira "por mês" e "%" vira "por cento".
  - Siglas como PM e DY são lidas por extenso, e tickers são separados ("BTLG 11").
  - Marcadores, símbolos e quebras de linha deixam de causar pausas.
  - Na voz do aparelho, a fala é dividida só em frases completas.
- **Humor:** o M.A.N.U.E.L. ganhou a personalidade de J.A.R.V.I.S., com uma tirada curta no fim das respostas, nunca no lugar dos dados. Isso vale para as respostas locais e para as da IA.
- Ouvir de novo a mesma resposta não gera outra chamada, e Ajustes tem o botão "Testar voz".
- **1.9.1:** a voz natural deixou de ler a instrução de estilo: o pedido segue o formato do guia do Gemini, em que só o trecho TRANSCRIPT é falado. O núcleo do cockpit passou a girar por animação CSS, sem JavaScript a cada quadro, e o uso da CPU parada caiu de ~63% para ~2% num celular simulado 4× mais lento.

## Novidades da 1.8 · Núcleo Ophanim

- **Cockpit:** o núcleo virou "rodas dentro de rodas": três anéis neon que giram em sentidos opostos, com esferas-olho e chamadas em cotovelo até os cantos (valores com ícone de olho, como num HUD).
  - Interno (verde): pelotões em zona de ataque.
  - Médio (âmbar): maior pelotão, com a marca do teto.
  - Externo (ciano): rumo ao marco.
- **Olhos (nós de dados):** pulsam nos anéis. No mouse ou no toque, o anel desacelera até parar e abre um painel holográfico.
  - Anel interno: um olho por pelotão, com zona, preço, PM, teto e variação do dia.
  - Anel médio: os maiores pesos.
  - Anel externo: marco, renda, meta final, próximo aporte e Magic Number.
- **Leve:** cada anel é girado pela GPU, o brilho fica numa camada parada, e tudo para com a janela escondida ou com "reduzir movimento" ligado.
- **React:** `componentes/OphanimCore.tsx` traz o mesmo núcleo em React + Tailwind + framer-motion, para usar em outros projetos.

## Novidades da 1.7 · M.A.N.U.E.L. econômico

- **Respostas locais, 0 tokens:** o próprio motor do app responde as perguntas da carteira sem chamar a IA. Entram aqui a leitura do dia, onde aplicar um aporte, a zona de ataque, o Magic Number, os marcos e a projeção, a renda, a fila de oportunidades e um ativo específico.
- **Lançamentos em texto sem IA:** frases como "comprei 3 BTLG11 a 97,80", "recebi R$ 12,35 do MXRF11" e "aportei 500" viram proposta para confirmar.
- **IA só com `ia:` (1.7.1):** no modo econômico, a IA externa só é chamada quando a mensagem começa com `ia:`. Sem o prefixo, o motor responde. Pedidos de "próximos passos" ou "chegar a R$ X/mês" saem como plano, e perguntas que não reconhece viram panorama com a dica do `ia:`. Com o prefixo, a IA recebe só as 2 últimas falas e um dossiê de ~600 tokens.
- **Contexto enxuto:** o dossiê, o histórico e as ferramentas foram compactados, e a resposta tem teto de tamanho. Uma consulta à IA caiu de cerca de 5,2k para 1,5k tokens.
- **Gemini sem travar no limite:**
  - O Flash-Lite, mais barato e com cota maior, vem primeiro.
  - Ao bater no limite (429), o app passa na hora para outro modelo, que tem cota própria.
  - O modelo esgotado fica de fora até a cota voltar.
- **Cache:** a mesma pesquisa em 12 h e a mesma pergunta com a mesma carteira em 1 h não gastam de novo. O Claude usa cache de prompt.
- **Controle:** modo econômico (ligado por padrão), consultas por dia e teto de tokens por dia, em Ajustes → Configuração do M.A.N.U.E.L.

## Novidades da 1.5 · Nuvem e Android

- **Nuvem própria** (Cloudflare Worker + D1, plano gratuito): o PC e o celular usam os mesmos dados.
- **Aparelhos pareados:** o primeiro entra com o código de configuração (`INSA_SETUP_TOKEN`). Os seguintes entram com um código de 8 dígitos gerado num aparelho já conectado, que vale 10 minutos e uma única vez. Cada aparelho pode ser desconectado em Ajustes.
- **App Android (APK)** compilado pelo GitHub e anexado ao release de cada versão. As telas novas chegam pela nuvem, sem reinstalar.
- **Windows → nuvem:** em Ajustes → Nuvem e celular, envia o razão local e passa a abrir a nuvem. Os dados locais ficam como cópia.

### Ligar a nuvem (uma vez)

1. Crie uma conta grátis em cloudflare.com e abra **Workers & Pages** uma vez, para criar o seu subdomínio `workers.dev`.
2. Em **My Profile → API Tokens**, crie um token com o modelo "Edit Cloudflare Workers" e acrescente a permissão **D1: Edit**.
3. No GitHub, em `insa-command` → **Settings → Secrets and variables → Actions**, crie estes segredos:
   - `CLOUDFLARE_API_TOKEN`: o token do passo 2.
   - `CLOUDFLARE_ACCOUNT_ID`: o ID da conta, que fica à direita no painel da Cloudflare.
   - `INSA_SETUP_TOKEN`: uma senha longa inventada por você. Serve para conectar o primeiro aparelho e para proteger a chave do APK.
   - `GEMINI_API_KEY`: obrigatório.
   - `ANTHROPIC_API_KEY` e `BRAPI_TOKEN`: opcionais.
4. Em **Actions → Nuvem e Android → Run workflow**, rode o workflow. Ele publica a nuvem, mostra o endereço e anexa o APK ao release.

## Novidades da 1.3 · HUD tático

- **Visual novo:**
  - fundo abissal com grade e varredura;
  - painéis com cantos chanfrados e colchetes de mira;
  - linhas holográficas em ciano e detalhes âmbar de reator.
- **Núcleo do cockpit:** um reator de anéis concêntricos com o patrimônio no centro. O anel externo mostra o progresso rumo ao marco, o médio a concentração do maior pelotão contra o teto, e o interno os pelotões em zona de ataque.
- **Faixa de cotações** correndo no topo, com as posições e as referências do radar. Para quando o mouse passa por cima.
- **Sequência de inicialização** ao desbloquear e **avatar holográfico** do M.A.N.U.E.L., que acelera ao analisar e mostra ondas ao falar.
- **Acessibilidade:** a opção "reduzir movimento" do sistema desliga todas as animações.

## Novidades da 1.2 · M.A.N.U.E.L.

- **Console de IA:** o cérebro é o Claude (Sonnet 5.5) e o Gemini assume se o Claude falhar. O dossiê da carteira entra como dado, nunca como instrução.
- **Ferramentas:**
  - simular aporte;
  - focar ativo;
  - varrer oportunidades da fase;
  - pesquisar com fontes, feita pelo Gemini com Google Search e com as fontes citadas;
  - propor lançamento.
- **Lançamentos só com o seu clique:** a IA prepara a proposta com a prévia antes/depois, e você confirma ou recusa. Cada proposta só pode ser confirmada uma vez e é revalidada contra o razão no momento da confirmação.
- **Voz:** a do Windows (grátis, offline) ou a voz natural do Gemini (TTS). Pode falar as respostas automaticamente.
- **Custos sob controle:** limite diário de mensagens e contador de tokens do dia.

## Novidades da 1.1

- **Radar ao vivo:**
  - Cotações a cada 60 s no pregão (o painel se renova a cada 30 s).
  - Referências: Ibovespa, IFIX, dólar, bitcoin e S&P 500.
  - Mini-gráfico intradiário, resultado do dia em R$ e contagem regressiva para a abertura ou o fechamento.
  - Aviso: dados gratuitos da B3 chegam com até ~15 min de atraso. Dólar e bitcoin são quase em tempo real.
- **Estratégia:**
  - O plano de crescimento completo dentro do app: decisões em vigor, caixa de proventos, roteiro de 12 meses (com "onde você está"), calendário de proventos, candidatos da Fase 2, tributação, riscos e metas.
  - O histórico do INSA Wallet também fica disponível, como arquivo de referência.
- **Migração do INSA Wallet:**
  - Importa um arquivo `.json` privado.
  - Antes de gravar, há uma tela de conferência com quantidade e preço médio editáveis, alertas de divergência e o caixa informado.
  - Substitui o razão anulando os lançamentos antigos, sem apagar nada, e faz uma cópia completa do banco antes.
- O instalador **não leva nenhum dado da carteira**: pode ser publicado com segurança.

## App de Windows (recomendado)

Instale com `INSA-Command-Setup-x.y.z.exe`. Não precisa de terminal, conta nem servidor.

- Os dados ficam só no seu computador, em `%APPDATA%\INSA Command\insa.sqlite`.
- O acesso é protegido por PIN, e o app se bloqueia sozinho após 30 minutos sem uso.
- As chaves de IA ficam cifradas pelo Windows (DPAPI) e são cadastradas em **Ajustes → Inteligência**.
- Não há porta de rede aberta: a interface conversa com o motor por um protocolo interno (`insa://`).

**Atualizar:**
- **Manual:** instale o novo Setup por cima. Os dados e o PIN são mantidos.
- **Automática:** em Ajustes → Atualizações → Canal, informe o usuário e o repositório do GitHub onde os releases são publicados. O app verifica ao abrir e a cada 6 horas, baixa em segundo plano e pede para reiniciar.

**Gerar o instalador** (em Linux é preciso o Wine de 32 bits; no Windows, não):

```bash
npm run dist:win     # → release/INSA-Command-Setup-<versão>.exe + latest.yml
```

Para publicar uma atualização: suba a `version` no `package.json` e envie o commit para a `main`.
O GitHub Actions roda os testes, compila o instalador num Windows real e publica o release.
Os apps instalados recebem a versão sozinhos.

## Deploy na nuvem (opcional, ~15 min)

Você precisa do Node.js 20 ou superior e de uma conta Cloudflare gratuita.

```bash
npm install
npx wrangler login                       # abre o navegador para autorizar
npx wrangler d1 create insa-command      # copie o "database_id" que aparecer
```

Cole o `database_id` em `wrangler.jsonc`, no lugar de `COLE_AQUI_O_ID_DO_D1`.

```bash
npm run db:remote                        # cria as tabelas

# Segredos: ficam cifrados na Cloudflare. NUNCA em arquivo.
npx wrangler secret put SETUP_TOKEN      # invente um código longo; só serve para criar a 1ª passkey
npx wrangler secret put GEMINI_API_KEY   # chave do Google AI Studio
npx wrangler secret put ANTHROPIC_API_KEY  # chave do console.anthropic.com
npx wrangler secret put BRAPI_TOKEN      # opcional: token gratuito em brapi.dev

npm run deploy
```

O deploy mostra o endereço do app (`https://insa-command.<sua-conta>.workers.dev`).

### Primeiro acesso

1. Abra o endereço, digite o `SETUP_TOKEN` e crie a passkey (Windows Hello, Touch ID ou celular).
2. Vá em **Ajustes → Migração do INSA Wallet** e importe o seu arquivo `insa-migracao-….json` (privado, nunca vai para o repositório).
3. Clique em **Ajustes → Atualizar cotações** e depois em **Diagnóstico de IA**.
4. No celular, abra o mesmo endereço e use **Ajustes → Adicionar este dispositivo** a partir de uma sessão já aberta. Depois, use "Adicionar à tela inicial".

> **Domínio:** a passkey fica presa ao domínio. Se pretende usar um domínio próprio (ex.: `insa.seudominio.com`), configure-o **antes** de criar a passkey. Faça isso em Workers → insa-command → Settings → Domains.

### Camada extra (recomendada)

Coloque o app atrás do **Cloudflare Access**, em Zero Trust → Access → Applications, com login por código no seu e-mail. O Access é gratuito até 50 usuários. Assim, nem a tela de login fica exposta.

## Comandos

```bash
npm test          # testes do motor (preço médio, eventos, import, plano)
npm run typecheck
npm run dev       # roda local em http://127.0.0.1:8787 (crie .dev.vars com SETUP_TOKEN=...)
npm run deploy
```

## Arquitetura

```
src/engine.ts   motor puro: razão → posições, PM (regra da Receita), caixa, zona, plano, projeção
src/auth.ts     passkey WebAuthn, sessões (só o hash fica no banco), limite de tentativas
src/market.ts   cotações brapi → Yahoo, atraso medido, cron no pregão
src/index.ts    rotas /api (tudo exige sessão), cabeçalhos de segurança, cron
web/app.js      interface PWA (compilada em public/app.js)
migrations/     esquema D1
desktop/        app de Windows: Electron, SQLite local, bloqueio por PIN, atualizações
.github/        compilação e publicação automática de cada versão
```

**Regras fixas:**
- Nenhum lançamento é gravado sem prévia e confirmação explícita.
- Nada é apagado: lançamentos errados são anulados.
- O app nunca envia ordens à corretora.

## Próximas fases

- **Fase 2 · M.A.N.U.E.L.:** console de IA, com Claude para análise, conselho e ferramentas, e Gemini com busca Google para notícias e fatos relevantes. Inclui voz (Edge TTS, Antonio) e propostas de lançamento que só gravam com sua confirmação.
- **Fase 3 · Automação:** importação de CSV da Área do Investidor B3 e de notas de corretagem, proventos com data-com automática, alertas push e relatório de IR/DARF.
