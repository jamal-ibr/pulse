/**
 * Simulates a Retell Custom LLM WebSocket session against a locally
 * running server, including the "graduation" warmth check.
 *
 * Usage:
 *   npm run dev            # terminal 1
 *   npm run simulate       # terminal 2
 */
import WebSocket from "ws";

const PORT = process.env.PORT ?? "3000";
const CALL_ID = `sim-${Date.now()}`;
const url = `ws://localhost:${PORT}/retell/llm/${CALL_ID}`;

type Turn = { role: "agent" | "user"; content: string };

const transcript: Turn[] = [];
let responseId = 0;
let currentReply = "";

const ws = new WebSocket(url);

const callerLines = [
  "Hi, I was wondering about teeth whitening. I want my teeth whitened for my graduation next month.",
  "That's right, it's on the twentieth of August. Do you know how much whitening costs?",
  "Okay that makes sense. My name is Sophie Turner and my number is 07700 900123. I'm a new patient.",
  "A weekday morning would be great. Thanks so much!",
];
let lineIndex = 0;

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
  if (event.response_type === "response" && event.response_id === responseId) {
    if (event.content) {
      currentReply += event.content;
      process.stdout.write(event.content);
    }
    if (event.content_complete) {
      transcript.push({ role: "agent", content: currentReply });
      setTimeout(sendUserTurn, 500);
    }
  }
});

ws.on("close", () => {
  console.log("\nDisconnected. Check server logs for extraction + Make webhook activity.");
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("WebSocket error - is the dev server running? ", err.message);
  process.exit(1);
});
