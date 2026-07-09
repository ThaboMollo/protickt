import { Suspense } from "react";
import { SuccessContent } from "./success-content";

export default function SuccessPage() {
  return (
    <Suspense fallback={<p className="spinner">Loading…</p>}>
      <SuccessContent />
    </Suspense>
  );
}
