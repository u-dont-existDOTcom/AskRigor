import { describe, expect, it } from "vitest";

import {
  CONTACT_DETAIL_KINDS,
  LINK_KINDS,
  contactDetailKinds,
  linkKinds,
} from "../apps/research-mcp/src/atlas/contact-check.js";

// Decision 171, sections 4B and 4E: the contact-details and links check a finding's published text passes, and comments
// will. Exact, structural patterns in any language and script; the result names kinds, never the matched text.

describe("the contact-details check", () => {
  it("names email addresses in any language and script, full-width and obfuscated with invisible characters", () => {
    for (const text of [
      "Contactez jean.dupont@exemple.fr pour plus d'informations.",
      "Schreiben Sie an max.mustermann@beispiel.de, bitte.",
      "Escríbeme: ana_garcia+salud@correo.es",
      "Пишите на ivan.petrov@почта.рф",
      "ارسل إلى ahmad.k@example.com للمزيد",
      "請寄信至ｗａｎｇ＠ｅｘａｍｐｌｅ．ｃｏｍ謝謝",
      "メール：tanaka@example。jp まで",
      "用户@例子.广告",
      "jo​hn@ex​ample.com",
      "mailto:someone@clinic.example.org",
    ]) {
      expect(contactDetailKinds(text), text).toEqual(["email_address"]);
    }
  });

  it("names phone numbers with phone-style separators or a leading +, in any script", () => {
    for (const text of [
      "+33 6 12 34 56 78",
      "Appelez le 06 12 34 56 78 avant midi.",
      "Rufen Sie 030 1234567 an.",
      "Telefon: +49 (0)30 1234567",
      "Llama al 612 345 678 por la tarde.",
      "Позвоните 8 (495) 123-45-67",
      "اتصل على ٠٥٠ ١٢٣ ٤٥٦٧",
      "फ़ोन करें +९१ ९८७६५ ४३२१०",
      "电话：138 1234 5678",
      "电话138 1234 5678",
      "请拨打06 12 34 56 78谢谢",
      "โทร 081-234-5678",
      "電話 03-1234-5678",
      "Call (555) 123-4567 today.",
      "555.123.4567",
      "+12345678",
      "０６ １２ ３４ ５６ ７８",
      "Tel.555-123-4567",
      "Tél.06.12.34.56.78",
      "Tel:06-12-34-56-78",
      "0171-1234567",
      "+1 (555) 123-4567.",
      "(see 555-123-4567)",
    ]) {
      expect(contactDetailKinds(text), text).toEqual(["phone_number"]);
    }
  });

  it("does not read doses, years, dates, counts, statistics or record numbers as phone numbers", () => {
    for (const text of [
      "1,000 mg daily for 12 weeks",
      "2.5 mg/kg twice a day",
      "1,234,567 participants",
      "1 234 567 participants au total",
      "1.234.567 Teilnehmer",
      "12 345 678 patients",
      "between 2019 and 2024",
      "trials from 2019-2024",
      "trials from 2019–2024",
      "1990 - 2000",
      "studies from 2019 2020 2021",
      "searched up to 2024-03-12",
      "le 12.03.2024",
      "on 12/03/2024",
      "am 03-12-2024",
      "HR 0.85 (0.72-0.99)",
      "OR 1.23 (1.05–1.44), p = 0.0001234",
      "95% CI 1.2 to 3.4",
      "means of 12.5 13.4 14.2 mmol/L",
      "+12.3 (10.1-14.5)",
      "PMID 40123456",
      "PMID: 40123456",
      "NCT01234567",
      "doi 10.1056/NEJMoa2034577",
      "10.1016/j.jad.2019.01.123",
      "COVID-19 2020 2021",
      "EudraCT 2004-001234-56",
      "ISBN 978-0-306-40615-7",
      "Lancet 2019;393(10173):1234-1240",
      "10:30-11:45",
      "NNT 12 over 52 weeks",
      "٣٫٥ ملغ يوميا",
      "a gene such as ARF-6 and the card ARF-0142",
      "5551234567",
    ]) {
      expect(contactDetailKinds(text), text).toEqual([]);
    }
  });

  it("names messaging handles and messaging links, not an address's @ or a dose", () => {
    for (const text of [
      "Suivez @sante_publique pour les mises à jour",
      "联系@张三获取资料",
      "write to t.me/someone_here",
      "https://wa.me/15551234567",
      "join discord.gg/abcdef",
      "follow @Dr.Health.Info",
    ]) {
      expect(contactDetailKinds(text), text).toEqual(["messaging_handle"]);
    }
    for (const text of ["take 2 @ bedtime", "@5mg", "user@localhost", "@", "@a"]) {
      expect(contactDetailKinds(text), text).toEqual([]);
    }
  });

  it("names several kinds at once, in a fixed order, and never returns the text", () => {
    const kinds = contactDetailKinds("Mail jane@example.com, call +44 20 7946 0958 or ping @jane_d.");
    expect(kinds).toEqual(["email_address", "phone_number", "messaging_handle"]);
    expect([...CONTACT_DETAIL_KINDS]).toEqual(["email_address", "phone_number", "messaging_handle"]);
    expect(JSON.stringify(kinds)).not.toMatch(/jane|7946/u);
  });

  it("reads an ordinary findings text as clean", () => {
    for (const text of [
      "Supervised exercise therapy reduced pain more than usual care (standardized difference 0.45, 95% CI 0.21-0.69).",
      "In an invented trial, zentarine 20 mg cut relapse from 30 of 120 to 18 of 120 over 52 weeks (NNT 10).",
      "La kinésithérapie supervisée a réduit la douleur chez 1 200 adultes entre 2015 et 2020.",
      "Bei 34 von 100 Patienten trat nach 12 Wochen eine Besserung ein.",
      "في تجربة على ١٢٠ مريضا، انخفض الانتكاس خلال ٥٢ أسبوعا",
      "在120名成人中，12周后疼痛减轻。",
    ]) {
      expect(contactDetailKinds(text), text).toEqual([]);
    }
  });
});

describe("the links check", () => {
  it("names URLs and bare domains, in any case for the generic domains", () => {
    expect(linkKinds("see https://example.com/page for more")).toEqual(["url"]);
    expect(linkKinds("voir www.exemple.fr")).toEqual(["url", "bare_domain"]);
    expect(linkKinds("consultez exemple.fr ce soir")).toEqual(["bare_domain"]);
    expect(linkKinds("ClinicalTrials.gov lists it")).toEqual(["bare_domain"]);
    expect(linkKinds("Example.COM")).toEqual(["bare_domain"]);
    expect(linkKinds("bbc.co.uk")).toEqual(["bare_domain"]);
    expect(linkKinds("xn--80ak6aa92e.com")).toEqual(["bare_domain"]);
    expect(linkKinds("ftp://files.example.org")).toEqual(["url"]);
    expect(linkKinds("https://例子.中国/路径")).toEqual(["url"]);
    expect([...LINK_KINDS]).toEqual(["url", "bare_domain"]);
  });

  it("does not read abbreviations, file names, numbers or an email address's domain as links", () => {
    for (const text of [
      "e.g. this one",
      "i.e. that one",
      "an M.Sc graduate",
      "Dr.Smith said so",
      "the file.txt",
      "version v2.0",
      "3.5mg daily",
      "the trial ended.It showed",
      "write to jane@example.com",
      "Supervised exercise reduced pain (0.45, 95% CI 0.21-0.69).",
      "例えば。これは文です。",
    ]) {
      expect(linkKinds(text), text).toEqual([]);
    }
  });
});
