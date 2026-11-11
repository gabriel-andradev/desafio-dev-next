# Cobuccio Wallet — Carteira Financeira (Node.js · NestJS · Next.js)

Carteira financeira full stack desenvolvida para o desafio técnico do **Grupo Adriano Cobuccio / Brasil Card**: cadastro e autenticação de usuários, depósitos, transferências entre usuários (por e-mail ou CPF), validação de saldo, recuperação de saldo negativo e estorno auditável de operações.

> O mesmo domínio também foi implementado em **PHP/Laravel** (repositório `desafio-dev-php`). As regras de negócio, o modelo de dados e as contas de demonstração são idênticos nas duas versões; a seção [Mesmo domínio, duas stacks](#9-mesmo-domínio-duas-stacks) resume o que muda.

---

## 1. Como executar

### Opção A — Docker Compose (recomendado)

```bash
docker compose up --build
```

Não é preciso criar `.env`: o compose já define todas as variáveis com valores de desenvolvimento. Na subida, o backend aplica as migrations e roda o seed automaticamente.

| Serviço | URL |
| :--- | :--- |
| Aplicação web (Next.js) | http://localhost:3000 |
| API REST (NestJS) | http://localhost:3333/api |
| Documentação Swagger | http://localhost:3333/api/docs |
| Healthcheck | http://localhost:3333/api/health |

> O `JWT_SECRET` padrão do compose é só para uso local. Para sobrescrever: `JWT_SECRET=... docker compose up --build`.

### Opção B — Local (Node 20+)

**Backend** (porta 3333):
```bash
cd backend
cp .env.example .env          # ajuste JWT_SECRET
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev
```

**Frontend** (porta 3000), em outro terminal:
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

---

## 2. Contas de demonstração

Criadas pelo seed. Senha de todas: `password123`.

| Titular | E-mail | CPF | Saldo inicial | Para que serve |
| :--- | :--- | :--- | :--- | :--- |
| Gabriel Cobuccio | `gabriel@cobuccio.com` | `111.222.333-44` | R$ 1.450,00 | Saldo positivo com histórico de depósito e transferência |
| Bruno Costa | `bruno@cobuccio.com` | `555.666.777-88` | R$ 800,00 | Destinatário/remetente para testar transferências |
| Mariana Souza | `mariana@cobuccio.com` | `999.888.777-66` | **−R$ 250,00** | Saldo negativo após um estorno: um depósito abate a dívida |

---

## 3. Regras de negócio

Estas regras são as mesmas na versão PHP.

**Cadastro e acesso**
- E-mail e CPF são únicos. O cadastro cria o usuário e a carteira (saldo zero) na mesma transação.
- Nome de 3 a 100 caracteres; senha de 8 a 72 caracteres (o limite de 72 é o máximo que o bcrypt considera).
- Falha de login retorna mensagem genérica, sem revelar se o e-mail existe.

**Depósito**
- Valor de R$ 0,01 a R$ 1.000.000,00 por operação; descrição opcional de até 140 caracteres.
- Se a carteira estiver negativa, o depósito abate a dívida e o excedente vira saldo disponível.

**Transferência**
- Destinatário identificado por e-mail ou CPF; não é permitido transferir para a própria carteira.
- Só é permitida se o remetente tiver saldo suficiente. Débito e crédito acontecem na mesma transação.

**Estorno (reversão)**
- Nenhuma operação é apagada: a original passa a `REVERSED` e um contra-lançamento `REVERSAL` é criado, ligado a ela por `originalTransactionId` (único no banco, o que impede estornar duas vezes).
- Estornos não podem ser estornados. Motivo opcional de até 200 caracteres.
- Quem pode estornar e até quando:

| Operação | Quem | Prazo | Motivação |
| :--- | :--- | :--- | :--- |
| Transferência | Remetente | 15 minutos | Arrependimento / erro de digitação |
| Transferência | Destinatário | 24 horas | Devolução voluntária de um valor recebido por engano |
| Depósito | Titular da carteira | 24 horas | Depósito duplicado ou inconsistente |

- O estorno pode deixar o saldo negativo (ex.: o destinatário já gastou o valor recebido). Esse saldo é recuperado no próximo depósito.

**Idempotência**
- Depósitos e transferências aceitam uma chave de idempotência (header `X-Idempotency-Key` ou campo `idempotencyKey`). As Server Actions do frontend geram um UUID por envio.
- Repetir a mesma chave devolve a transação original, sem mover dinheiro de novo (`isIdempotentReplay: true`).
- Reutilizar a chave em outra operação (outro valor, tipo ou carteira) retorna **409** e não move dinheiro.

**Limite de requisições**
- Login e cadastro: 10 por minuto. Depósito, transferência e estorno: 30 por minuto. Demais rotas: 120 por minuto. Acima disso, **429**.

---

## 4. Modelo de dados

Três tabelas, iguais em conceito e relacionamentos à versão PHP. Valores sempre em **centavos inteiros**.

```
users (1) ──── (1) wallets (1) ──┬── (N) transactions  [como remetente: senderWalletId]
                                 └── (N) transactions  [como destinatário: receiverWalletId]
transactions (1) ──── (0..1) transactions  [estorno → original: originalTransactionId]
```

| Tabela | Campos principais |
| :--- | :--- |
| `users` | `id` (UUID), `name`, `email` único, `cpf` único, `passwordHash` |
| `wallets` | `id` (UUID), `userId` único, `balanceCents` (pode ser negativo) |
| `transactions` | `id` (UUID), `type` (`DEPOSIT`/`TRANSFER`/`REVERSAL`), `status` (`COMPLETED`/`REVERSED`), `amountCents`, `senderWalletId` (nulo em depósitos), `receiverWalletId`, `originalTransactionId` único, `reversalReason`, `reversedAt`, `idempotencyKey` único |

---

## 5. API REST

Prefixo `/api`. Rotas de carteira e usuário exigem `Authorization: Bearer <JWT>`. Documentação interativa em `/api/docs`.

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Cadastro (cria a carteira) |
| `POST` | `/auth/login` | Login, retorna o JWT |
| `GET` | `/users/me` | Usuário autenticado |
| `GET` | `/users/recipients` | Possíveis destinatários |
| `GET` | `/wallet` | Saldo e extrato |
| `GET` | `/wallet/transactions` | Extrato |
| `POST` | `/wallet/deposit` | Depósito |
| `POST` | `/wallet/transfer` | Transferência |
| `POST` | `/wallet/transactions/:id/reverse` | Estorno |
| `GET` | `/health` | Healthcheck com verificação do banco |

---

## 6. Decisões técnicas

**Arquitetura.** O NestJS expõe a API REST; o Next.js (App Router) funciona como BFF: as páginas são Server Components e todas as mutações passam por **Server Actions**, que chamam a API no servidor e fazem `revalidatePath('/dashboard')`. O navegador nunca fala direto com a API.

**Autenticação.** A API emite um JWT; a Server Action de login o guarda em cookie `httpOnly` + `sameSite=lax` (`secure` em produção). Como o token não fica acessível a JavaScript, um XSS não consegue roubá-lo.

**Domínio isolado.** O value object `Money` e `TransactionDomainRules` (`backend/src/modules/wallet/domain/`) concentram as invariantes — saldo suficiente, auto-transferência, quem pode estornar e prazos — sem depender do Prisma, e são testados de forma unitária.

**Dinheiro em centavos.** Toda a aritmética usa inteiros, evitando os erros de arredondamento de ponto flutuante (`0.1 + 0.2 ≠ 0.3`).

**Concorrência e gasto duplo.** Cada operação roda em `prisma.$transaction`. O débito da transferência é uma atualização condicional:

```ts
await tx.wallet.updateMany({
  where: { id: senderWallet.id, balanceCents: { gte: money.valueInCents } },
  data: { balanceCents: { decrement: money.valueInCents } },
});
```

Checagem de saldo e débito acontecem no mesmo `UPDATE`; se outra operação consumiu o saldo antes, nenhuma linha é afetada e a transferência é recusada. Isso elimina a janela entre "verificar" e "debitar" (TOCTOU). No SQLite, as escritas já são serializadas no nível do banco (não há lock por linha); o `UPDATE` condicional garante a regra mesmo assim e continuaria correto num banco com locks por linha, como PostgreSQL.

---

## 7. Testes e qualidade

```bash
cd backend && npm test          # 31 testes unitários (domínio, DTOs e serviços)
cd backend && npm run test:e2e  # 5 testes de integração (Supertest)
cd frontend && npm test         # 14 testes unitários (formatadores)
```

**50 testes** no total. O frontend também foi auditado com `npx react-doctor@latest --verbose`.

---

## 8. Limitações conhecidas

- **SQLite** atende ao desafio, mas serializa todas as escritas; em produção a escolha seria PostgreSQL (o schema Prisma troca de provider sem mudanças no código).
- Duas requisições **simultâneas** com a mesma chave de idempotência: a segunda esbarra no índice único e falha, em vez de devolver a transação da primeira. Nenhum valor é movimentado duas vezes. A versão PHP trata esse caso devolvendo a transação original.
- O limite de requisições é guardado em memória: reinicia com o processo e não é compartilhado entre instâncias.

---

## 9. Mesmo domínio, duas stacks

| Aspecto | Esta versão (Node) | Versão PHP |
| :--- | :--- | :--- |
| Backend | NestJS 10 + Prisma 6 | Laravel 13 + Eloquent |
| Frontend | Next.js 15 / React 19, Server Actions (BFF) | Blade + Alpine.js + Tailwind (monólito) |
| Banco | SQLite | MySQL 8 (Docker) ou SQLite (local) |
| IDs | UUID | inteiros autoincrementais |
| Autenticação | JWT em cookie `httpOnly` | Sessão Laravel + CSRF |
| Gasto duplo | `UPDATE` condicional (`balanceCents >= valor`) | `SELECT ... FOR UPDATE` em ordem de ID |
| Rate limit | `@nestjs/throttler` | `RateLimiter` + middleware `throttle` |
| Testes | Jest + Supertest (50) | PHPUnit (41) + PHPStan nível 8 + Pint |

Regras de negócio, prazos de estorno, limites de valor, idempotência, modelo de dados e contas de demonstração são os mesmos nas duas.
