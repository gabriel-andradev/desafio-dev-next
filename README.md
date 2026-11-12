# Cobuccio Wallet — Node.js · NestJS · Next.js

Carteira financeira digital feita para o desafio técnico full stack do **Grupo Adriano Cobuccio**: cadastro, autenticação, depósitos, transferências entre usuários, extrato e estorno de operações.

O mesmo produto também foi implementado em **PHP/Laravel** (repositório `desafio-dev-php`). As regras de negócio, os limites e as contas de demonstração são os mesmos; a arquitetura de cada um segue o próprio framework. A comparação completa está em [`docs/COMPARACAO_TECNICA.md`](docs/COMPARACAO_TECNICA.md).

**Diferenciais implementados:** valores em centavos inteiros, ledger imutável com estorno por contra-lançamento, idempotência de depósitos e transferências, proteção contra gasto duplo testada com processos Node independentes, compensação interna auditável, revogação do JWT no logout, limite de requisições e BFF com JWT em cookie `httpOnly`.

---

## 1. Visão geral

| Funcionalidade | O que faz |
| :--- | :--- |
| Cadastro | Cria o usuário e a carteira (saldo zero) numa única transação |
| Autenticação | Login com e-mail e senha; sessão por JWT guardado em cookie `httpOnly` |
| Dashboard | Saldo, totais, atalhos e últimas movimentações |
| Depósito | Credita a carteira; se o saldo estiver negativo, quita a dívida primeiro |
| Transferência | Envia dinheiro a outro usuário por e-mail ou CPF |
| Extrato | Histórico com filtros, situação de cada operação e prazos de estorno |
| Estorno | Reverte depósitos e transferências criando um lançamento `REVERSAL` |

---

## 2. Regras de negócio

> Estas regras são idênticas no projeto PHP.

**Cadastro**
- Nome: 3 a 100 caracteres. E-mail: normalizado (sem espaços, minúsculo). CPF: exatamente 11 dígitos, gravado sem máscara (não há validação de dígito verificador em nenhuma das versões).
- Senha: 8 a 72 caracteres (72 é o limite que o bcrypt considera), gravada com hash bcrypt.
- E-mail e CPF únicos: duplicidade retorna **409**.

**Valores**
- Sempre em centavos inteiros (`R$ 10,50` → `1050`); nunca ponto flutuante.
- Por operação: mínimo R$ 0,01 e máximo **R$ 1.000.000,00**. O teto é uma decisão conservadora desta implementação, não um requisito do desafio, e fica centralizado em `Money.MAX_OPERATION_CENTS`.

**Depósito:** soma o valor ao saldo. Com saldo de −R$ 50,00, um depósito de R$ 100,00 deixa R$ 50,00 disponíveis.

**Transferência:** destinatário por e-mail ou CPF; não pode ser a própria carteira; exige saldo suficiente. Débito, crédito e registro acontecem numa única transação. Uma transferência nunca deixa o saldo negativo.

**Estorno**
- A operação original passa a `REVERSED` e é criado um lançamento `REVERSAL` ligado a ela (`originalTransactionId`, único). Nada é apagado.
- Um estorno não pode ser estornado, e a mesma operação não pode ser estornada duas vezes (**409**).
- O estorno pode deixar o saldo negativo, se quem recebeu já gastou o valor; o próximo depósito regulariza.

| Operação | Quem pode estornar | Prazo |
| :--- | :--- | :--- |
| Transferência | Remetente | 15 minutos |
| Transferência | Destinatário (devolução) | 24 horas |
| Depósito | Titular | 24 horas |

Os prazos são uma política desta aplicação, não do enunciado.

**Compensação por inconsistência técnica:** um estorno interno, sem as janelas de prazo do usuário, para corrigir erros técnicos (ex.: crédito duplicado encontrado numa conciliação). Não existe rota HTTP para isso: só o script `npm run wallet:compensate` (executado no servidor) chama a operação. Exige justificativa (mín. 10 caracteres) e responsável, grava `reversalSource = COMPENSATION` e `reversalActor = operator:<nome>` no lançamento `REVERSAL`, e não compensa duas vezes a mesma operação.

