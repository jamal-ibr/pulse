/**
 * Simulates a Retell Custom LLM WebSocket session against a locally
 * running server - no phone, no Retell account needed.
 *
 *   npm run dev                  # terminal 1
 *   npm run simulate             # terminal 2  (routine booking)
 *   npm run simulate:emergency   # terminal 2  (emergency + transfer)
 */
import WebSocket from "ws";

const PORT = process.env.PORT ?? "3000";
const scenario = process.argv[2] === "emergency" ? "emergency" : "booking";
const CALL_ID = `sim-${scenario}-${Date.now()}`;
const url = `ws://localhost:${PORT}/retell/llm/${CALL_ID}`;

type Turn = { role: "agent" | "user"; content: string };

const SCENARIOS: Record<string, string[]> = {
  booking: [
    "Hi, I found you on Google. My kitchen sockets have stopped working, the breaker keeps tripping.",
    "It's a house, I own it. The address is 14 Oak Road, Croydon, postcode CR0 1AA.",
    "I'm Sarah Nolan, my number is 07700 900123.",
    "Any chance someone could come out this week? Mornings are better for me.",
    "That's great, thanks. There's a dog in the garden so just knock rather than come round the side.",
  ],
  emergency: [
    "Hi, there's a burning smell coming from the fuse board and I can hear crackling.",
    "No, no flames, but it smells really hot and the lights keep flickering.",
    "I'm at 14 Oak Road, Croydon, CR0 1AA. My name's Sarah, number's 07700 900123.",
  ],
};

const callerLines = SCENARIOS[scenario];
const transcript: Turn[] = [];
let responseId = 0;
let currentReply = "";
let lineIndex = 0;

const ws = new WebSocket(url);

function sendUserTurn(): void {
  if (lineIndex >= callerLines.length) {
    console.log("\n--- simulation complete, closing ---");
    ws.close();
    return;
  }
  const content = callerLines[lineIndex++];
  transcript.push({ role: "user", content });
  responseId += 1;
  currentReply = "";
  console.log(`\nCALLER: ${content}\nAGENT:  `);
  ws.send(
    JSON.stringify({
      interaction_type: "response_required",
      response_id: responseId,
      transcript,
    }),
  );
}

ws.on("open", () => {
  console.log(`Connected: ${url}`);
  console.log(`Scenario: ${scenario}\n`);
  ws.send(
    JSON.stringify({
      interaction_type: "call_details",
      call: { call_id: CALL_ID, from_number: "+447700900123", direction: "inbound" },
    }),
  );
  sendUserTurn();
});

ws.on("message", (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.response_type === "config") return;
  if (event.response_type !== "response") return;

  // The greeting arrives as response_id 0 before any caller turn.
  if (event.response_id === 0 && event.content) {
    console.log(`AGENT:  ${event.content}`);
    transcript.push({ role: "agent", content: event.content });
    return;
  }
  if (event.response_id !== responseId) return;

  if (event.content) {
    currentReply += event.content;
    process.stdout.write(event.content);
  }
  if (event.transfer_number) {
    console.log(
      `\n\n  *** TRANSFER TRIGGERED -> ${event.transfer_number} ***` +
        "\n  (on a real call Retell would now connect the caller to that number)",
    );
  }
  if (event.content_complete) {
    transcript.push({ role: "agent", content: currentReply });
    setTimeout(sendUserTurn, 500);
  }
});

ws.on("close", () => {
  console.log("\nDisconnected. Check the server logs for extraction and webhook activity.");
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("WebSocket error - is the dev server running? ", err.message);
  process.exit(1);
});
