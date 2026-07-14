import { notFound } from "next/navigation";
import { ViewportTestClient } from "./ViewportTestClient";

export default function ViewportTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ViewportTestClient />;
}
