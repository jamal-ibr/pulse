"use server";

import { revalidatePath } from "next/cache";
import { snapshotLevel } from "@/lib/services/level";

export async function takeSnapshot() {
  await snapshotLevel();
  revalidatePath("/level");
}
