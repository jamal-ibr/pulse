import { describe, test, expect } from "vitest";
import {
  proteinMet,
  kcalInBand,
  phoneTargetMet,
  sleepTargetMet,
  deepWorkTargetMet,
  salahTargetMet,
  lightsOutLate,
  dayCompliance,
} from "../src/lib/targets";

describe("protein target", () => {
  test("met at exactly 170g", () => expect(proteinMet(170)).toBe(true));
  test("met above 170g", () => expect(proteinMet(185)).toBe(true));
  test("not met below 170g", () => expect(proteinMet(169)).toBe(false));
  test("not met when unlogged", () => expect(proteinMet(null)).toBe(false));
});

describe("calorie band", () => {
  test("met at 1700", () => expect(kcalInBand(1700)).toBe(true));
  test("met at 2000", () => expect(kcalInBand(2000)).toBe(true));
  test("not met below band", () => expect(kcalInBand(1500)).toBe(false));
  test("not met above band", () => expect(kcalInBand(2100)).toBe(false));
  test("not met when unlogged", () => expect(kcalInBand(undefined)).toBe(false));
});

describe("phone hours", () => {
  test("met under 4 hours", () => expect(phoneTargetMet(3.5)).toBe(true));
  test("not met at 4 hours", () => expect(phoneTargetMet(4)).toBe(false));
  test("not met when unlogged", () => expect(phoneTargetMet(null)).toBe(false));
});

describe("sleep and lights out", () => {
  test("sleep met at 7 hours", () => expect(sleepTargetMet(7)).toBe(true));
  test("sleep not met at 6.5", () => expect(sleepTargetMet(6.5)).toBe(false));
  test("23:30 exactly is not late", () => expect(lightsOutLate("23:30")).toBe(false));
  test("23:31 is late", () => expect(lightsOutLate("23:31")).toBe(true));
  test("22:55 is not late", () => expect(lightsOutLate("22:55")).toBe(false));
  test("00:15 past midnight is late", () => expect(lightsOutLate("00:15")).toBe(true));
  test("unlogged is not flagged", () => expect(lightsOutLate(null)).toBe(false));
});

describe("deep work and salah", () => {
  test("deep work met at 2 blocks", () => expect(deepWorkTargetMet(2)).toBe(true));
  test("deep work not met at 1", () => expect(deepWorkTargetMet(1)).toBe(false));
  test("salah met at 5", () => expect(salahTargetMet(5)).toBe(true));
  test("salah not met at 4", () => expect(salahTargetMet(4)).toBe(false));
});

describe("dayCompliance", () => {
  test("counts met targets", () => {
    const result = dayCompliance({
      salahCount: 5,
      proteinG: 175,
      kcal: 1850,
      phoneScreenHours: 3,
      deepWorkBlocks: 2,
      sleepHours: 7.2,
      lightsOutTime: "22:50",
    });
    expect(result.metCount).toBe(7);
  });

  test("unlogged day scores zero", () => {
    const result = dayCompliance({});
    expect(result.metCount).toBe(0);
  });
});
