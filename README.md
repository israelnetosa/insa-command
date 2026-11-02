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
