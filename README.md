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

## Novidades da 2.10 · Pelotões em ordem de compra

- A lista "Todos os pelotões" segue a ordem de compra teórica da matriz 5x20 (`fila_compra` no estado): 1º a próxima compra da ordem do aporte mensal; depois a fila (bloco mais abaixo do alvo; dentro dele, abaixo do PM primeiro e alta >2% no dia para trás); depois os que aguardam (bloco no alvo ou acima dele, abaixo do teto); por último os de blocos acima do teto, que não recebem aporte.
- Cada pelotão mostra o número na fila, o selo (PRÓXIMA COMPRA, NA FILA, AGUARDA, BLOCO CONGELADO) e o motivo. Recalcula a cada cotação.

## Novidades da 2.9 · Matriz 5x20 e as 6 regras invioláveis

- **Nova identidade do Manuel:** cérebro quantitativo e auditor de risco. Missão: R$ 20.000/mês em proventos sustentáveis (patrimônio alvo R$ 2.400.000 a DY de 10% a.a.). Direto, numérico, sem floreios.
- **Matriz 5x20** (`src/matriz.ts`, sobreponível por `settings.matriz`), medida sobre o patrimônio total: Caixa/Renda Fixa (alvo 20%, mínimo 15%), Bancos, Energia, FIIs (10% tijolo + 10% papel) e Crescimento/ETFs — alvo 20%, teto 25% cada.
- **Regras no motor:**
  1. trava de caixa: Caixa/RF < 15% → 50% de todo aporte vai para renda fixa e o caixa existente não compra renda variável;
  2. bloco acima de 25% fica congelado para aportes (proventos vão para os blocos abaixo do alvo);
  3. anti-FOMO: bloco mais distante abaixo do alvo e, dentro dele, ativo abaixo do PM ou em correção; alta >2% no dia sai da frente;
  4. Magic Number só para FIIs, bancos e energia;
  5. anti-pulverização: abaixo de R$ 25 mil, nenhum ticker novo e no máximo 2 destinos (Caixa + 1 ativo);
  6. nunca vende para rebalancear.
  Nenhum ativo congelado individualmente (BBAS3 e BITC11 descongelados na 2.9.1); só blocos acima do teto.
- **Renda fixa no razão:** novos lançamentos "RF: aplicar" (caixa → RF), "RF: resgatar" (RF → caixa) e "RF: saldo/rendimento" (saldo já existente fora do app ou rendimento). Também por texto: "apliquei 250 no tesouro selic", "tenho 3000 em renda fixa".
- **Relatório obrigatório** (leitura do dia e aporte): 1. Status do Núcleo · 2. Alertas de Risco · 3. Ordem de Execução · 4. Radar de Escala (R$ 100 → 500 → 1.000 → 5.000 → 20.000/mês). A saudação falada usa um resumo dele.
- **Cockpit:** cartão da Matriz 5x20 (peso × alvo × teto por bloco) e cartão da Ordem de Execução do aporte mensal, com atalhos para registrar a compra e a aplicação em RF.
- Migração `0006_renda_fixa.sql` amplia os tipos do razão preservando todos os lançamentos.

## Novidades da 2.8 · Manuel como Estrategista C-Level e o Plano de Guerra no motor

- **Nova identidade do Manuel:** Estrategista Financeiro C-Level e Auditor de Risco. Fala direto, em linguagem de negócios, sem "Senhor", sem "Comandante" e sem clichês militares; exige dados reais antes de dar veredito.
- **Parecer do Board:** toda avaliação de aporte, investimento ou projeto sai em 4 seções fixas: Resumo Executivo C-Level, Análise Quantitativa, Análise Qualitativa e O Veredito do Board (Aprovado / Reprovado / Necessita de Dados Operacionais). O motor local já responde assim sem gastar IA.
- **Plano de Guerra no motor de compras** (`POLITICA_PADRAO`, sobreponível por `settings.politica`):
  - só Fase 1 (WEGE3, BTLG11, NDIV11, ITUB4, CMIG4) até R$ 8.000 de patrimônio;
  - BBAS3 e BITC11 congelados (sem aporte, sem venda);
  - compra sempre o mais distante abaixo do peso-alvo, em pontos percentuais do patrimônio; empate técnico (≤0,5 pp) → BTLG11, depois CMIG4;
  - se o caixa não paga 1 cota do 1º da fila, **acumula** (não desvia para um ativo mais barato);
  - proventos 100% reinvestidos; nunca vende.
