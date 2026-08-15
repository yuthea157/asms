import { describe, it, expect } from "vitest";
import { buildSubObjectiveTree } from "../subObjectiveTree.js";

describe("buildSubObjectiveTree", () => {
  it("arranges a flat list into a nested tree by parentSubObjectiveId (brief §13's arbitrary depth)", () => {
    const flat = [
      { id: "a", parentSubObjectiveId: null, title: "Improve line balancing" },
      { id: "b", parentSubObjectiveId: null, title: "Reduce bottlenecks" },
      { id: "c", parentSubObjectiveId: "a", title: "Nested under a" },
      { id: "d", parentSubObjectiveId: "c", title: "Nested under c (3 levels deep)" },
    ];
    const tree = buildSubObjectiveTree(flat);

    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["c"]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["d"]);
    expect(tree[0].children[0].children[0].children).toEqual([]);
    expect(tree[1].children).toEqual([]);
  });

  it("returns an empty array for an empty list", () => {
    expect(buildSubObjectiveTree([])).toEqual([]);
  });

  it("treats undefined parentSubObjectiveId the same as null (both mean top-level)", () => {
    const flat = [{ id: "a", title: "x" }, { id: "b", parentSubObjectiveId: null, title: "y" }];
    const tree = buildSubObjectiveTree(flat);
    expect(tree.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});