```bash
npm run wallet:compensate -- --transaction=<id> "--reason=Crédito duplicado na conciliação" --operator=<responsável>
# no container: docker exec cobuccio-wallet-api node dist/src/scripts/compensate.js --transaction=... "--reason=..." --operator=...
```

**Idempotência:** depósitos e transferências aceitam uma chave (`X-Idempotency-Key` ou campo `idempotencyKey`). Repetir a chave devolve a operação original sem mover dinheiro; reutilizá-la em outra operação — ou usar a chave de outro usuário — retorna **409**, sem expor a operação original.

**Limite de requisições:** login e cadastro, 10/min; operações da carteira, 30/min; demais rotas, 120/min. Acima disso, **429**.

**Códigos HTTP:** 201 criação · 200 consulta e estorno · 401 não autenticado/credencial inválida · 403 sem permissão · 404 inexistente · 409 conflito · 422 dado inválido ou regra violada · 429 limite.

---

## 3. Stack

| Camada | Tecnologia |
| :--- | :--- |
| Frontend / BFF | Next.js 15 (App Router, Server Actions), React 19, Tailwind CSS |
| API | NestJS 10, TypeScript, class-validator, Passport JWT, bcryptjs, @nestjs/throttler, Swagger |
| Dados | Prisma 6 + SQLite |
| Testes | Jest, Supertest |
| Infra | Docker Compose |

---

## 4. Arquitetura

O navegador só conversa com o Next.js. As páginas são Server Components e as mutações são Server Actions, que chamam a API NestJS do lado do servidor repassando o JWT no header `Authorization`.

```mermaid
flowchart LR
    B[Navegador] -->|HTML + Server Actions<br/>cookie httpOnly| N[Next.js 15<br/>BFF]
    N -->|REST + Bearer JWT| C[Controllers NestJS<br/>DTOs + JwtAuthGuard + Throttler]
    C --> S[Services<br/>WalletService / AuthService]
    S --> D[Domínio<br/>Money · TransactionDomainRules]
    S --> P[Prisma Client<br/>$transaction]
    P --> DB[(SQLite)]
```

| Pasta | Responsabilidade |
| :--- | :--- |
| `frontend/src/app` | Páginas (Server Components) |
| `frontend/src/actions` | Server Actions: validam, chamam a API, revalidam o dashboard |
| `backend/src/modules/*/dto` | Validação de entrada (class-validator) |
| `backend/src/modules/wallet/domain` | Regras puras, sem ORM: `Money`, `TransactionDomainRules` |
| `backend/src/modules/wallet/wallet.service.ts` | Transações, idempotência e escrita no ledger |

---

## 5. Fluxos principais

**Transferência**

```mermaid
sequenceDiagram
    participant U as Navegador
    participant N as Next.js (Server Action)
    participant A as NestJS
    participant DB as SQLite
    U->>N: envia formulário (+ chave de idempotência)
    N->>A: POST /wallet/transfer (Bearer JWT)
    A->>DB: chave já usada? → devolve a original
    A->>DB: BEGIN
    A->>DB: UPDATE saldo -= v WHERE saldo >= v
    alt nenhuma linha alterada
        A-->>N: 422 saldo insuficiente (ROLLBACK)
    else débito feito
        A->>DB: crédito no destinatário + INSERT TRANSFER
        A->>DB: COMMIT
        A-->>N: 201
    end
    N-->>U: revalida o dashboard
```

**Estorno e recuperação de saldo negativo**

```mermaid
flowchart TD
    R[Pedido de estorno] --> V{Participante?<br/>Dentro do prazo?<br/>Ainda COMPLETED?}
    V -->|não| E[403 / 422 / 409]
    V -->|sim| T[UPDATE status = REVERSED<br/>WHERE status = COMPLETED]
    T --> M[Devolve os valores<br/>saldo pode ficar negativo]
    M --> L[INSERT REVERSAL ligado à original]
    L --> D[Próximo depósito soma ao saldo<br/>e quita a dívida]
```

