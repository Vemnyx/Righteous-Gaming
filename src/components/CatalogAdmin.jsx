import { useState } from "react";
import { SetsAdmin } from "./SetsAdmin";
import { CardsAdmin } from "./CardsAdmin";
import { HeroesAdmin } from "./HeroesAdmin";
import {
  PANEL_TABS_BLEED,
  PANEL_TABS_CONTENT_PAD,
  PanelTabList,
  panelTabButton,
} from "./PanelTabs";

/**
 * Combined catalog admin: Sets, Cards, and Heroes under one rail tab.
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CatalogAdmin({ isLight, active }) {
  const [sub, setSub] = useState(/** @type {"sets" | "cards" | "heroes"} */ ("sets"));

  return (
    <div className={PANEL_TABS_BLEED} aria-label="Catalog">
      <PanelTabList ariaLabel="Catalog sections">
        {panelTabButton("sets", sub === "sets", "Sets", () => setSub("sets"))}
        {panelTabButton("cards", sub === "cards", "Cards", () => setSub("cards"))}
        {panelTabButton("heroes", sub === "heroes", "Heroes", () => setSub("heroes"))}
      </PanelTabList>
      <div className={PANEL_TABS_CONTENT_PAD} role="tabpanel">
        {sub === "sets" ? <SetsAdmin isLight={isLight} active={active && sub === "sets"} /> : null}
        {sub === "cards" ? <CardsAdmin isLight={isLight} active={active && sub === "cards"} /> : null}
        {sub === "heroes" ? <HeroesAdmin isLight={isLight} active={active && sub === "heroes"} /> : null}
      </div>
    </div>
  );
}
