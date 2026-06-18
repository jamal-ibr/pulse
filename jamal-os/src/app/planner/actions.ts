"use server";

import { revalidatePath } from "next/cache";
import { planDay, createPlannedBlocks } from "@/lib/services/planner";

export async function createBlocksAction() {
  const { blocks } = await planDay();
  // Only create the generated blocks, not the salah anchors or existing
  // events, to keep the calendar clean.
  const toCreate = blocks.filter((b) => ["outreach", "deep_work", "training", "shutdown"].includes(b.kind));
  await createPlannedBlocks(toCreate);
  revalidatePath("/planner");
  revalidatePath("/calendar");
  revalidatePath("/");
}
