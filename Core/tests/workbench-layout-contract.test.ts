import { describe, expect, it } from "vitest";
import { layoutVersion, parseLayoutBoard, replaceSourceLayout, sampleLayoutScope, sourceLayout } from "../../Web/lib/workbench/layout-contract.js";

const standard = sampleLayoutScope("demo-rfq", "standard")!;
const stress = sampleLayoutScope("demo-rfq", "stress")!;
const arranged = { reference: ["test"], review: ["finding"], focus: ["delivery"] };

describe("synthetic Workbench layout placements", () => {
  it("requires each catalog ID exactly once, with only the three ordered lanes", () => {
    expect(parseLayoutBoard(arranged, standard.sourceIds)).toEqual(arranged);
    for (const value of [
      { ...arranged, focus: ["test"] },
      { ...arranged, focus: ["unavailable-source"] },
      { ...arranged, focus: ["delivery", "task-draft"] },
      { ...arranged, focus: [] },
      { ...arranged, title: "Synthetic draft content" },
    ]) expect(parseLayoutBoard(value, standard.sourceIds)).toBeNull();
    expect(parseLayoutBoard(arranged, stress.sourceIds)).toBeNull();
    expect(parseLayoutBoard(stress.defaultBoard, standard.sourceIds)).toBeNull();
  });

  it("uses verified project UUID and separate standard and stress catalogs", () => {
    expect(standard.projectId).not.toBe(sampleLayoutScope("demo-bobai", "standard")?.projectId);
    expect(sampleLayoutScope("bobai", "standard")).toBeNull();
    expect(sampleLayoutScope("demo-rfq", "unknown")).toBeNull();
    expect(stress.sourceIds).toHaveLength(100);
    expect(standard.sourceIds).toHaveLength(3);
    expect([0, 40].every(layoutVersion)).toBe(true);
    expect([-1, 0.5, 41, NaN, Infinity, "1"].some(layoutVersion)).toBe(false);
  });

  it("keeps a board draft in its lane during restore and leaves it out of the saved record", () => {
    const board = {
      reference: ["delivery", "task-draft", "test"], review: ["finding"], focus: [],
    };
    const replaced = replaceSourceLayout(board, arranged);
    expect(replaced).toEqual({ ...arranged, reference: ["task-draft", "test"] });
    expect(sourceLayout(replaced)).toEqual(arranged);
    expect(board.reference).toEqual(["delivery", "task-draft", "test"]);
    expect(replaceSourceLayout(replaced, arranged)).toBe(replaced);
  });
});
