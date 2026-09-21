import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoiceSerial,
  nextSaleInvoiceSerial,
  parseInvoiceSerial,
  sameInvoiceNumber,
} from "./invoice-number";

describe("invoice serial", () => {
  it("parsea prefijo y correlativo", () => {
    assert.deepEqual(parseInvoiceSerial("F-1002"), {
      prefix: "F-",
      n: 1002,
      width: 4,
    });
    assert.deepEqual(parseInvoiceSerial("00000003"), {
      prefix: "",
      n: 3,
      width: 8,
    });
  });

  it("sugiere el siguiente de venta", () => {
    assert.equal(nextSaleInvoiceSerial(["F-1001", "F-1002"]), "F-1003");
    assert.equal(nextSaleInvoiceSerial([]), "F-0001");
    assert.equal(nextSaleInvoiceSerial(["BORRADOR-1", "F-0007"]), "F-0008");
  });

  it("formatea con el ancho original", () => {
    assert.equal(formatInvoiceSerial("", 3, 8), "00000003");
  });

  it("trata 146 y 000146 como el mismo", () => {
    assert.equal(sameInvoiceNumber("146", "000146"), true);
  });
});
