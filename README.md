# ⚽ TiraTime — Urna Ao Vivo & Sorteio de Pelada

O **TiraTime** é um sistema web moderno para substituir o sorteio no papel da sua pelada. O organizador cola a lista do WhatsApp, gera o link da partida e cada jogador acessa pelo celular para **tirar sua bolinha na urna ao vivo**, acompanhando na aba **Times** a formação das equipes em tempo real com prancheta tática.

## ✨ Funcionalidades Principais

- **Salas por Pelada (sem login):** qualquer organizador cria sua própria sala na hora informando apenas **nome da pelada** e um **PIN** (mínimo 4 caracteres), sem precisar criar conta. A sala começa limpa (sem dados fictícios) até você adicionar ou colar a lista de jogadores.
- **Urna Ao Vivo (Principal):** cada jogador toca no próprio nome ao chegar na quadra (ou pelo grupo) e puxa sua bolinha da urna virtual, mantendo o equilíbrio entre **Time 1**, **Time 2**, **Time 3** (ou **2 a 4 times**, configurável de **4 a 10 na linha + 1 no gol**).
- **Aba `Times` com Prancheta Tática:** exibe o posicionamento em meio-campo e as vagas (`Na urna` → jogador revelado) sendo preenchidas ao vivo via Server-Sent Events (SSE) + sincronização automática.
- **Importador Inteligente de Lista do WhatsApp:** reconhece automaticamente data, horário, valor da pelada, goleiros, vagas em aberto, convidados (`(convidado)`, `(Conv. ...)`) e jogadores em dúvida (`(dúvida - ...)`).
- **Painel do Organizador (protegido pelo PIN da sala e token rotativo):** edição dos dados da pelada, alteração de PIN com rotação automática do token de acesso, configuração de quantidade de times/linha com prévia tática, controle de quem já pagou (`R$`), troca rápida de dinâmica (**Urna Ao Vivo** / **Sorteio Fechado**), personalização de cores/nomes e exportação formatada para o WhatsApp.

## ⚙️ Configuração (.env)

Se quiser ajustar porta, caminho do banco ou CORS, copie o arquivo de exemplo antes de iniciar:

```bash
cp .env.example .env
```

## 🚀 Como rodar localmente

Requer **Node.js 22+** (usa o banco nativo `node:sqlite` localmente, sem dependências externas compiladas):

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
