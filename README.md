# Mini CRM de Leads Industriais (Next.js 14 + MongoDB)

Aplicação web para gestão de leads industriais com autenticação por papéis, importação de planilha, kanban por estágio, histórico de atividades, dashboard de desempenho e exportação CSV.

## Pré-requisitos

- Node.js 18+
- MongoDB Atlas ou instância local acessível via string de conexão.

## Variáveis de ambiente

1. Copie `.env.local.example` para `.env.local`.
2. Preencha:
   - `MONGO_URL_MONGODB_URI` – string de conexão do MongoDB.
   - `NEXTAUTH_SECRET` – chave secreta para NextAuth (use `openssl rand -base64 32`).
   - Opcional: alterar `MASTER_EMAIL` / `MASTER_PASSWORD` do seed inicial.

O usuário MASTER padrão é `munhoz.vinicius@gmail.com / Theforce85!!`.

## Script de saneamento de MASTERs

- Garanta que `.env.local` contenha `MONGO_URL_MONGODB_URI="mongodb+srv://Vercel-Admin-atlas-violet-house:p2jqOzEqJGuwfrbM@atlas-violet-house.jizuipo.mongodb.net/plataforma_leads?retryWrites=true&w=majority"`
- Rode `npm run fix:master` para limpar `owner` e `officeRecord` de todos os usuários `MASTER`.
- O script é idempotente e não altera o campo `office`.

## Rodando em desenvolvimento

```bash
npm install
npm run dev
# abre http://localhost:3000
```

## Fluxo sugerido

1) Login como MASTER (seed automático).  
2) Criar OWNER e CONSULTOR em `Admin > Usuários`.  
3) Criar campanha em `Admin > Importar Leads` (lado direito).  
4) Importar `base_com_vertical.xlsx`, escolhendo campanha e consultor.  
5) Acessar `Board` para acompanhar leads em colunas de estágio.  
6) Abrir um card, registrar atividades/palitagem e mover de coluna.  
7) Ver visão macro em `Admin > Dashboard` (totais, estágios, palitagens).  
8) Exportar CSV pelo botão do dashboard.

## Pilares técnicos

- Next.js 14 (App Router) + TypeScript + TailwindCSS.
- Autenticação: NextAuth (Credentials) com bcrypt.
- Banco: MongoDB via Mongoose (cache de conexão).
- Upload e parsing de Excel com `xlsx`.
- Estado local em componentes client para board/admin.

## Estrutura relevante

- `src/lib/mongodb.ts` – conexão com cache.  
- `src/lib/ensureMaster.ts` – seed automático do usuário MASTER.  
- `src/models/*` – User, Campaign, Company (lead), LeadActivity.  
- `src/constants/stages.ts` e `dispositions.ts` – estágios e palitagens.  
- API:
  - Auth: `app/api/auth/[...nextauth]`.
  - Usuários: `app/api/admin/users`.
  - Campanhas: `app/api/admin/campaigns`.
  - Importação: `app/api/admin/import`.
  - Leads: `app/api/companies` (+ `app/api/companies/[id]`).
  - Atividades: `app/api/activities`.
  - Dashboard: `app/api/admin/dashboard`.
  - Export CSV: `app/api/admin/export`.
  - Enriquecimento placeholder: `app/api/enrichment/[documento]`.

## Observações

- OWNER enxerga leads próprios e dos consultores que o referenciam. CONSULTOR vê apenas os próprios leads.  
- Kanban permite arrastar entre colunas; histórico e palitagem ficam no painel do card.  
- O endpoint de enriquecimento está pronto para receber integrações oficiais (ReceitaWS, Serpro, Google Places etc.).
