/**
 * Node tests for Intl-based formatting helpers (platform-agnostic core:
 * never hand-format numbers/dates/plurals; timezone is separate from locale).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  selectPluralForm,
  type PluralForms,
} from "@/lib/i18n/format";

test("formatNumber uses locale digit grouping", () => {
  assert.equal(formatNumber(1234.5, "en-US"), "1,234.5");
  assert.equal(formatNumber(1234.5, "de-DE"), "1.234,5");
  assert.equal(formatNumber(1234567, "en"), "1,234,567");
  // Unknown locale degrades to en, never throws.
  assert.equal(formatNumber(1234.5, "zz-ZZ"), "1,234.5");
});

test("formatPercent is locale-correct", () => {
  assert.equal(formatPercent(0.304, "en-US", 1), "30.4%");
  // de-DE percent uses non-breaking space; assert the digit part is present.
  assert.match(formatPercent(0.3, "de-DE", 0), /30/);
});

test("formatCurrency renders the currency symbol in the right position", () => {
  assert.equal(formatCurrency(1234.5, "USD", "en-US"), "$1,234.50");
  assert.equal(formatCurrency(1234.5, "EUR", "de-DE"), "1.234,50\u00A0€");
});

test("formatDate formats with locale and accepts an explicit IANA timezone", () => {
  const d = new Date("2024-06-01T12:00:00Z");
  assert.equal(formatDate(d, "en-US", { dateStyle: "medium" }), "Jun 1, 2024");
  // Invalid timezone degrades to the runtime default instead of throwing.
  assert.equal(typeof formatDate(d, "en-US", { dateStyle: "medium" }, "Mars/Olympus"), "string");
  assert.equal(typeof formatDate(d, "en-US", { dateStyle: "medium" }, "UTC"), "string");
});

test("formatRelativeTime works and degrades on bad locale", () => {
  assert.equal(formatRelativeTime(-1, "day", "en"), "yesterday");
  assert.equal(formatRelativeTime(-1, "day", "zz"), "yesterday");
});

test("formatList joins with the locale conjunction", () => {
  assert.equal(formatList(["a", "b"], "en"), "a and b");
  assert.equal(formatList(["a", "b"], "zz"), "a and b");
});

test("formatDuration renders mm:ss and h:mm:ss with Intl digits", () => {
  assert.equal(formatDuration(65, "en"), "1:05");
  assert.equal(formatDuration(3671, "en"), "1:01:11");
  assert.equal(formatDuration(0, "en"), "0:00");
  assert.equal(formatDuration(-10, "en"), "0:00"); // clamps negatives
});

test("selectPluralForm follows Intl.PluralRules categories", () => {
  const en: PluralForms = { one: "item", other: "items" };
  assert.equal(selectPluralForm(en, 1, "en"), "item");
  assert.equal(selectPluralForm(en, 2, "en"), "items");
  assert.equal(selectPluralForm(en, 0, "en"), "items");
});

test("selectPluralForm handles Arabic's six categories", () => {
  const ar: PluralForms = {
    zero: "zero",
    one: "one",
    two: "two",
    few: "few",
    many: "many",
    other: "other",
  };
  assert.equal(selectPluralForm(ar, 0, "ar"), "zero");
  assert.equal(selectPluralForm(ar, 1, "ar"), "one");
  assert.equal(selectPluralForm(ar, 2, "ar"), "two");
  assert.equal(selectPluralForm(ar, 3, "ar"), "few");
  assert.equal(selectPluralForm(ar, 11, "ar"), "many");
  assert.equal(selectPluralForm(ar, 100, "ar"), "other");
});

test("selectPluralForm falls back to `other` when a category is missing", () => {
  const partial: PluralForms = { other: "N" };
  assert.equal(selectPluralForm(partial, 1, "en"), "N");
});
