"use server";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/services/settings";

const VALID_MODES = ["local_mock", "local_real", "connected_read", "connected_write"];

export async function setDataMode(formData: FormData) {
  const mode = String(formData.get("mode"));
  if (!VALID_MODES.includes(mode)) return;
  await setSetting("data_mode", mode);
  revalidatePath("/", "layout");
}
