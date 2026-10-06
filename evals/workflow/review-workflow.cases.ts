import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (root CLAUDE.md + nested
 * server/client CLAUDE.md + skills + subagents, loaded via settingSources:["project"]) behaves as
 * documented. Every CLAUDE.md is a symlink to AGENTS.md.
 *
 * Budget: 5 Claude sessions total. Scenarios are merged into `trace` cases (one session, every
 * facet asserted, all misses reported together) — the activation pair stays split because the
 * near-miss negative is only meaningful in isolation.
 *
 * Nested CLAUDE.md files are injected by the harness when the agent touches a file in that
 * folder, so they never appear in filesRead. They are asserted through `expectText`: each fact
 * below exists ONLY in that file, so a correct answer proves it was loaded.
 */
export const cases: WorkflowCase[] = [
  // --- session 1: root "Deeper docs — use when" routing, four rows at once -----------------------
  {
    kind: "trace",
    name: "root CLAUDE.md routes four tasks to their docs",
    prompt:
      "У мене чотири окремі задачі. Для КОЖНОЇ спершу звірся з CLAUDE.md цього репо, щоб знайти, який документ " +
      "її стосується, ВІДКРИЙ цей документ (Read) і процитуй з нього один конкретний факт. Код не читай.\n" +
      "1) Я міняю правила класифікації файлів у Smart Diff (classifyFile).\n" +
      "2) Я працюю над PR Brief — які причини помилок (error reasons) він повертає.\n" +
      "3) Я змінюю Project Context — які ліміти розміру та токенів діють на прикріплені документи.\n" +
      "4) Мені треба вирішити, який тестовий suite потрібен для моєї зміни.",
    expectFilesRead: ["docs/smart-diff.md", "docs/pr-brief.md", "docs/project-context.md", "TESTING.md"],
    expectText: ["boilerplate", "generation_in_progress|llm_unavailable", "budget_exceeded|30,?000|200 ?KB"],
    maxTurns: 14,
  },

  // --- session 2: nested server/ + client/ CLAUDE.md in ONE task ---------------------------------
  {
    kind: "trace",
    name: "touching server/ and client/ loads both nested CLAUDE.md files",
    prompt:
      "Я хочу додати нове поле до відповіді review і показати його в UI. Щоб оцінити, де це робити, " +
      "відкрий (Read) server/src/modules/index.ts та client/src/lib/api.ts. " +
      "Потім відповідай ВИКЛЮЧНО за інструкціями (CLAUDE.md/AGENTS.md), що діють для server/ та client/ — " +
      "цитуй кожне правило майже дослівно, не загальними знаннями про Fastify чи Next.js:\n" +
      "- server: як маршрут має валідувати вхід, і як має називатись файл тесту, що ходить у справжній Postgres?\n" +
      "- server: звідки читати секрет на кшталт API-ключа?\n" +
      "- client: чи можна викликати fetch() прямо з компонента, і де має жити логіка нової фічі?\n" +
      "- Я змінив спільний Zod-контракт — що саме треба відредагувати?",
    expectText: [
      "\\.it\\.test\\.ts", // server/AGENTS.md
      "SecretsProvider", // server/AGENTS.md
      "api\\.ts", // client/AGENTS.md (the one place that knows NEXT_PUBLIC_API_BASE)
      "_components", // client/AGENTS.md
      "server/src/vendor/shared", // root CLAUDE.md
      "client/src/vendor/shared", // root CLAUDE.md
    ],
    maxTurns: 14,
  },

  // --- session 3: root Gotchas / Do-not-touch / conventions --------------------------------------
  {
    kind: "trace",
    name: "root CLAUDE.md gotchas and do-not-touch are honored",
    prompt:
      "Не відкривай жодних файлів з коду, відповідай за настановами цього репо:\n" +
      "- Чи просто зупиняє Postgres команда `docker compose down -v`?\n" +
      "- Після git pull змінилась схема БД, а колонки немає — чому і що робити?\n" +
      "- Промпт ревʼюера виглядає порожнім без repo skeleton — це баг? Які прапорці перевірити?\n" +
      "- Я хочу вручну поправити agent-runner/dist/ — це нормально?",
    expectText: [
      "devdigest_pgdata|wipes|deletes", // docker -v gotcha
      "db:migrate",
      "REPO_INTEL_ENABLED",
      "EMBEDDINGS_ENABLED",
      "must match|never.*hand-edit|do not.*edit|не .*редаг|committed", // agent-runner/dist
    ],
    maxTurns: 8,
  },

  // --- session 4: leak control — client-only work must NOT pull in server/ rules ------------------
  {
    kind: "trace",
    name: "client-only task does not leak server-only rules",
    prompt:
      "Відкрий (Read) client/src/lib/api.ts. Відповідай ВИКЛЮЧНО за інструкціями, що діють для client/: " +
      "як мені отримувати дані з API у новому компоненті?",
    expectText: ["api\\.ts", "hook"],
    forbidText: ["SecretsProvider", ".it.test.ts"],
    maxTurns: 6,
  },

  // --- sessions 5-6: activation pair (kept split on purpose) -------------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків. " +
      "Відповідай із загальних знань, не відкривай файли репо.",
    skill: "engineering-insights",
    shouldActivate: false,
    // 6, not 4: a model that starts exploring source anyway must not trip error_max_turns, which
    // fails the case for a reason unrelated to skill activation.
    maxTurns: 6,
  },
];
