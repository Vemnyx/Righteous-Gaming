import { useState } from "react";
import { SetsAdmin } from "./SetsAdmin";
import { CardsAdmin } from "./CardsAdmin";
import { HeroesAdmin } from "./HeroesAdmin";

/**
 * Combined catalog admin: Sets, Cards, and Heroes under one rail tab.
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CatalogAdmin({ isLight, active }) {
  const [sub, setSub] = useState(/** @type {"sets" | "cards" | "heroes"} */ ("sets"));

  const tabBtn = (id, label) => {
    const on = sub === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={on}
        className={`rounded-lg border px-3.5 py-2 text-[0.8125rem] font-semibold transition ${
          on
            ? "border-white/30 bg-white/[0.12] text-[#f4f0fa]"
            : "border-white/15 bg-black/25 text-[#f4f0fa]/65 hover:border-white/25 hover:text-[#f4f0fa]"
        }`}
        onClick={() => setSub(id)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex w-full flex-1 flex-col gap-3">
      <div
        className="inline-flex flex-wrap gap-1.5 self-start rounded-xl border border-white/[0.12] bg-black/20 p-1.5"
        role="tablist"
        aria-label="Catalog sections"
      >
        {tabBtn("sets", "Sets")}
        {tabBtn("cards", "Cards")}
        {tabBtn("heroes", "Heroes")}
      </div>
      {sub === "sets" ? <SetsAdmin isLight={isLight} active={active && sub === "sets"} /> : null}
      {sub === "cards" ? <CardsAdmin isLight={isLight} active={active && sub === "cards"} /> : null}
      {sub === "heroes" ? <HeroesAdmin isLight={isLight} active={active && sub === "heroes"} /> : null}
    </div>
  );
}
