import { describe, expect, it } from "vitest";
import { collectTopTags, stripHtml } from "../lib/knowledge-utils";

describe("knowledge utilities", () => {
  it("turns editor HTML into readable text", () => {
    expect(stripHtml("<h1>标题</h1><p>知识 <strong>内容</strong></p>")).toBe("标题 知识 内容");
  });

  it("counts repeated themes across knowledge and ideas", () => {
    expect(collectTopTags([{ aiTags: ["声纳", "表征"] }, { aiTags: ["表征"] }])).toEqual([["表征", 2], ["声纳", 1]]);
  });
});
