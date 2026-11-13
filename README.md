# ⚽ TiraTime — Urna Ao Vivo & Sorteio de Pelada

O **TiraTime** é um sistema web moderno para substituir o sorteio no papel da sua pelada. O organizador cola a lista do WhatsApp, gera o link da partida e cada jogador acessa pelo celular para **tirar sua bolinha na urna ao vivo**, acompanhando na aba **Times** a formação das equipes em tempo real com prancheta tática.

## ✨ Funcionalidades Principais

- **Urna Ao Vivo (Principal):** cada jogador toca no próprio nome ao chegar na quadra (ou pelo grupo) e puxa sua bolinha da urna virtual, mantendo o equilíbrio entre **Time 1**, **Time 2**, **Time 3** (ou **2 a 4 times**, configurável de **4 a 10 na linha + 1 no gol**).
- **Aba `Times` com Prancheta Tática:** exibe o posicionamento em meio-campo e as vagas (`Na urna` → jogador revelado) sendo preenchidas ao vivo via Server-Sent Events (SSE) + sincronização automática.
- **Importador Inteligente de Lista do WhatsApp:** reconhece automaticamente data, horário, valor da pelada, goleiros, vagas em aberto, convidados (`(convidado)`, `(Conv. ...)`) e jogadores em dúvida (`(dúvida - ...)`).
- **Painel do Organizador (protegido por PIN e token rotativo):** alteração de PIN próprio com rotação automática do token de acesso, configuração de quantidade de times/linha com prévia tática, controle de quem já pagou (`R$`), troca rápida de dinâmica (**Urna Ao Vivo** / **Sorteio Fechado**), personalização de cores/nomes e exportação formatada para o WhatsApp.

## ⚙️ Configuração (.env)

Copie o arquivo de exemplo antes de iniciar:

```bash
cp .env.example .env
```

Defina um `ADMIN_PIN` seguro no seu `.env` (mínimo 3 caracteres). Se `ADMIN_PIN` não for definido na primeira execução local, um PIN aleatório de 6 dígitos será gerado automaticamente e exibido uma única vez no terminal.

## 🚀 Como rodar localmente

Requer **Node.js 22+** (usa o banco nativo `node:sqlite`, sem dependências externas compiladas):

```bash
npm install
npm start
```

Acesse no navegador em `http://localhost:3010`.

Para ambiente de desenvolvimento com recarregamento automático:

```bash
npm run dev
```

## 🧪 Testes Automatizados

```bash
npm test
```

## ☁️ Publicar na Vercel

O projeto já vem pronto com `vercel.json` e Serverless Function em `api/index.mjs`:

1. Suba este repositório no seu **GitHub** e importe na **Vercel**.
2. Nas **Environment Variables** do projeto na Vercel, configure `ADMIN_PIN` com o PIN desejado para o painel do organizador.
3. A Vercel executa `npm run build` para gerar o frontend em `dist/` e roteia `/api/*` para `api/index.mjs`.