- O cockpit mostra a fila e quanto falta quando o caixa está acumulando.

## Novidades da 2.7 · Manuel sente a carteira, responde ao toque e avisa sozinho

- **2.7.4 · brilho no console:** no console do Manuel o rosto, a malha e os anéis dourados ficam mais contidos (o brilho somado estourava na tela menor); a tela cheia continua igual.
- **2.7.3 · voz no Android:** o WebView do Android não fala pela voz do navegador; agora o Manuel usa o motor de voz do próprio telemóvel (pt-BR, voz masculina quando houver), com a boca acompanhando as palavras.
- **2.7.2 · tela limpa e microfone:** saíram os botões flutuantes (microfone e ＋); registrar continua em Mais → Registrar e falar com o Manuel pela aba do topo ou pelo console. No Android, o app pede o microfone antes de ouvir e, se o sistema estiver bloqueando, mostra o aviso com o botão "Abrir permissões" (vai direto à tela do app nas configurações).
- **2.7.1 · Windows sem moldura:** a barra de título do Windows sumiu; o HUD vai até a borda da tela e os botões minimizar/maximizar/fechar ficam no canto, nas cores do app. Arrastar a barra do topo move a janela, dois cliques maximizam e F11 deixa em tela cheia total.
- **Clima da carteira:** a expressão (sério, neutro, confiante, atento) e a cor do brilho atrás da cabeça acompanham o resultado do dia: âmbar em queda, verde-água em alta. Atualiza a cada carga de dados e no radar ao vivo.
- **Toques no avatar:** um toque chama o Manuel (ele olha para onde tocou, acena e escuta); tocar enquanto ele fala o cala; dois toques pedem a leitura do dia. No terminal em tela cheia, tocar no rosto não fecha mais (fecha no ✕ ou puxando para cima).
- **Dados holográficos:** quando ele cita um ativo, o patrimônio, o caixa ou a renda, cartões com o valor flutuam ao redor do rosto por alguns segundos (verde em alta, âmbar em queda).
- **Avisos proativos:** alertas críticos e movimentos de 3% ou mais num pelotão acendem a aba em vermelho com o número de avisos e mostram um aviso rápido. Ao abrir, o Manuel lê os avisos primeiro. Cada aviso aparece uma vez por dia; ele nunca fala sem ser chamado. Com o app aberto, olha o mercado a cada 10 minutos.

## Novidades da 2.6 · Manuel vivo no console e terminal deslizante

- **Avatar no console:** o busto 3D fica no topo do console do Manuel. Ao digitar ou rolar a conversa, encolhe para só o rosto e fica preso no topo (sem anéis e com menos brilho, para não estourar em tela pequena).
- **Estados visíveis:** prontidão, ouvindo, analisando (enquanto a resposta é preparada) e falando.
- **Gestos:** acena "sim" ao confirmar uma proposta, "não" ao recusar ou em erro, e inclina a cabeça em dúvida quando precisa de mais dados.
- **Olhar:** acompanha o dedo ou o ponteiro e olha para a caixa de texto quando o Comandante começa a escrever.
- **Terminal deslizante:** em todas as telas (menos no próprio console) há uma aba discreta com um ponto âmbar a piscar, logo abaixo da barra do topo. Um toque, ou puxar a barra para baixo, faz o Manuel descer em tela cheia (0,5 s, easing `cubic-bezier(.32,.72,0,1)`), com fundo preto quase opaco, estado no cabeçalho, ✕ para fechar, a última fala ou a leitura do dia em texto e o botão "segure para falar". Puxar para cima recolhe.

## Novidades da 2.5 · Manuel em malha 3D

