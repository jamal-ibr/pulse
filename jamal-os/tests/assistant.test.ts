import { describe, expect, test } from "vitest";
import {
  parseIntent,
  answerIntent,
  type AssistantFacts,
} from "../src/lib/assistant";

function makeFacts(overrides: Partial<AssistantFacts> = {}): AssistantFacts {
  return {
    contactedCount: 3,
    contactedMinimum: 5,
    outreachThisWeek: 0,
    followUpsOverdue: 1,
    hardRuleTriggered: true,
    overdueTaskCount: 2,
    scariestTask: { title: "Send first 5 outreach messages", scariness: 5, deferCount: 2 },
    habitGaps: [{ habit: "Protein", detail: "120g of 170g" }],
    todayEventCount: 1,
    ...overrides,
  };
}

describe("parseIntent", () => {
  test("recognises add task with explicit task phrasing", () => {
    const intent = parseIntent("Add a task to call the accountant");
    expect(intent).toEqual({ type: "add_task", title: "call the accountant" });
  });

  test("recognises remind me to phrasing as add task", () => {
    const intent = parseIntent("remind me to renew the BPP enrolment.");
    expect(intent).toEqual({ type: "add_task", title: "renew the BPP enrolment" });
  });

  test("strips trailing punctuation from task titles", () => {
    const intent = parseIntent("new task: send invoice!");
    expect(intent).toEqual({ type: "add_task", title: "send invoice" });
  });

  test("routes pipeline questions to the pipeline intent", () => {
    expect(parseIntent("how is the pipeline looking?")).toEqual({ type: "pipeline" });
    expect(parseIntent("Have I sent any outreach?")).toEqual({ type: "pipeline" });
  });

  test("routes avoidance questions to the scary intent", () => {
    expect(parseIntent("what am I avoiding?")).toEqual({ type: "scary" });
    expect(parseIntent("What is my scariest task")).toEqual({ type: "scary" });
  });

  test("routes habit questions to the habits intent", () => {
    expect(parseIntent("did I hit my habits yesterday?")).toEqual({ type: "habits" });
    expect(parseIntent("how was my sleep")).toEqual({ type: "habits" });
  });

  test("routes day questions to the brief intent", () => {
    expect(parseIntent("what should I focus on today?")).toEqual({ type: "brief" });
    expect(parseIntent("give me the brief")).toEqual({ type: "brief" });
  });

  test("falls back to chat for anything else", () => {
    const intent = parseIntent("why is consistency better than intensity?");
    expect(intent).toEqual({
      type: "chat",
      text: "why is consistency better than intensity?",
    });
  });

  test("prefers pipeline over brief when both keywords appear", () => {
    expect(parseIntent("what is today's outreach status")).toEqual({ type: "pipeline" });
  });
});

describe("answerIntent", () => {
  test("brief answer leads with the hard rule when triggered", () => {
    const reply = answerIntent({ type: "brief" }, makeFacts());
    expect(reply).toMatch(/^Pulse outreach first/);
    expect(reply).toContain("3 of 5");
  });

  test("brief answer reports on-track outreach when rule not triggered", () => {
    const reply = answerIntent(
      { type: "brief" },
      makeFacts({ hardRuleTriggered: false, outreachThisWeek: 6 }),
    );
    expect(reply).toContain("on track");
  });

  test("pipeline answer states counts and verdict", () => {
    const reply = answerIntent({ type: "pipeline" }, makeFacts());
    expect(reply).toContain("3 of 5 practices contacted");
    expect(reply).toContain("Send before anything else");
  });

  test("scary answer names the task and defer count", () => {
    const reply = answerIntent({ type: "scary" }, makeFacts());
    expect(reply).toContain("Send first 5 outreach messages");
    expect(reply).toContain("deferred it 2 times");
  });

  test("scary answer is honest when nothing is logged", () => {
    const reply = answerIntent(
      { type: "scary" },
      makeFacts({ scariestTask: null }),
    );
    expect(reply).toContain("not in the system yet");
  });

  test("habits answer lists gaps", () => {
    const reply = answerIntent({ type: "habits" }, makeFacts());
    expect(reply).toContain("Protein: 120g of 170g");
  });

  test("habits answer confirms when there are no gaps", () => {
    const reply = answerIntent({ type: "habits" }, makeFacts({ habitGaps: [] }));
    expect(reply).toContain("All habit targets met yesterday");
  });

  test("returns null for chat and add_task so the caller handles them", () => {
    expect(answerIntent({ type: "chat", text: "hi" }, makeFacts())).toBeNull();
    expect(answerIntent({ type: "add_task", title: "x" }, makeFacts())).toBeNull();
  });
});
