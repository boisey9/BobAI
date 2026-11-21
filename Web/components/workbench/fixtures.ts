import type { TaskMutation } from "../../lib/types";

export const groups = [
  { id: "reference", label: "Reference" },
  { id: "review", label: "Review next" },
  { id: "focus", label: "In focus" },
] as const;

export type Group = typeof groups[number]["id"];
export type Project = "demo-rfq" | "demo-bobai";
export type Source = {
  id: string;
  title: string;
  type: string;
  revision: string;
  locator: string;
  excerpt: string;
};
export type Board = Record<Group, string[]>;
export type DraftFields = {
  title: string;
  description: string;
  priority: NonNullable<TaskMutation["priority"]>;
  dueDate: string;
};

export const sampleQuestion = "What evidence is still missing?";
export const fixtureDate = "Nov 14, 2026";

const projects = {
  "demo-rfq": {
    title: "Sample RFQ",
    reference: "Fictional delivery records",
    sources: [
      { id: "delivery", title: "Delivery & Approvals", type: "Document", revision: "R3", locator: "Delivery note §2", excerpt: "The package was published. The delivery record contains no owner acceptance receipt for this revision." },
      { id: "finding", title: "Review finding", type: "Review note", revision: "R2", locator: "Review finding §4", excerpt: "The reviewer could reproduce the delivered changes. Verification against the approved workflow remains open." },
      { id: "test", title: "Test evidence", type: "Test log", revision: "R5", locator: "Test log §1", excerpt: "The synthetic fixture run passed. An acceptance run with the owner’s approved workflow has not been recorded." },
    ],
    headline: "Owner verification is still open.",
    answer: "The delivery note confirms publication. The review finding leaves owner verification open. Record the acceptance result for this revision before closing the review.",
    draftTitle: "Verify acceptance evidence",
    draftDescription: "Run the owner acceptance checks for the delivered RFQ revision and record the result for review.",
  },
  "demo-bobai": {
    title: "Operations",
    reference: "Fictional recovery records",
    sources: [
      { id: "delivery", title: "Recovery checklist", type: "Document", revision: "R1", locator: "Recovery checklist §2", excerpt: "The sample restore recreated the mock dataset. The restored record count has not been checked." },
      { id: "finding", title: "Restore review", type: "Review note", revision: "R4", locator: "Restore review §3", excerpt: "The acceptance check requires comparing the restored mock records against the sample inventory." },
      { id: "test", title: "Interface test notes", type: "Test log", revision: "R2", locator: "Interface checks §1", excerpt: "The demo reports three successful context reads. These checks do not cover disaster recovery." },
    ],
    headline: "The restored records still need checking.",
    answer: "The checklist records a sample restore. The review calls for checking the restored mock records against the sample inventory. Record the result before marking the exercise complete.",
    draftTitle: "Verify the restored mock records",
    draftDescription: "Compare the restored mock records with the sample inventory and record any differences.",
  },
} satisfies Record<Project, { title: string; reference: string; sources: Source[]; headline: string; answer: string; draftTitle: string; draftDescription: string }>;

export function fixture(project: Project, stress: boolean) {
  const base = projects[project];
  if (!stress) return base;
  return {
    ...base,
    sources: [...base.sources, ...Array.from({ length: 97 }, (_, index) => ({
      id: "stress-" + (index + 4),
      title: "Fixture source " + (index + 4),
      type: "Note",
      revision: "R1",
      locator: "Sample appendix " + (index + 4),
      excerpt: "Generated evidence for testing the loaded-source filter and board layout.",
    }))],
  };
}

export function initialBoard(sources: Source[]): Board {
  return {
    reference: [...sources.slice(0, 1), ...sources.slice(2, 35)].map(source => source.id),
    review: [...sources.slice(1, 2), ...sources.slice(35, 67)].map(source => source.id),
    focus: sources.slice(67).map(source => source.id),
  };
}

export function placeCard(board: Board, id: string, destination: Group, before?: string): Board {
  if (before === id) return board;
  const next = {
    reference: board.reference.filter(card => card !== id),
    review: board.review.filter(card => card !== id),
    focus: board.focus.filter(card => card !== id),
  };
  const index = before ? next[destination].indexOf(before) : -1;
  next[destination].splice(index < 0 ? next[destination].length : index, 0, id);
  return groups.every(({ id: group }) =>
    board[group].length === next[group].length &&
    board[group].every((card, position) => card === next[group][position])
  ) ? board : next;
}