- **Rosto 3D "malha reativa":** cabeça em malha de fios com nós luminosos, olhos âmbar brilhando, busto em nuvem de pontos, anéis dourados com faíscas e poeira de dados. WebGL (three.js), carregado só quando o rosto abre.
- **Expressões de verdade:** a cabeça tem 52 expressões (padrão ARKit). A boca usa abrir mandíbula, arredondar, franzir e esticar conforme o visema e o volume da voz; sobrancelhas, sorriso, piscadas e olhar vêm do humor do dia e do dedo/mouse.
- **Por camadas:** aparelho forte (ex.: S24 Ultra) com brilho (bloom) e mais partículas; médio sem brilho; fraco ou "reduzir movimento" fica no rosto de fios 2D. Enquanto o 3D carrega, o 2D aparece.
- **2.5.1 · energia:** plexo ~4× mais denso (malha subdividida que mantém as expressões), brasas subindo dos olhos âmbar, rosto se desfazendo em faíscas pelas laterais, rastros rápidos de luz, cometas dourados com cauda nos anéis, brilho volumétrico atrás da cabeça e telemetria holográfica real ao fundo (patrimônio, caixa, ativos, zona e variação do dia).
- **2.5.2 · como no conceito:** íris âmbar com pupila escura, fibras e reflexo (sem estourar), pescoço e ombros em malha de plexo que some para baixo, anéis dourados com linha nítida além das partículas, mais contraste (menos bloom) e botão em degradê com ícone de microfone.
- **2.5.3 · volume:** sombreamento 3D próprio na malha (luz de frente-cima, laterais e sob o nariz/queixo mais escuras) com brilho azul profundo na silhueta, seguindo as expressões; bokeh ao fundo; menos estouro de brilho.
- **2.5.4 · como na referência:** nós irregulares e cintilantes (tamanho e brilho variam e piscam), busto em plexo irregular (pontos ligados aos vizinhos), anéis dourados largos e incandescentes cruzando o rosto, rastro horizontal de luz nos olhos e borda turquesa.
- **2.5.5 · corpo humano:** pescoço mais fino que a mandíbula e nascendo por trás dela, trapézio descendo até ombros arredondados, clavículas e esternocleidomastoideos discretos; tudo gerado de um lado e espelhado (simetria perfeita); o busto quase não gira com a cabeça.
- **2.5.6 · arte final ("A Arte da Guerra"):** o Comandante escolheu o busto "armadura": esternocleidomastoideos, clavículas, trapézio, deltoides, base do peitoral e esterno em linhas fortes, como placas; simétrico (espelhado).
- Créditos: cabeça de exemplo "facecap" do three.js (Face Cap, Bannaflak), sem texturas.

## Novidades da 2.4 · "Hey Manuel"

- **Escuta contínua opcional** (Ajustes → M.A.N.U.E.L.): com o app aberto, o Manuel atende a "olá Manuel", "ei Manuel", "bom dia Manuel"… sem tocar em nada. Bipe, o rosto aparece ouvindo, você fala o pedido; ele responde e, se fizer uma pergunta, já volta a ouvir.
- **Grátis e no aparelho:** motor Vosk com o modelo pequeno de português (~31 MB, baixado uma vez e guardado). Nada de áudio sai do aparelho na escuta; o pedido em si usa o mesmo caminho do microfone (Android nativo, Chrome ou Gemini no Windows).
- **Menos alarmes falsos:** gramática fechada só com as frases de chamada, confiança mínima na palavra "manuel" e palavras parecidas ("manual", "animal") que não chamam.
- **Economia:** pausa quando a tela some, quando o Manuel fala e quando o microfone é usado; o rosto fecha sozinho 15 s depois de terminar. Indicador no topo; tocar nele desliga.
- Teste de ponta a ponta no GitHub Actions: falas geradas por voz sintética tocadas num microfone falso (7 casos: 4 chamadas, 3 frases que não podem chamar).

## Novidades da 2.3 · Manuel fala, ouve e aparece

- **Segure para falar:** botão de microfone em todas as telas e no console. Toque curto ouve por até 8 s; segurar ouve até soltar. No Android usa o reconhecedor do próprio telemóvel (grátis); no Chrome, o do navegador; no Windows, grava e o Gemini transcreve (conta no uso de IA do dia).
- **Chamada e comandos:** "hey Manuel", "bom dia Manuel", "Manuel, leitura do dia". "Vamos registrar um aporte" → ele pergunta o valor → repete a proposta → só "confirmo" (ou o botão) grava. Números falados por extenso viram algarismos ("noventa e sete e oitenta" → 97,80).
- **Rosto de fios em tela cheia:** quando fala por voz, o Manuel toma a tela como um rosto feito dos fios do núcleo, com rodas em volta. Boca por visemas do português, sincronizada com o áudio (volume real na voz natural; início de cada palavra na voz do aparelho). Olhar que segue o dedo, piscar, e humor pelo dia da carteira (confiante, neutro, atento, sério). Legenda sempre visível.
- **Cumprimento diário:** ao abrir o app pela primeira vez no dia, saudação + leitura do dia (motor local, 0 tokens) + uma frase de motivação. Toque interrompe.
- **Limpar conversa** sem confirmação, com 5 s para desfazer.
- Preferências por aparelho em Ajustes → M.A.N.U.E.L.: rosto em tela cheia, cumprimento diário e botão de microfone.
- "Hey Manuel" com o app aberto, sem tocar em nada (escuta contínua), fica para a próxima fase.

