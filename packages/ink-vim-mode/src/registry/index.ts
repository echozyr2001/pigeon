// Panel registry system for spatial navigation

import type {
  SpatialRelationships,
  PanelRegistration,
  Direction,
} from "../types";

export class PanelRegistry {
  private panels: Map<string, PanelRegistration> = new Map();
  private spatialGraph: Map<string, SpatialRelationships> = new Map();

  /**
   * Register a panel with its spatial relationships
   */
  register(id: string, relationships: SpatialRelationships): void {
    // Handle duplicate registrations with error logging
    if (this.panels.has(id)) {
      console.error(
        `Panel with id "${id}" is already registered. Using new registration.`
      );
    }

    const registration: PanelRegistration = {
      id,
      relationships,
    };

    this.panels.set(id, registration);
    this.spatialGraph.set(id, relationships);

    // Note: We don't validate connectivity during registration because
    // React components mount asynchronously and panels may be registered
    // in different orders, causing temporary disconnected states that
    // resolve once all components are mounted.
  }

  /**
   * Unregister a panel and clean up its relationships
   */
  unregister(id: string): void {
    if (!this.panels.has(id)) {
      return; // Silently ignore unregistration of non-existent panels
    }

    this.panels.delete(id);
    this.spatialGraph.delete(id);

    // Clean up any references to this panel in other panels' relationships
    for (const [panelId, relationships] of this.spatialGraph.entries()) {
      const updated: SpatialRelationships = {};
      let hasChanges = false;

      // Check each direction and remove references to the unregistered panel
      (["left", "right", "up", "down"] as const).forEach((dir) => {
        if (relationships[dir] === id) {
          hasChanges = true;
        } else if (relationships[dir]) {
          updated[dir] = relationships[dir];
        }
      });

      if (hasChanges) {
        this.spatialGraph.set(panelId, updated);
        // Update the panel registration as well
        const panel = this.panels.get(panelId);
        if (panel) {
          panel.relationships = updated;
        }
      }
    }
  }

  /**
   * Find adjacent panel in the specified direction
   */
  findAdjacent(panelId: string, direction: Direction): string | null {
    const relationships = this.spatialGraph.get(panelId);
    if (!relationships) {
      return null;
    }

    let adjacentId: string | undefined;
    switch (direction) {
      case "h": // left
        adjacentId = relationships.left;
        break;
      case "l": // right
        adjacentId = relationships.right;
        break;
      case "k": // up
        adjacentId = relationships.up;
        break;
      case "j": // down
        adjacentId = relationships.down;
        break;
      default:
        return null;
    }

    // Verify the adjacent panel still exists
    if (adjacentId && this.panels.has(adjacentId)) {
      return adjacentId;
    }

    return null;
  }

  /**
   * Validate that the spatial relationships form a connected graph
   */
  validateConnectivity(): boolean {
    const panelIds = Array.from(this.panels.keys());

    if (panelIds.length <= 1) {
      return true; // Single panel or empty registry is trivially connected
    }

    // Use BFS to check if all panels are reachable from the first panel
    const firstPanelId = panelIds[0];
    if (!firstPanelId) {
      return true; // Empty registry is trivially connected
    }

    const visited = new Set<string>();
    const queue: string[] = [firstPanelId];
    visited.add(firstPanelId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const relationships = this.spatialGraph.get(currentId);

      if (relationships) {
        // Check all four directions for adjacent panels
        const adjacents = [
          relationships.left,
          relationships.right,
          relationships.up,
          relationships.down,
        ].filter((id): id is string => id !== undefined && this.panels.has(id));

        for (const adjacentId of adjacents) {
          if (!visited.has(adjacentId)) {
            visited.add(adjacentId);
            queue.push(adjacentId);
          }
        }
      }
    }

    // All panels should be reachable for a connected graph
    return visited.size === panelIds.length;
  }

  /**
   * Get all registered panel IDs
   */
  getAllPanelIds(): string[] {
    return Array.from(this.panels.keys());
  }

  /**
   * Get panel registration by ID
   */
  getPanel(id: string): PanelRegistration | undefined {
    return this.panels.get(id);
  }

  /**
   * Check if a panel is registered
   */
  hasPanel(id: string): boolean {
    return this.panels.has(id);
  }

  /**
   * Clear all registered panels (for cleanup)
   */
  clear(): void {
    this.panels.clear();
    this.spatialGraph.clear();
  }
}
