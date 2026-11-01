import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { KnowledgeAnswerTest } from "./KnowledgeAnswerTest";
import { addApprovedAnswer } from "@/lib/knowledge-corrections";
import type { Soul } from "@/lib/soul";

export function CorrectAnswerDialog({
  soul,
  question,
  onSave,
  onClose,
}: {
  soul: Soul;
  question: string;
  onSave: (question: string, answer: string) => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const valid = answer.trim().length >= 10 && answer.length <= 8000;
  const draft = useMemo(
    () =>
      valid ? { ...soul, knowledge: addApprovedAnswer(soul.knowledge, question, answer) } : soul,
    [valid, soul, question, answer],
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="obs-app obs-dialog max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-white sm:max-w-xl">
        <DialogTitle>Correct this answer</DialogTitle>
        <DialogDescription>
          Add the facts your assistant should use. Test them before saving.
        </DialogDescription>
        <p className="rounded-xl bg-[#f5f5f4] p-4 text-sm">{question}</p>
        <label className="text-sm font-medium" htmlFor="approved-answer">
          Approved answer
        </label>
        <textarea
          id="approved-answer"
          autoFocus
          rows={6}
          maxLength={8000}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Write the correct answer using verified business information."
          className="clean-input resize-y"
        />
        <p className="text-right text-xs text-[#817f79]">
          {answer.length.toLocaleString()} / 8,000
        </p>
        {valid && <KnowledgeAnswerTest soul={draft} question={question} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => {
              onSave(question, answer);
              onClose();
            }}
          >
            Save to knowledge
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
