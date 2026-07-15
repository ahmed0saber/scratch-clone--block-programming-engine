// ============================================================
// app.js — Application entry point
// ============================================================

import { CATEGORIES, BLOCK_DEFS } from "./blockDefs.js";
import { createBlockElement } from "./renderer.js";
import { Workspace } from "./workspace.js";
import { DragDropManager } from "./dragDrop.js";
import { Interpreter } from "./interpreter.js";

// ── Initialize ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const workspaceEl = document.getElementById("workspace");
  const paletteEl = document.getElementById("palette");
  const consoleOutput = document.getElementById("console-output");

  // Create workspace manager
  const workspace = new Workspace(workspaceEl);

  // Create interpreter
  const interpreter = new Interpreter(workspace, consoleOutput);

  // Create drag & drop manager
  const dragDrop = new DragDropManager(workspace, workspaceEl, paletteEl);

  // ── Render Palette ──────────────────────────────────
  renderPalette(paletteEl);

  // ── Wire Buttons ────────────────────────────────────
  document.getElementById("btn-run").addEventListener("click", () => {
    interpreter.run();
  });

  document.getElementById("btn-stop").addEventListener("click", () => {
    interpreter.stop();
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    const json = workspace.toJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blocks.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        workspace.loadJSON(ev.target.result);
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (confirm("Clear all blocks from the workspace?")) {
      workspace.clear();
      interpreter.clearConsole();
      workspace.panX = 0;
      workspace.panY = 0;
      workspace.zoom = 1;
      workspace._applyTransform();
    }
  });

  document.getElementById("btn-clear-console").addEventListener("click", () => {
    interpreter.clearConsole();
  });

  // --- Projects Modal Logic ---
  const modal = document.getElementById("projects-modal");
  const btnProjects = document.getElementById("btn-projects");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnSaveProject = document.getElementById("btn-save-project");
  const nameInput = document.getElementById("project-name-input");
  const projectList = document.getElementById("project-list");

  const getSavedProjects = () => {
    try {
      return JSON.parse(localStorage.getItem("scratch_clone_projects") || "[]");
    } catch {
      return [];
    }
  };

  const saveProjects = (projects) => {
    localStorage.setItem("scratch_clone_projects", JSON.stringify(projects));
  };

  const renderProjects = () => {
    const projects = getSavedProjects();
    projectList.innerHTML = "";

    if (projects.length === 0) {
      projectList.innerHTML =
        '<div style="color:var(--text-muted); font-size:0.85rem; padding-top:10px;">No saved projects found.</div>';
      return;
    }

    // Sort newest first
    projects.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    projects.forEach((p) => {
      const el = document.createElement("div");
      el.className = "project-item";

      const info = document.createElement("div");
      info.className = "project-info";

      const name = document.createElement("div");
      name.className = "project-name";
      name.textContent = p.name;

      const date = document.createElement("div");
      date.className = "project-date";
      date.textContent = new Date(p.date).toLocaleString();

      info.appendChild(name);
      info.appendChild(date);

      const actions = document.createElement("div");
      actions.className = "project-actions";

      const btnLoad = document.createElement("button");
      btnLoad.className = "btn btn-clear";
      btnLoad.style.padding = "4px 8px";
      btnLoad.textContent = "Load";
      btnLoad.onclick = () => {
        workspace.loadJSON(p.data);
        modal.classList.add("hidden");
      };

      const btnDel = document.createElement("button");
      btnDel.className = "btn-icon";
      btnDel.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      btnDel.onclick = () => {
        if (confirm('Delete project "' + p.name + '"?')) {
          saveProjects(getSavedProjects().filter((x) => x.id !== p.id));
          renderProjects();
        }
      };

      actions.appendChild(btnLoad);
      actions.appendChild(btnDel);

      el.appendChild(info);
      el.appendChild(actions);
      projectList.appendChild(el);
    });
  };

  btnProjects.addEventListener("click", () => {
    nameInput.value = "";
    renderProjects();
    modal.classList.remove("hidden");
  });

  btnCloseModal.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  btnSaveProject.addEventListener("click", () => {
    const name = nameInput.value.trim() || "Untitled Project";
    const data = workspace.toJSON();
    const projects = getSavedProjects();

    projects.push({
      id: Date.now().toString(),
      name,
      date: new Date().toISOString(),
      data,
    });

    saveProjects(projects);
    nameInput.value = "";
    renderProjects();
  });

  // ── Keyboard Shortcuts ──────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const selected = document.querySelector(".block.selected");
      if (selected && !e.target.closest("input, select")) {
        const id = selected.dataset.blockId;
        if (id) workspace.removeChain(id);
      }
    }
  });

  // ── Click to select/deselect blocks ─────────────────
  workspaceEl.addEventListener("click", (e) => {
    // Deselect all
    document
      .querySelectorAll(".block.selected")
      .forEach((el) => el.classList.remove("selected"));

    const blockEl = e.target.closest(".block[data-block-id]");
    if (blockEl && !e.target.closest("input, select")) {
      blockEl.classList.add("selected");
    }
  });

  // Click on workspace background to deselect
  document
    .getElementById("workspace-container")
    .addEventListener("click", (e) => {
      if (e.target === e.currentTarget || e.target === workspaceEl) {
        document
          .querySelectorAll(".block.selected")
          .forEach((el) => el.classList.remove("selected"));
      }
    });
});

// ── Render palette with categorized blocks ──────────────
function renderPalette(paletteEl) {
  // Group blocks by category
  const grouped = {};
  Object.values(BLOCK_DEFS).forEach((def) => {
    if (!grouped[def.category]) grouped[def.category] = [];
    grouped[def.category].push(def);
  });

  Object.entries(CATEGORIES).forEach(([catKey, catInfo]) => {
    const blocks = grouped[catKey];
    if (!blocks || blocks.length === 0) return;

    const section = document.createElement("div");
    section.className = "palette-category";

    // Category header
    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `
      <i data-lucide="${catInfo.icon}" style="color: ${catInfo.color}; width: 16px; height: 16px; margin-right: 6px;"></i>
      <span>${catInfo.name}</span>
      <svg class="cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    `;

    // Toggle collapse
    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      blocksContainer.classList.toggle("hidden");
    });

    section.appendChild(header);

    // Blocks container
    const blocksContainer = document.createElement("div");
    blocksContainer.className = "category-blocks";

    blocks.forEach((def) => {
      const { element } = createBlockElement(def.type);
      element.classList.add("palette-block");
      // Remove the instance ID for palette blocks (they're templates)
      delete element.dataset.blockId;
      blocksContainer.appendChild(element);
    });

    section.appendChild(blocksContainer);
    paletteEl.appendChild(section);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