**Cadastro e login:** o cadastro valida o DTO, verifica duplicidade (409), grava usuário + carteira e devolve um JWT. O login compara o hash bcrypt e devolve um JWT; em ambos a Server Action grava o token no cookie.

---

## 6. Modelo de dados

```mermaid
erDiagram
    users ||--|| wallets : possui
    wallets ||--o{ transactions : "envia (senderWalletId)"
    wallets ||--o{ transactions : "recebe (receiverWalletId)"
    transactions ||--o| transactions : "é estornada por (originalTransactionId)"

    users { string id PK "UUID"
            string name
            string email UK
            string cpf UK
            string passwordHash
            int tokenVersion "revoga JWTs no logout" }
    wallets { string id PK
              string userId UK
              int balanceCents }
    transactions { string id PK
                   string type "DEPOSIT | TRANSFER | REVERSAL"
                   string status "COMPLETED | REVERSED"
                   int amountCents
                   string senderWalletId FK "nulo em depósitos"
                   string receiverWalletId FK
                   string originalTransactionId UK
                   string idempotencyKey UK
                   string reversalReason
                   string reversalSource "USER | COMPENSATION"
                   string reversalActor "user:id | operator:nome"
                   datetime createdAt
                   datetime reversedAt }
```

Índices em `senderWalletId`, `receiverWalletId` e `createdAt` (consultas do extrato).

---

## 7. Autenticação e segurança

- **JWT:** emitido pela API (`JWT_SECRET`, expiração `JWT_EXPIRES_IN`), validado pelo `JwtStrategy`/`JwtAuthGuard`, que também confere se o usuário ainda existe.
- **Logout revoga o token:** cada usuário tem uma versão de sessão (`tokenVersion`) gravada no JWT (`ver`). O logout chama `POST /api/auth/logout`, que incrementa a versão; todo token emitido antes passa a receber **401**. Efeito colateral aceito: o logout encerra a sessão em todos os dispositivos.
- **Cookie:** o token fica num cookie `httpOnly` + `SameSite=Lax` (`Secure` em produção); o JavaScript do navegador não consegue lê-lo.
- **CSRF:** JWT não protege contra CSRF por si só — o que protege é a combinação de: mutações apenas via Server Actions (POST), a verificação do Next.js que rejeita Server Actions cujo `Origin` não corresponde ao `Host`, e o cookie `SameSite=Lax`, que não é enviado em POSTs de outros sites. A API NestJS não lê cookies: só aceita `Authorization: Bearer`.
- **Dados pessoais:** a lista de contatos mostra o CPF mascarado (`***.666.777-**`); o CPF completo de outros usuários não sai da API.
- **Entrada:** `ValidationPipe` com `whitelist` e `forbidNonWhitelisted` (campos extras são rejeitados). Erros 500 não expõem detalhes ao cliente.
- **Autorização:** só o titular vê a própria carteira; estornar exige ser participante da operação.

---

## 8. Persistência e consistência

- **SQLite + Prisma Migrate.** Toda operação financeira roda em `prisma.$transaction`.
- **Gasto duplo:** o débito é um `UPDATE` condicional (`balanceCents >= valor`). SQLite não tem lock por linha — serializa as escritas no banco inteiro —, e o `UPDATE` condicional garante a regra mesmo assim.
- **Concorrência entre processos:** `test/concurrency` sobe **dois processos Node independentes** sobre o mesmo arquivo SQLite: duas transferências simultâneas (uma passa, a outra recebe 422), duas requisições com a mesma chave (um crédito, um replay) e uma falha no meio da transação (rollback completo).
- **`SQLITE_BUSY`:** o Prisma espera a trava do SQLite; se ainda assim vier `database is locked` ou conflito de escrita (P2034), a operação inteira foi desfeita e é repetida até 3 vezes com espera curta. Nos testes entre processos, nenhuma requisição terminou em erro de trava.
- **Estorno duplicado:** a mudança para `REVERSED` só acontece `WHERE status = COMPLETED`; um segundo pedido não altera nada e recebe 409.
- **Idempotência concorrente:** se duas requisições com a mesma chave passam juntas pela verificação, o índice único faz a segunda transação inteira ser desfeita, e ela devolve a operação da primeira.
- **Rollback:** testado com uma falha simulada depois do débito e do crédito; nenhum saldo muda.

