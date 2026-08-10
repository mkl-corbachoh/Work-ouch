import type { SqliteDatabase } from "./connection";

const TRANSACTION_CONTROLS = new Set([
  "BEGIN",
  "COMMIT",
  "END",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
]);

type SqlToken = { type: "semicolon" } | { type: "word"; value: string };

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (character === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (character === "/" && next === "*") {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === "*" && sql[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      const delimiter = character;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === delimiter) {
          if (sql[index + 1] === delimiter) {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character === "[") {
      index += 1;
      while (index < sql.length && sql[index] !== "]") {
        index += 1;
      }
      index += 1;
      continue;
    }

    if (character === ";") {
      tokens.push({ type: "semicolon" });
      index += 1;
      continue;
    }

    if (character && /[A-Za-z_]/.test(character)) {
      const start = index;
      index += 1;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index] ?? "")) {
        index += 1;
      }
      tokens.push({
        type: "word",
        value: sql.slice(start, index).toUpperCase(),
      });
      continue;
    }

    index += 1;
  }

  return tokens;
}

function isTriggerPrefix(words: string[]): boolean {
  return (
    (words[0] === "CREATE" && words[1] === "TRIGGER") ||
    (words[0] === "CREATE" &&
      (words[1] === "TEMP" || words[1] === "TEMPORARY") &&
      words[2] === "TRIGGER")
  );
}

function findTransactionControl(sql: string): string | undefined {
  let statementWords: string[] = [];
  let isTrigger = false;
  let inTriggerBody = false;
  let triggerEnded = false;
  let caseDepth = 0;

  for (const token of tokenizeSql(sql)) {
    if (token.type === "semicolon") {
      if (!isTrigger || triggerEnded) {
        statementWords = [];
        isTrigger = false;
        inTriggerBody = false;
        triggerEnded = false;
        caseDepth = 0;
      }
      continue;
    }

    if (inTriggerBody) {
      if (token.value === "CASE") {
        caseDepth += 1;
      } else if (token.value === "END") {
        if (caseDepth > 0) {
          caseDepth -= 1;
        } else {
          inTriggerBody = false;
          triggerEnded = true;
        }
      }
      continue;
    }

    if (isTrigger) {
      if (!triggerEnded && token.value === "BEGIN") {
        inTriggerBody = true;
      }
      continue;
    }

    if (statementWords.length === 0 && TRANSACTION_CONTROLS.has(token.value)) {
      return token.value;
    }

    if (statementWords.length < 3) {
      statementWords.push(token.value);
      isTrigger = isTriggerPrefix(statementWords);
    }
  }

  return undefined;
}

export function assertNoTransactionControl(
  sql: string,
  scriptName: string,
): void {
  const transactionControl = findTransactionControl(sql);
  if (transactionControl) {
    throw new Error(
      `SQL script ${scriptName} contains forbidden transaction control: ${transactionControl}`,
    );
  }
}

export function assertTransactionActive(
  database: SqliteDatabase,
  context: string,
): void {
  if (!database.inTransaction) {
    throw new Error(`Runner transaction ended unexpectedly while ${context}`);
  }
}
