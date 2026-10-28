import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, LOCALES, matchLocale, storageLang } from "../src/lib/i18n";
import { DICTS } from "../src/locales";

test("phone language picks the best supported language, else English", () => {
  assert.equal(matchLocale("bn-IN,bn;q=0.9,en;q=0.8"), "bn");
  assert.equal(matchLocale("fr-FR,ta;q=0.7,en;q=0.5"), "ta");
  assert.equal(matchLocale("en-GB,hi;q=0.9"), "en");
  assert.equal(matchLocale("de-DE,fr;q=0.8"), "en");
  assert.equal(matchLocale(""), "en");
  assert.equal(matchLocale(null), "en");
  assert.equal(matchLocale("as;q=0,or"), "or", "q=0 means not wanted");
});

test("placeholders are filled and unknown ones left alone", () => {
  assert.equal(fmt("Updated {time} IST", { time: "10:30" }), "Updated 10:30 IST");
  assert.equal(fmt("{n} other people", { n: 3 }), "3 other people");
  assert.equal(fmt("keep {this}", {}), "keep {this}");
});

test("reports are stored in English or Hindi only", () => {
  assert.equal(storageLang("hi"), "hi");
  assert.equal(storageLang("ta"), "en");
});

test("every language has every string, non-empty, with the same placeholders as English", () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  const en = DICTS.en as unknown as Record<string, Record<string, string>>;
  for (const { code } of LOCALES) {
    const d = DICTS[code] as unknown as Record<string, Record<string, string>>;
    for (const section of Object.keys(en)) {
      for (const key of Object.keys(en[section])) {
        const value = d[section]?.[key];
        assert.ok(typeof value === "string" && value.trim(), `${code}.${section}.${key} is missing`);
        assert.equal(placeholders(value), placeholders(en[section][key]), `${code}.${section}.${key} placeholders`);
      }
    }
  }
});

test("language menu names match the dictionaries", () => {
  for (const { code, name } of LOCALES) assert.equal(DICTS[code].meta.name, name);
});
