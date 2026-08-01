import { describe, it, expect } from "vitest";
import { classify } from "./engine";
import { AssetClass, EquitySubClass, InstrumentType } from "../taxonomy";

// Golden vectors mirrored from backend/tests/test_classify.py — the TS engine must agree.
const c = (o: Partial<Parameters<typeof classify>[0]> & { name: string }) =>
  classify({ instrument_type: InstrumentType.STOCK, ...o });

describe("classification parity", () => {
  it("gold ETF is Gold, not equity", () => {
    const r = c({ name: "Nippon India Gold ETF", instrument_type: InstrumentType.ETF, symbol: "GOLDBEES" });
    expect(r.asset_class).toBe(AssetClass.GOLD);
    expect(r.sub_class).toBe("Gold ETF");
    expect(r.confidence).toBe("high");
  });

  it("Bharat Bond ETF is Debt", () => {
    const r = c({ name: "Bharat Bond ETF April 2031", instrument_type: InstrumentType.ETF, symbol: "EBBETF0431" });
    expect(r.asset_class).toBe(AssetClass.DEBT);
    expect(r.sub_class).toBe("Corporate Bond");
  });

  it("Nasdaq ETF is International", () => {
    const r = c({ name: "Motilal Oswal Nasdaq 100 ETF", instrument_type: InstrumentType.ETF, symbol: "MON100" });
    expect(r.asset_class).toBe(AssetClass.INTERNATIONAL_EQUITY);
  });

  it("ETF imported as stock is still detected", () => {
    const r = c({ name: "GOLDBEES", symbol: "GOLDBEES", instrument_type: InstrumentType.STOCK });
    expect(r.asset_class).toBe(AssetClass.GOLD);
    expect(r.refined_type).toBe(InstrumentType.ETF);
  });

  it("known stock has cap + sector", () => {
    const r = c({ name: "RELIANCE", symbol: "RELIANCE" });
    expect(r.asset_class).toBe(AssetClass.EQUITY);
    expect(r.market_cap).toBe("Large Cap");
    expect(r.sector).toBe("Energy");
    expect(r.confidence).toBe("high");
  });

  it("known stock by ISIN", () => {
    const r = c({ name: "Infosys Ltd", isin: "INE009A01021" });
    expect(r.market_cap).toBe("Large Cap");
    expect(r.sector).toBe("Information Technology");
  });

  it("unknown stock is equity with unclassified cap", () => {
    const r = c({ name: "SOMETHING UNKNOWN LTD", symbol: "ZZZZUNKNOWN" });
    expect(r.asset_class).toBe(AssetClass.EQUITY);
    expect(r.market_cap).toBe(EquitySubClass.UNCLASSIFIED);
  });

  it("flexi-cap fund has estimated look-through summing to 1", () => {
    const r = c({ name: "Parag Parikh Flexi Cap Fund - Direct - Growth", instrument_type: InstrumentType.MUTUAL_FUND, scheme_code: "122639" });
    expect(r.asset_class).toBe(AssetClass.EQUITY);
    expect(r.is_estimated).toBe(true);
    const caps = new Set(r.lookthrough.map((x) => x.market_cap));
    expect(caps.has("Large Cap") && caps.has("Mid Cap") && caps.has("Small Cap")).toBe(true);
    const total = r.lookthrough.reduce((a, x) => a + x.weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-6);
  });

  it("hybrid fund splits equity + debt", () => {
    const r = c({ name: "ICICI Balanced Advantage Fund", instrument_type: InstrumentType.MUTUAL_FUND, scheme_code: "118533" });
    const classes = new Set(r.lookthrough.map((x) => x.asset_class));
    expect(classes.has(AssetClass.EQUITY)).toBe(true);
    expect(classes.has(AssetClass.DEBT)).toBe(true);
  });

  it("liquid fund is Debt/Liquid", () => {
    const r = c({ name: "Nippon India Liquid Fund Direct Growth", instrument_type: InstrumentType.MUTUAL_FUND, scheme_code: "120053" });
    expect(r.asset_class).toBe(AssetClass.DEBT);
    expect(r.sub_class).toBe("Liquid/Overnight");
  });

  it("fixed types (SGB/FD/PPF/REIT)", () => {
    expect(c({ name: "SGB 2030", instrument_type: InstrumentType.SGB }).asset_class).toBe(AssetClass.GOLD);
    expect(c({ name: "HDFC FD", instrument_type: InstrumentType.FD }).sub_class).toBe("FD");
    expect(c({ name: "PPF", instrument_type: InstrumentType.PPF }).sub_class).toBe("PPF");
    expect(c({ name: "My REIT", instrument_type: InstrumentType.REIT }).asset_class).toBe(AssetClass.REAL_ESTATE);
  });

  it("override wins", () => {
    const r = classify(
      { name: "GOLDBEES", instrument_type: InstrumentType.ETF, symbol: "GOLDBEES" },
      { asset_class: AssetClass.DEBT, sub_class: "Corporate Bond" }
    );
    expect(r.asset_class).toBe(AssetClass.DEBT);
    expect(r.confidence).toBe("manual");
  });

  it("unknown MF degrades to Unclassified", () => {
    const r = c({ name: "Totally Unknown Scheme XYZ", instrument_type: InstrumentType.MUTUAL_FUND });
    expect(r.asset_class).toBe(AssetClass.UNCLASSIFIED);
    expect(r.confidence).toBe("none");
  });
});
