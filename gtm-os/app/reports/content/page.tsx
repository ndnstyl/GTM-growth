import { SettleGate } from "@/components/shell/SettleGate";
import { ContentLibrary } from "@/components/reports/content/ContentLibrary";

// the explainer year library (storyboards only). Lives under /reports/ so the
// scrolling document layout applies and deploy-app.sh ships it with the reports tree.
export default function ContentLibraryPage() {
  return (
    <SettleGate pad="p-6" skeleton={560}>
      <ContentLibrary />
    </SettleGate>
  );
}