## Novidades da 2.2 · Núcleo vivo em alta resolução

- **Resolução nativa:** em aparelhos fortes (8 núcleos ou mais, como o Galaxy S24 Ultra), o toro é desenhado na densidade real da tela, até 3×, em vez de 0,8× como antes no celular.
- **Movimento orgânico:** o toro respira, cada fio ondula e escorre pelo anel no seu próprio ritmo, pulsos de luz correm pelos fios e as pontas cintilam. Fios em curva suave, sem quinas.
- **Holograma:** mistura aditiva com uma passada de brilho; profundidade com fios mais finos e apagados no fundo.
- **Até ~1.000 fios a 60 quadros/s** nos aparelhos fortes. Se o aparelho não acompanhar, o app desliga o brilho, depois reduz fios e resolução, sozinho. Vibração curta ao selecionar e ao segurar.
- A ideia é a mesma: cada fio é patrimônio de um ativo, na proporção do valor e na cor da classe.

## Novidades da 2.1 · M.A.N.U.E.L. agente, sem voz dobrada

- **Corrigido:** clicar "ouvir" de novo enquanto a fala anterior ainda carregava fazia duas vozes tocarem juntas. Agora cada pedido tem uma geração própria: só o mais novo toca, e o botão mostra "⏳ carregando…" enquanto espera.
- **M.A.N.U.E.L. deixa de ser só um leitor de números:** antes, sem o prefixo "ia:", toda mensagem caía no motor local — mesmo perguntas abertas, de opinião ou de bate-papo, que voltavam com "use ia: para isso". Agora só o que é dado puro e determinístico (leitura, zona, Magic Number, marcos, renda, um ativo) é respondido localmente, de graça; qualquer coisa que peça interpretação, sugestão ou cenário vai direto para a IA, sem precisar de prefixo.
- **Personalidade mais alerta:** o prompt do sistema passa a pedir que M.A.N.U.E.L. leia o cenário e sugira um movimento ou aponte um alerta por conta própria, não só responda o que foi perguntado — com humor leve nas horas boas e seriedade total em perdas, caixa no vermelho ou decisões de risco.

## Novidades da 2.0.1 · Núcleo em toro

- O centro do cockpit trocou os anéis por um **toro 3D de fios**, inspirado num painel de pesquisa. Cada fio é uma parte do patrimônio de um ativo, na proporção do valor, colorido pela classe: dourado para FIIs, branco para ações, violeta para ETF e ciano para cripto.
- O patrimônio fica no furo do toro, e as chamadas nos cantos continuam: marco, maior pelotão e zona de ataque.
- Uma mira percorre os ativos (compras do plano primeiro), com um rótulo do candidato embaixo.
- **Interativo (2.0.2):**
  - **Arrastar** gira o toro, com inércia; no mouse, arrastar na vertical também inclina.
  - **Tocar** ou clicar num fio seleciona o ativo: os fios dele acendem em dourado e abre um painel com preço, variação, cotas, PM, valor, renda, Magic Number e peso contra o alvo.
  - **Segurar** faz uma varredura: o toro cresce, acelera e acende; ao soltar, volta ao normal.
  - **Passar o mouse** no PC realça o ativo sob o cursor.
- O resto do app não mudou. O painel completo da 2.0.0 foi desfeito, e o código dele fica no histórico do repositório.
- **Leve:**
  - até 24 quadros/s (20 no celular), só com o núcleo visível;
  - menos fios se o aparelho não acompanhar;
  - parado com "reduzir movimento", mas ainda responde ao toque.

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
