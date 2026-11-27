// Minimal, correct CSV parsing for prospect imports. RFC 4180-ish (quoted
// fields, escaped "" quotes, commas and newlines inside quotes, CRLF), with no
// dependency. The admin import maps/validates the parsed rows in
// lib/import/engine.ts; this module only turns text into string cells.

/** Parse CSV text into rows of string cells. */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush trailing field/row if any content
  if (field.length > 0 || row.length > 0) endRow();

  // drop fully-empty rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
