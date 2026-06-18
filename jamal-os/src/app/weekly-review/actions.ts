"use server";

import { revalidatePath } from "next/cache";
import { generateWeeklyReview } from "@/lib/services/weekly-review";

export async function runWeeklyReview() {
  await generateWeeklyReview();
  revalidatePath("/weekly-review");
}
