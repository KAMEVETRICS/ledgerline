// Thin client for the Canton JSON Ledger API (v2). Every read and write is
// scoped to one party, so what a pane shows is exactly what that party's
// participant would hold.

export type Contract<T = Record<string, unknown>> = {
  contractId: string;
  /** "Module:Template", package id stripped */
  template: string;
  payload: T;
  signatories: string[];
  observers: string[];
};

const PACKAGE = "#ledgerline";
const USER_ID = "ledgerline-ui";

export class LedgerError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/v2/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new LedgerError(errorMessage(text, res.status));
  return (text ? JSON.parse(text) : undefined) as T;
}

// Daml assertMsg failures arrive buried in the cause; surface just the message.
function errorMessage(text: string, status: number): string {
  let cause = text;
  try {
    cause = (JSON.parse(text) as { cause?: string }).cause ?? text;
  } catch {
    // not JSON, use the raw body
  }
  const assertion = /message = "([^"]+)"/.exec(cause);
  if (assertion) return assertion[1];
  if (/CONTRACT_NOT_FOUND/.test(cause)) return "That contract changed in the meantime. Try again.";
  return cause.slice(0, 240) || `Ledger request failed (${status})`;
}

export async function listParties(): Promise<string[]> {
  const res = await call<{ partyDetails: { party: string }[] }>("parties");
  return res.partyDetails.map((p) => p.party);
}

type AcsEntry = {
  contractEntry: {
    JsActiveContract?: {
      createdEvent: {
        contractId: string;
        templateId: string;
        createArgument: Record<string, unknown>;
        signatories: string[];
        observers: string[];
      };
    };
  };
};

export async function activeContracts(party: string): Promise<Contract[]> {
  const { offset } = await call<{ offset: number }>("state/ledger-end");
  const entries = await call<AcsEntry[]>("state/active-contracts", {
    filter: {
      filtersByParty: {
        [party]: {
          cumulative: [
            { identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } },
          ],
        },
      },
    },
    verbose: false,
    activeAtOffset: offset,
  });
  return entries.flatMap((e) => {
    const ev = e.contractEntry.JsActiveContract?.createdEvent;
    if (!ev) return [];
    return [
      {
        contractId: ev.contractId,
        template: ev.templateId.split(":").slice(1).join(":"),
        payload: ev.createArgument,
        signatories: ev.signatories,
        observers: ev.observers,
      },
    ];
  });
}

function submit(actAs: string, command: unknown) {
  return call("commands/submit-and-wait", {
    commands: [command],
    commandId: crypto.randomUUID(),
    userId: USER_ID,
    actAs: [actAs],
  });
}

export function create(actAs: string, template: string, createArguments: unknown) {
  return submit(actAs, {
    CreateCommand: { templateId: `${PACKAGE}:${template}`, createArguments },
  });
}

export function exercise(
  actAs: string,
  template: string,
  contractId: string,
  choice: string,
  choiceArgument: unknown,
) {
  return submit(actAs, {
    ExerciseCommand: {
      templateId: `${PACKAGE}:${template}`,
      contractId,
      choice,
      choiceArgument,
    },
  });
}
