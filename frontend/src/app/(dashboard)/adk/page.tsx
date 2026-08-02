import { redirect } from "next/navigation";

/** ADK workspace retired from product — editor is the sole surface. */
export default function AdkPage() {
  redirect("/editor");
}
