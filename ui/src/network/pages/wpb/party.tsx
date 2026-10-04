import { useState, type MouseEvent } from "react";
import { parseParty } from "./format";

export function PartyLabel({ id, copy }: { id: string; copy?: boolean }) {
  const { hint, fingerprint, full } = parseParty(id);
  const [copied, setCopied] = useState(false);

  const onCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(full);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="wpb-id" title={full}>
      <span className="wpb-id-hint">{hint}</span>
      {fingerprint && <span className="wpb-id-fp">{fingerprint}</span>}
      {copy && fingerprint && (
        <button type="button" className="wpb-copy" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </span>
  );
}
