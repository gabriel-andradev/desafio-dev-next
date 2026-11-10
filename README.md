# Cobuccio Wallet — Carteira Financeira Digital

Solução Full Stack de Carteira Digital desenvolvida para o desafio técnico do **Grupo Adriano Cobuccio / Brasil Card**. A aplicação permite cadastro de usuários, autenticação segura via JWT, depósitos, transferências P2P atômicas com validação de saldo, cobertura automática de saldo negativo e estorno (reversão) auditável de operações.

---

## Arquitetura & Decisões Técnicas

### 1. Precisão Monetária em Centavos (`Int`)
Valores financeiros nunca são processados ou armazenados em ponto flutuante (`float`/`double`) para evitar erros de arredondamento binário do padrão IEEE 754 (ex: `0.1 + 0.2 = 0.30000000000000004`). Toda a aritmética contábil utiliza inteiros representando centavos (`R$ 10,50` = `1050`), com validação estrita no Value Object [`Money`](./backend/src/modules/wallet/domain/money.vo.ts).

### 2. DDD, Clean Architecture & TDD
- **Domínio Isolado (`backend/src/modules/wallet/domain/`)**: O Value Object `Money` e a classe `TransactionDomainRules` concentram as invariantes de negócio (proibição de auto-transferência, verificação de cobertura de saldo, permissão de participante na reversão e bloqueio de estorno duplicado) sem acoplamento com o ORM.
- **TDD (Test-Driven Development)**: Suítes de testes unitários no domínio, nos serviços de backend, testes de integração E2E (`supertest`) e testes unitários nos conversores monetários do frontend.

### 3. Transações ACID & Prevenção contra Concorrência (Double-Spending)
Todas as mutações financeiras rodam dentro de transações interativas do Prisma (`$transaction`). Nas transferências, o débito do remetente utiliza atualização condicional atômica no banco de dados:
```ts
await tx.wallet.updateMany({
  where: { id: senderWallet.id, balanceCents: { gte: money.valueInCents } },
  data: { balanceCents: { decrement: money.valueInCents } },
});
```
Isso garante que a checagem de saldo e o débito ocorram na mesma instrução SQL atômica com lock de linha, prevenindo condições de corrida (*Time-of-Check to Time-of-Use* / *TOCTOU*).

### 4. Ledger Contábil Imutável, Reversão & Saldo Negativo
- **Reversibilidade Auditável**: Nenhuma transação é deletada do banco (`DELETE`). Ao solicitar a reversão de um depósito ou transferência, a operação original é marcada como `REVERSED` e um contra-lançamento (`type: REVERSAL`) é registrado vinculado ao `originalTransactionId` (protegido por constraint `@unique` no banco para garantir idempotência absoluta).
- **Recuperação de Saldo Negativo**: Caso uma conta fique com saldo negativo após um estorno, o próximo depósito realiza a soma algébrica direta (`increment`), abatendo o valor devedor e acrescentando o excedente ao saldo disponível.

### 5. Next.js 15 App Router, Server Actions & Segurança (`httpOnly`)
- O token JWT retornado pelo backend é armazenado exclusivamente em cookie `httpOnly` pelas **Server Actions**, impedindo leitura via JavaScript no navegador e mitigando ataques XSS.
- As operações de depósito, transferência e reversão utilizam Server Actions com `revalidatePath('/dashboard')`, atualizando o saldo e o extrato em tempo real sem necessidade de estado complexo no cliente.

---

## Stack Tecnológica

- **Backend:** Node.js, Nest.js 10, TypeScript, Prisma ORM, Passport JWT, Bcryptjs, Class-Validator, Swagger (OpenAPI), Jest & Supertest.
- **Frontend:** Next.js 15 (App Router), React 19, Server Actions, Tailwind CSS, Lucide Icons, Jest.
- **Infraestrutura & Qualidade:** Docker & Docker Compose, Healthcheck (`/api/health`), Logging Interceptor e auditoria estática com `react-doctor` (Score 100/100).

---

## Como Executar o Projeto Localmente

### 1. Configurar e Rodar o Backend (`porta 3333`)
```bash
cd backend
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```
- **API Base:** `http://localhost:3333/api`
- **Documentação Swagger:** `http://localhost:3333/api/docs`
- **Healthcheck:** `http://localhost:3333/api/health`

### 2. Configurar e Rodar o Frontend (`porta 3000`)
Em outro terminal:
```bash
cd frontend
npm install
npm run dev
```
- **Aplicação Web:** `http://localhost:3000`

---

## Contas de Demonstração (Criadas pelo Seed)

Após rodar `npm run db:seed` na pasta `backend`, você pode acessar imediatamente com:

| Titular | E-mail | Senha | CPF | Saldo Inicial |
| :--- | :--- | :--- | :--- | :--- |
| **Gabriel Silva** | `gabriel@cobuccio.com` | `password123` | `123.456.789-01` | `R$ 1.450,00` |
| **Bruno Invest** | `bruno@cobuccio.com` | `password123` | `987.654.321-00` | `R$ 550,00` |

---

## Executando com Docker Compose

```bash
docker compose up --build
```

---

## Executando os Testes Automatizados

### Backend (Unitários TDD + Integração E2E)
```bash
cd backend
npm test
npm run test:e2e
```

### Frontend (Unitários TDD + Auditoria React Doctor)
```bash
cd frontend
npm test
npx react-doctor@latest --verbose
```