---

## 9. Como executar

**Pré-requisitos:** Docker, ou Node.js 20+.

### Docker (recomendado)

```bash
docker compose up --build
```

Não precisa de `.env`. O backend aplica as migrations e o seed ao subir; o banco fica no volume `api_data` e sobrevive a `docker compose down`/`up` e a rebuilds.

| Serviço | URL |
| :--- | :--- |
| Aplicação | http://localhost:3000 |
| API | http://localhost:3333/api |
| Swagger | http://localhost:3333/api/docs |

O `JWT_SECRET` padrão do compose é só para uso local (`JWT_SECRET=... docker compose up --build` para trocar).

### Local

```bash
cd backend
cp .env.example .env        # defina JWT_SECRET
npm install
npx prisma migrate deploy
npm run db:seed
npm run start:dev           # http://localhost:3333
```

O seed só popula um banco **vazio** (não altera contas existentes).

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

---

## 10. Usuários de demonstração

Criados pelo seed (iguais aos do projeto PHP). Senha de todos: `password123`.

| Titular | E-mail | Saldo inicial | Cenário |
| :--- | :--- | :--- | :--- |
| Gabriel Cobuccio | `gabriel@cobuccio.com` | R$ 1.450,00 | Histórico de depósito e transferência |
| Bruno Costa | `bruno@cobuccio.com` | R$ 800,00 | Destinatário de transferências |
| Mariana Souza | `mariana@cobuccio.com` | −R$ 250,00 | Saldo negativo após estorno |

---

## 11. Testes

```bash
cd backend && npm test           # 37 testes unitários (domínio, DTOs, serviços)
cd backend && npm run test:e2e   # 25 testes: integração, paridade, compensação e concorrência entre processos
cd frontend && npm test          # 14 testes unitários (formatadores)
```

Resultado da última execução: **76 testes, todos passando**. Os testes e2e usam um banco próprio (`backend/test/e2e.db`, recriado a cada execução) e nunca o `dev.db`.

O arquivo `backend/test/parity.e2e-spec.ts` reproduz os mesmos cenários do teste `ParityScenariosTest` do projeto PHP: duplicidade, valores inválidos, autotransferência, destinatário inexistente, transferências simultâneas, idempotência simultânea, chave reutilizada, rollback, regras de estorno e limite de requisições.

---

## 12. Decisões técnicas

- **BFF com Next.js:** o token nunca chega ao JavaScript do navegador e a API não precisa aceitar cookies (nem lidar com CSRF).
- **Domínio sem ORM:** as regras financeiras são testadas sem banco.
- **`UPDATE` condicional em vez de lock:** funciona igual em SQLite e PostgreSQL e não depende de lock por linha.
- **Chave de idempotência gerada no formulário:** um duplo clique ou nova tentativa reaproveita a chave; ela só muda depois de um sucesso.

---

## 13. Limitações conhecidas

- Não há gateway de pagamento, integração bancária nem webhooks: o dinheiro é apenas um saldo interno.
- SQLite serializa todas as escritas; para volume real, PostgreSQL (o schema Prisma troca de provider).
- O limite de requisições fica em memória: reinicia com o processo e não é compartilhado entre instâncias.
- A compensação técnica não tem tela: é executada por linha de comando por quem tem acesso ao servidor. Não há papéis administrativos na aplicação.
- A concorrência foi testada com dois processos na mesma máquina, não sob carga real com vários servidores.
