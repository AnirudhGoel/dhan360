import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseZerodhaHoldings } from "./zerodhaHoldings";
import { parseZerodhaTradebook } from "./zerodhaTradebook";
import { parseGenericCsv } from "./genericCsv";
import { parseCasJson } from "./casJson";
import { parseManualEntries } from "./manual";
import { InstrumentType } from "../taxonomy";

// Fixtures mirrored from backend/tests/test_parsers.py.
const HOLDINGS = `Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price,Unrealized P&L
RELIANCE,INE002A01018,Energy,10,2400.00,2950.50,5505.00
GOLDBEES,INF204KB17I5,,100,55.20,62.10,690.00
TCS,INE467B01029,IT,5,3100.00,3850.00,3750.00
`;

const TRADEBOOK = `symbol,isin,trade_type,quantity,price,trade_date
RELIANCE,INE002A01018,buy,10,2400,2023-01-01
RELIANCE,INE002A01018,buy,5,2600,2023-06-01
RELIANCE,INE002A01018,sell,5,2900,2024-01-01
INFY,INE009A01021,buy,20,1400,2023-02-01
`;

const GENERIC = `name,type,current_value,invested_value,asset_class
My PPF Account,ppf,250000,200000,Debt
SGB Series X,sgb,150000,120000,Gold
Emergency Cash,cash,50000,50000,Cash
`;

const CAS = {
  folios: [{
    folio: "12345/67", amc: "PPFAS Mutual Fund",
    schemes: [{
      scheme: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
      isin: "INF879O01027", amfi: "122639", advisor: "DIRECT", type: "EQUITY",
      close: 1000.0, valuation: { date: "2024-03-31", nav: 65.0, value: 65000.0 },
      transactions: [{ date: "2021-01-15", amount: 50000.0, units: 800.0 }, { date: "2022-06-10", amount: 5000.0, units: 80.0 }],
    }],
  }],
};

describe("parser parity", () => {
  it("zerodha holdings computes derived values", () => {
    const res = parseZerodhaHoldings(HOLDINGS, "holdings.csv");
    expect(res.holdings.length).toBe(3);
    const rel = res.holdings.find((x) => x.symbol === "RELIANCE")!;
    expect(rel.quantity).toBe(10);
    expect(rel.isin).toBe("INE002A01018");
    expect(rel.current_value).toBe(29505.0); // 10 * 2950.50
    expect(rel.invested_value).toBe(24000.0);
  });

  it("tradebook aggregates net position + weighted avg", () => {
    const res = parseZerodhaTradebook(TRADEBOOK);
    const rel = res.holdings.find((x) => x.symbol === "RELIANCE")!;
    expect(rel.quantity).toBe(10); // 10 + 5 - 5
    expect(Math.round(rel.avg_cost! * 100) / 100).toBe(Math.round(((10 * 2400 + 5 * 2600) / 15) * 100) / 100);
    expect(res.holdings.some((x) => x.symbol === "INFY")).toBe(true);
    // dated transactions carried through
    expect(rel.transactions.length).toBe(3);
    expect(rel.transactions[0].date).toBe("2023-01-01");
  });

  it("combines multiple tradebook files and de-dups overlapping trades by trade id", () => {
    // Two yearly exports that overlap on one trade (same trade_id) — must not double-count.
    const y1 = `symbol,isin,trade_type,quantity,price,trade_date,trade_id
RELIANCE,INE002A01018,buy,10,2400,2023-01-01,T1
RELIANCE,INE002A01018,buy,5,2600,2023-06-01,T2
`;
    const y2 = `symbol,isin,trade_type,quantity,price,trade_date,trade_id
RELIANCE,INE002A01018,buy,5,2600,2023-06-01,T2
RELIANCE,INE002A01018,buy,8,2700,2024-02-01,T3
`;
    const res = parseZerodhaTradebook([y1, y2]);
    const rel = res.holdings.find((x) => x.symbol === "RELIANCE")!;
    expect(rel.quantity).toBe(23); // 10 + 5 + 8 (the duplicate T2 counted once)
    expect(rel.transactions.length).toBe(3);
  });

  it("finds the real header under broker banner/summary rows (Zerodha Console shape)", () => {
    // Console exports prefix the table with a title + a Summary block, and a leading empty column.
    const consoleCsv = `,,,,,
,Client ID,OH3367,,,
,Equity Holdings Statement as on 2026-08-04,,,,
,Summary,,,,
,Invested Value,3893376.29,,,
,Present Value,5589926.81,,,
,Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price
,RELIANCE,INE002A01018,ENERGY,10,2400,2950.5
,TCS,INE467B01029,IT,5,3100,3850
`;
    const res = parseZerodhaHoldings(consoleCsv, "console.csv");
    expect(res.holdings.length).toBe(2); // NOT tricked into using the "Client ID" row as header
    const rel = res.holdings.find((x) => x.symbol === "RELIANCE")!;
    expect(rel.quantity).toBe(10);
    expect(rel.current_value).toBe(29505); // 10 × 2950.5 (no Cur. val column → qty × prev close)
  });

  it("reads an .xlsx sheet into parser-ready CSV (holdings)", () => {
    // Mirrors the lazy XLSX.sheet_to_csv step in clientApi.fileToText for .xlsx uploads.
    const ws = XLSX.utils.aoa_to_sheet([
      ["Symbol", "ISIN", "Quantity Available", "Average Price", "Previous Closing Price"],
      ["RELIANCE", "INE002A01018", 10, 2400, 2950.5],
    ]);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const res = parseZerodhaHoldings(csv, "holdings.xlsx");
    const rel = res.holdings.find((x) => x.symbol === "RELIANCE")!;
    expect(rel.quantity).toBe(10);
    expect(rel.current_value).toBe(29505);
  });

  it("generic csv with asset_class hint + dates", () => {
    const res = parseGenericCsv(GENERIC);
    expect(res.holdings.length).toBe(3);
    const ppf = res.holdings.find((x) => x.instrument_type === InstrumentType.PPF)!;
    expect(ppf.current_value).toBe(250000);
    expect(ppf.category_hint).toBe("Debt");
  });

  it("cas json parses scheme + transactions", () => {
    const res = parseCasJson(CAS, "cas.json");
    expect(res.holdings.length).toBe(1);
    const h = res.holdings[0];
    expect(h.scheme_code).toBe("122639");
    expect(h.quantity).toBe(1000.0);
    expect(h.current_value).toBe(65000.0);
    expect(h.invested_value).toBe(55000.0); // 50000 + 5000
    expect(h.plan).toBe("direct");
    expect(h.account_kind).toBe("mf_folio");
    // investor-sign transactions (buys negative)
    expect(h.transactions.length).toBe(2);
    expect(h.transactions[0].amount).toBe(-50000);
  });

  it("manual entry with start date emits a cashflow", () => {
    const res = parseManualEntries([
      { name: "My FD", instrument_type: InstrumentType.FD, current_value: 100000, start_date: "2022-01-01" },
    ]);
    expect(res.holdings[0].account_kind).toBe("bank");
    expect(res.holdings[0].invested_value).toBe(100000);
    expect(res.holdings[0].transactions[0].amount).toBe(-100000);
  });
});
