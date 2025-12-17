// Panel registry system for spatial navigation

import type { SpatialRelationships, PanelRegistration } from "../types";

export class PanelRegistry {
  // TODO: Implement PanelRegistry
  register(id: string, relationships: SpatialRelationships): void {
    throw new Error("PanelRegistry not yet implemented");
  }

  unregister(id: string): void {
    throw new Error("PanelRegistry not yet implemented");
  }

  findAdjacent(panelId: string, direction: string): string | null {
    throw new Error("PanelRegistry not yet implemented");
  }
}
