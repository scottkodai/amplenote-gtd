{
// =================================================================================================
// =================================================================================================
//                                     Utility Functions
// =================================================================================================
// =================================================================================================

  // ===============================================================================================
  // Escapes square brackets from titles for literal matching in markdown links
  // Called from: Find Related Items, used to escape brackets in task content comparisons
  // ==============================================================================================+
  escapeBrackets: function(text) {
    return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  }, // end escapeBrackets

  // ===============================================================================================
  // Extracts the first text found inside square brackets from the note title
  // Called from: Find Related Items (to extract r/ tag from title)
  // ===============================================================================================
  extractBracketText: function(title) {
    const match = title.match(/\[(.*?)\]/);
    return match ? match[1] : "";
  }, // end extractBracketText

  // ===============================================================================================
  // Converts a deadline timestamp into Pacific date string
  // Called from: Refresh Relevant Tasks
  // ===============================================================================================
  convertDeadlineToPacific: function(deadlineTimestamp) {
    if (!deadlineTimestamp) return null;
    return new Date(deadlineTimestamp * 1000).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "short", day: "numeric"
    });
  }, // end convertDeadlineToPacific

  // ===============================================================================================
  // Returns days until deadline
  // Called from: Refresh Relevant Tasks
  // ===============================================================================================
  daysUntilDeadline: function(deadlineTimestamp) {
    if (!deadlineTimestamp) return null;
    return (deadlineTimestamp * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
  }, // end daysUntilDeadline

  // ===============================================================================================
  // Ensures footnote references are uniquely numbered to avoid clashes
  // Called from: Refresh Relevant Tasks
  // ===============================================================================================
  uniquifyFootnotes: function(content, counterStart) {
    let counter = counterStart;
    const refRegex = /\[\^([^\]\s]+?)\]/g;
    const defRegex = /^\[\^([^\]\s]+?)\]:/gm;
    const labelMap = {};

    const updatedContent = content.replace(refRegex, (match, label) => {
      if (!labelMap[label]) labelMap[label] = `fn${counter++}`;
      return `[^${labelMap[label]}]`;
    }).replace(defRegex, (match, label) => {
      return labelMap[label] ? `[^${labelMap[label]}]:` : match;
    });

    return { updatedContent, nextCounter: counter };
  }, // end uniquifyFootnotes


  // ===============================================================================================
  // Returns notes matching an optional given base tag, filtered by optional domain tags,
  // excluding any notes tagged with 'archive' or 'exclude'.
  // Called from anywhere instead of app.filterNotes to apply consistent exclusions.
  // ===============================================================================================
  getFilteredNotes: async function (app, baseTag = "", domainTags = []) {
    let query = baseTag ? `${baseTag},^archive,^exclude` : "^archive,^exclude";
    let notes = await app.filterNotes({ tag: query });

    if (domainTags.length > 0) {
      notes = notes.filter(n => {
        const noteDomainTags = n.tags.filter(t => t.startsWith("d/"));
        return (
          noteDomainTags.length === 0 ||
          domainTags.some(dt => noteDomainTags.includes(dt))
        );
      });
    }

    return notes;
  }, // end getFilteredNotes

  // ===============================================================================================
  // Returns all tasks matching an optional given base tag, filtered by optional domain tags,
  // excluding any tasks on notes tagged with 'archive' or 'exclude' (due to getFilteredNotes).
  // Called from anywhere tasks are needed to apply consistent exclusions.
  // ===============================================================================================  
  getAllTasks: async function(app, baseTag = "", domainTags = []) {
    const plugin = this;
    const allTasks = [];

    //const start = Date.now(); // start timing

    const noteHandles = await plugin.getFilteredNotes(app, baseTag, domainTags);

    for (const handle of noteHandles) {
      // Need the full Note object to call .tasks()
      const note = await app.notes.find(handle.uuid);
      if (!note) continue;

      const noteTasks = await note.tasks();
      allTasks.push(...noteTasks);
    }

    //const elapsed = Date.now() - start; // elapsed ms
    //await app.alert(`getAllTasks: scanned ${noteHandles.length} notes, found ${allTasks.length} tasks in ${elapsed}ms`);

    return allTasks;
  }, // end getAllTasks

  // ===============================================================================================
  // Helper function to build a list of project notes. Parameters allow for different formats:
  // - groupByStatus:
  //    -- "full" means a bulleted list with statuses as top-level bullets
  //    -- "flat" means a list of projects without top-level status bullets (for [bracketed text] lists)
  // - includeChildren:
  //    -- true means that children will be nested under parents
  //    -- false means that children will be listed as standalone projects
  // - format:
  //    -- "standard" means just lists of projects
  //    -- "weeklyReview" means additional metadata about each project listed as sub-bullets
  // - sortCompletedByDate:
  //    -- true means that completed projects will be sorted by date desc (based on subtag) instead of alphabetically
  //    -- false means that completed projects will be sorted alphabetically
  // ===============================================================================================
  buildNestedProjectList: async function(app, {
    baseNotes,
    groupByStatus = "full",
    includeChildren = true,
    format = "standard",
    sortCompletedByDate = false
  }) {
    const projectStatuses = [
      { tag: "project/focus", label: "Focus Projects" },
      { tag: "project/active", label: "Active Projects" },
      { tag: "project/tracking", label: "Tracking Projects" },
      { tag: "project/on-hold", label: "On Hold Projects" },
      { tag: "project/future", label: "Future Projects" },
      { tag: "project/someday", label: "Someday Projects" },
      { tag: "project/completed", label: "Completed Projects" },
      { tag: "project/canceled", label: "Canceled Projects" }
    ];

    // --- Helpers ---
    const getNoteId = (note) => {
      const idTag = note.tags.find(t => t.startsWith("note-id/"));
      return idTag ? idTag.split("/")[1] : null;
    };

    const getLatestDailyJotBacklink = async (app, projectNote) => {
      const backlinks = await app.getNoteBacklinks(projectNote);
      if (!backlinks || backlinks.length === 0) return null;
      const jotHandles = backlinks.filter(h => h.tags?.includes("daily-jots"));
      if (jotHandles.length === 0) return null;
      jotHandles.sort((a, b) => new Date(b.created) - new Date(a.created));
      return this.normalizeNoteHandle(jotHandles[0]);
    };

    const collectTasksFromNoteAndBacklinks = async (app, projectNote) => {
      let tasks = [];
      const ownTasks = await app.getNoteTasks(projectNote);
      tasks.push(...ownTasks);
      const backlinks = await app.getNoteBacklinks(projectNote);
      for (const handle of backlinks) {
        const noteTasks = await app.getNoteTasks(handle);
        for (const t of noteTasks) {
          if (t.content.includes(projectNote.name) || t.content.includes(`[[${projectNote.name}]]`)) {
            tasks.push(t);
          }
        }
      }
      return [...new Set(tasks.map(t => t.content))]; // dedupe before footnotes
    };

    let footnoteCounter = 1; // global across the whole render

    const renderChildren = async (parentNote, indentLevel, visited) => {
      const parentId = getNoteId(parentNote);
      if (!parentId) return "";
      const children = await this.getFilteredNotes(app, `r/parent/${parentId}`);
      const projChildren = children.filter(c => c.tags.some(t => t.startsWith("project/")));
      projChildren.sort((a, b) => a.name.localeCompare(b.name));
      let out = "";
      for (const c of projChildren) {
        out += await renderProject(c, indentLevel, visited);
      }
      return out;
    };

    const renderProject = async (note, indentLevel = 0, visited = new Set()) => {
      if (!note) return "";
      if (visited.has(note.uuid)) return "";
      visited.add(note.uuid);

      const handle = this.normalizeNoteHandle(note);
      const indent = "    ".repeat(indentLevel);
      let md = `${indent}- [${handle.name}](${handle.url})\n`;

      // === Weekly Review Metadata ===
      if (format === "weeklyReview") {
        const lastJot = await getLatestDailyJotBacklink(app, note);
        md += lastJot
          ? `${indent}    - Last Activity: [${lastJot.name}](${lastJot.url})\n`
          : `${indent}    - Last Activity: _none_\n`;

        const rawTasks = await collectTasksFromNoteAndBacklinks(app, note);
        if (rawTasks.length > 0) {
          md += `${indent}    - Tasks:\n`;
          for (const raw of rawTasks) {
            const { updatedContent, nextCounter } = this.uniquifyFootnotes(raw, footnoteCounter);
            footnoteCounter = nextCounter;
            md += `${indent}        - ${updatedContent}\n`;
          }
          md += `\n`; // 🔑 separate tasks from next block
        } else {
          md += `${indent}    - Tasks: _none_\n\n`;
        }
      }

      if (includeChildren) {
        md += await renderChildren(note, indentLevel + 1, new Set(visited));
      }
      return md;
    };

    // --- 🔹 Fixed Roots ---
    const getRoots = (notes) => {
      return notes.filter(n => {
        const hasParentTag = n.tags.some(t => t.startsWith("r/parent/"));
        return !hasParentTag;
      });
    };

    // --- Main Render ---
    let md = "";

    if (groupByStatus === "full") {
      for (const status of projectStatuses) {
        md += `- ${status.label}\n`;
        const statusProjects = baseNotes.filter(n => n.tags.includes(status.tag));
        const roots = getRoots(statusProjects);

        if (status.tag === "project/completed" && sortCompletedByDate) {
          roots.sort((a, b) => {
            const ta = a.tags.find(t => t.startsWith("project/completed/"))?.split("/")[2] || "";
            const tb = b.tags.find(t => t.startsWith("project/completed/"))?.split("/")[2] || "";
            return tb.localeCompare(ta);
          });
        } else {
          roots.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (roots.length === 0) {
          md += `    - *No matching projects*\n\n`;
        } else {
          for (const proj of roots) {
            md += await renderProject(proj, 1);
          }
          md += `\n`;
        }
      }

    } else if (groupByStatus === "flat" || groupByStatus === "weeklyReview") {
      const roots = getRoots(baseNotes).sort((a, b) => a.name.localeCompare(b.name));
      for (const proj of roots) {
        md += await renderProject(proj, 0);
      }
    }

    await app.alert(md.trim);
    
    return md.trim();
  }, // end buildNestedProjectList

  // ===============================================================================================
  // Returns a copy of the given note handle with a .url property added.
  // Preserves all original metadata provided by Amplenote (created, updated, tags, etc.).
  // ===============================================================================================
  normalizeNoteHandle: function(note) {
    return {
      ...note,
      url: `https://www.amplenote.com/notes/${note.uuid}`
    };
  }, // end normalizeNoteHandle

  // ===============================================================================================
  // Returns an array of parent notes for the given noteUUID.
  // Looks for r/parent/* tags on the note and fetches each parent note.
  // ===============================================================================================
  getParentNotes: async function (app, noteUUID) {
    const note = await app.notes.find(noteUUID);
    if (!note) throw new Error("Note not found.");

    const parentTags = note.tags.filter(t => t.startsWith("r/parent/"));
    if (parentTags.length === 0) return [];

    // Extract note-id portion
    const parentIds = parentTags.map(t => t.split("/")[2]);

    // Find notes with matching note-id/* tags
    const parents = [];
    for (const pid of parentIds) {
      const matches = await app.filterNotes({ tag: `note-id/${pid}` });
      if (matches.length > 0) parents.push(this.normalizeNoteHandle(matches[0]));
    }
    return parents;
  }, // end getParentNotes

  // ===============================================================================================
  // Returns an array of child notes for the given noteUUID.
  // Looks for r/child/* tags on the note and fetches each child note.
  // ===============================================================================================
  getChildNotes: async function (app, noteUUID) {
    const note = await app.notes.find(noteUUID);
    if (!note) throw new Error("Note not found.");

    const childTags = note.tags.filter(t => t.startsWith("r/child/"));
    if (childTags.length === 0) return [];

    const childIds = childTags.map(t => t.split("/")[2]);

    const children = [];
    for (const cid of childIds) {
      const matches = await app.filterNotes({ tag: `note-id/${cid}` });
      if (matches.length > 0) children.push(this.normalizeNoteHandle(matches[0]));
    }
    return children;
  }, // end getChildNotes

  // ===============================================================================================
  // Establishes a parent/child relationship between two notes (intented for project notes).
  // Ensures both notes have a note-id tag, then adds:
  //   - r/child/<parent-note-id> to the child note
  //   - r/parent/<parent-note-id> to the parent note
  // Called from: 
  // ===============================================================================================
  setParentChildRelationship: async function (app, childUUID, parentUUID) {

    // Load notes
    const child = await app.notes.find(childUUID);
    const parent = await app.notes.find(parentUUID);
    if (!child) throw new Error("Child note not found.");
    if (!parent) throw new Error("Parent note not found.");

    // Ensure both have note-ids
    const childIdTag = await this.getNoteIdTag(app, child);
    const childId = childIdTag.split("/")[1];
    const parentIdTag = await this.getNoteIdTag(app, parent);
    const parentId = parentIdTag.split("/")[1];

    // Add relationship tags (child note gets a tag identifying its parent; parent note
    // gets a tag identifying its child(ren))
    await child.addTag(`r/parent/${parentId}`);
    await parent.addTag(`r/child/${childId}`);
  }, // end setParentChildRelationship

  // ===============================================================================================
  // Returns a note's note-id tag if it exists, creating it if necessary. This function is only
  // called if a relationship needs to be established between two notes.
  // Called from: 
  // ===============================================================================================
  getNoteIdTag: async function (app, note) {
    // Return existing note-id/* if present
    const existing = note.tags.find(t => t.startsWith("note-id/"));
    if (existing) return existing;

    // Use your existing generator from v2 (already robust)
    // We call through “this” so it can live alongside your helpers
    const noteHandle = await app.findNote({ uuid: note.uuid }); // fills created/title/tags
    const tag = await this.generateUniqueNoteIdTag(app, noteHandle);
    const added = await note.addTag(tag); // returns boolean
    if (!added) throw new Error("Could not add note-id tag");
    return tag;
  }, // end getNoteIdTag

  // ===============================================================================================
  // Generates a unique note ID for tagging notes, based on the note's create timestamp.
  // Uses a regex to pull just numbers from the ISO 8601 datestamp and then checks to see if
  // there's a note-id collision (two notes created in the same second). If a collision is 
  // detected, add a counter value and recheck until a unique value is found.
  // Called from: 
  // ===============================================================================================
  generateUniqueNoteIdTag: async function(app, note) {
    // Use regex to extract YYYYMMDDHHMMSS from ISO 8601 string
    const match = note.created.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) {
      throw new Error("Invalid note.created format");
    }

    const [, year, month, day, hour, minute, second] = match;
    const baseId = `${year}${month}${day}${hour}${minute}${second}`;
    let candidate = `note-id/${baseId}`;
    let counter = 1;

    // Loop to ensure uniqueness (if note-id/20250726141507 already exists)
    while ((await app.filterNotes({ tag: candidate })).some(n => n.uuid !== note.uuid)) {
      candidate = `note-id/${baseId}-${counter++}`;
    }

    return candidate;
  }, // end generateUniqueNoteIdTag

  // ===============================================================================================
  // Determines note type
  // Called from: 
  // ===============================================================================================
  getNoteType: function (note) {
    // Priorities: list/*, project/*, reference/subtype, plain single-word types
    const tag = note.tags.find(t =>
      t.startsWith("list/") ||
      t.startsWith("project/") ||
      t.startsWith("reference/") ||
      ["person", "software", "vendor", "horizon"].includes(t)
    );
    if (!tag) return null;

    if (tag.startsWith("reference/")) {
      const subtype = tag.split("/")[1];
      if (["people", "software", "vendor", "horizon"].includes(subtype)) {
        return subtype; // drop the "reference/" for r/ tags
      }
    }
    return tag;
  }, // end getNoteType

  // ===============================================================================================
  // Runs the tagging cleanup process and updates the "Tagging Cleanup" section in the Inbox note
  // ===============================================================================================
  taggingCleanup: async function (app) {
    const plugin = this;
    const cleanupResults = [];

    // Helper to normalize, sort, and link notes
    const formatNoteList = (notes) => {
      return notes
        .map(n => plugin.normalizeNoteHandle(n))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(handle => `    - [${handle.name}](${handle.url})`)
        .join("\n");
    };

    // A: Missing critical tag
    let allNotes = await app.filterNotes({ tag: "^archive,^exclude" });
    const criticalPrefixes = ["daily-jots", "list/", "reference/", "system", "project/"];
    const missingCritical = allNotes.filter(n =>
      !n.tags.some(tag => criticalPrefixes.some(prefix => tag.startsWith(prefix)))
    );
    if (missingCritical.length > 0) {
      cleanupResults.push({ reason: "Missing critical tag", notes: missingCritical });
    }

    // B: Active project notes with no r/people tag
    const projectStatuses = ["project/active", "project/focus", "project/on-hold", "project/tracking"];
    let missingPeople = [];
    for (const status of projectStatuses) {
      const projects = await plugin.getFilteredNotes(app, status);
      missingPeople.push(...projects.filter(n => !n.tags.some(tag => tag.startsWith("r/people/"))));
    }
    if (missingPeople.length > 0) {
      cleanupResults.push({ reason: "Active project notes with no r/people tag", notes: missingPeople });
    }

    // C: Multiple domain tags
    const notesWithMultipleDomains = allNotes.filter(n => n.tags.filter(t => t.startsWith("d/")).length > 1);
    if (notesWithMultipleDomains.length > 0) {
      cleanupResults.push({ reason: "Multiple domain tags", notes: notesWithMultipleDomains });
    }

    // D: Multiple project status tags
    const notesWithMultipleProjectStatus = allNotes.filter(n => n.tags.filter(t => t.startsWith("project/")).length > 1);
    if (notesWithMultipleProjectStatus.length > 0) {
      cleanupResults.push({ reason: "Multiple project status tags", notes: notesWithMultipleProjectStatus });
    }

    // E: Parent projects with no child projects
    const parentProjects = allNotes.filter(n => n.tags.some(t => t.startsWith("r/child/")));
    const noChildren = [];
    for (const parent of parentProjects) {
      const children = await plugin.getChildNotes(app, parent.uuid);
      if (children.length === 0) noChildren.push(parent);
    }
    if (noChildren.length > 0) {
      cleanupResults.push({ reason: "Parent projects with no child projects", notes: noChildren });
    }

    // F: Child projects with no parent project
    const childProjects = allNotes.filter(n => n.tags.some(t => t.startsWith("r/parent/")));
    const noParent = [];
    for (const child of childProjects) {
      const parents = await plugin.getParentNotes(app, child.uuid);
      if (parents.length === 0) noParent.push(child);
    }
    if (noParent.length > 0) {
      cleanupResults.push({ reason: "Child projects with no parent project", notes: noParent });
    }

    // Build Markdown for the Tagging Cleanup section
    let md = "";
    if (cleanupResults.length === 0) {
      md = "_No cleanup issues found_";
    } else {
      for (const group of cleanupResults) {
        md += `- ${group.reason}\n`;
        md += formatNoteList(group.notes) + "\n";
      }
    }

    // Find the Inbox note and update the Tagging Cleanup section
    const inbox = await app.findNote({ name: "Inbox" });
    if (!inbox) {
      await app.alert("❌ Inbox note not found.");
      return;
    }
    await app.replaceNoteContent(inbox.uuid, md, {
      section: { heading: { text: "Tagging Cleanup" } }
    });

    await app.alert("✅ Tagging Cleanup section updated in Inbox.");
  }, // end taggingCleanup

// =================================================================================================
// =================================================================================================
//                                     Tag Management functions
// =================================================================================================
// =================================================================================================

  // ===============================================================
  // setNoteTags: function to allow user to manage tags via prompt
  // ===============================================================
  setNoteTags: async function(app, noteUUID) {
    const plugin = this;
    const note = await app.notes.find(noteUUID);
    if (!note) {
      await app.alert("❌ Could not find the current note.");
      return;
    }

    const isProjectNote = note.tags.some(t => t.startsWith("project/"));
    const currentRelations = await plugin.getReadableRelationships(app, note);

    const inputs = [];

    // If project note — add status & parent
    if (isProjectNote) {
      inputs.push({
        label: "Project Status",
        type: "select",
        options: [
          { label: "", value: "" },
          { label: "Focus", value: "project/focus" },
          { label: "Active", value: "project/active" },
          { label: "Tracking", value: "project/tracking" },
          { label: "On hold", value: "project/on-hold" },
          { label: "Future", value: "project/future" },
          { label: "Someday", value: "project/someday" },
          { label: "Completed", value: "project/completed" },
          { label: "Canceled", value: "project/canceled" }
        ]
      });

      inputs.push({ label: "Parent Project", type: "note" });
    }

    // Add relationship
    inputs.push({ label: "Add Relationship", type: "note" });

    // Remove relationship
    if (currentRelations.length > 0) {
      inputs.push({
        label: "Remove Relationship",
        type: "select",
        options: [
          { label: "", value: "" },
          ...currentRelations.map(r => ({ label: r.label, value: r.label }))
        ]
      });
    }

    // Debug: show built inputs before prompt
    // await app.alert("Inputs:\n" + JSON.stringify(inputs, null, 2));

    // Prompt with Continue action
    const result = await app.prompt(`Set tags for "${note.name}"`, {
      inputs,
      actions: [
        { label: "Continue", value: "continue" }
      ]
    });

    if (!result) return; // cancel

    const actionValue = result[result.length - 1];
    const actionWasContinue = actionValue === "continue";

    // Parse values in order
    let idx = 0;
    const getNext = () => result[idx++];

    const projectStatusValue = isProjectNote ? getNext() : null;
    const parentProjectValue = isProjectNote ? getNext() : null;
    const addRelationshipValue = getNext();
    const removeRelationshipValue = currentRelations.length > 0 ? getNext() : null;

    // === Apply changes ===
    if (isProjectNote && projectStatusValue) {
      const oldStatus = note.tags.find(t => t.startsWith("project/"));
      if (oldStatus) await note.removeTag(oldStatus);

      if (projectStatusValue === "project/completed") {
        const now = new Date();
        const datestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
        await note.addTag(`project/completed/${datestamp}`);
      } else {
        await note.addTag(projectStatusValue);
      }
    }

    if (isProjectNote && parentProjectValue?.uuid) {
      await plugin.setParentChildRelationship(app, noteUUID, parentProjectValue.uuid);
    }

    if (addRelationshipValue?.uuid) {
      await plugin.addRelationshipByType(app, note, addRelationshipValue);
    }

    if (removeRelationshipValue) {
      const relation = currentRelations.find(r => r.label === removeRelationshipValue);
      if (relation) {
        await plugin.removeRelationship(app, note, relation);
      }
    }

    // Refresh related sections
    const domainTags = note.tags.filter(t => t.startsWith("d/"));
    const summary = await this.updateAllRelatedSections(app, noteUUID, domainTags);

    /*
    await app.alert(
      `✅ Tags updated for "${note.name}"\n` +
      `Sections refreshed: ${summary.updatedSections}\n` +
      `Total items updated: ${summary.totalItems}`
    );
    */

    if (actionWasContinue) {
      await this.setNoteTags(app, noteUUID);
    }
  }, // end setNoteTags

  // ===============================================================
  // Helper: Get readable relationships for dropdown
  // ===============================================================
  getReadableRelationships: async function(app, note) {
    const plugin = this;
    const results = [];

    // === Parent relationships ===
    const parents = await plugin.getParentNotes(app, note.uuid);
    parents.forEach(p => results.push({ type: "parent", uuid: p.uuid, label: `(Parent) ${p.name}` }));

    // === Child relationships ===
    const children = await plugin.getChildNotes(app, note.uuid);
    children.forEach(c => results.push({ type: "child", uuid: c.uuid, label: `(Child) ${c.name}` }));

    // === Direct r/* relationships from this note (excluding parent/child) ===
    const directRTags = note.tags.filter(t =>
      t.startsWith("r/") &&
      !t.startsWith("r/parent/") &&
      !t.startsWith("r/child/")
    );

    for (const tag of directRTags) {
      const [, type, targetId] = tag.split("/");
      const matches = await app.filterNotes({ tag: `note-id/${targetId}` });
      if (matches.length > 0) {
        const handle = plugin.normalizeNoteHandle(matches[0]);
        // Avoid duplicates
        if (!results.some(r => r.uuid === handle.uuid)) {
          results.push({ type: "other", uuid: handle.uuid, label: handle.name });
        }
      }
    }

    // === Reverse lookup: find notes pointing to this one ===
    const noteIdTag = await plugin.getNoteIdTag(app, note);
    const noteIdValue = noteIdTag.split("/")[1];

    let allNotes = await app.filterNotes({ tag: "^archive,^exclude" });
    const relatedNotes = allNotes.filter(n =>
      n.tags.some(t => t.startsWith("r/") && t.endsWith(`/${noteIdValue}`))
    );

    for (const rel of relatedNotes) {
      if (parents.some(p => p.uuid === rel.uuid) || children.some(c => c.uuid === rel.uuid)) continue;
      if (!results.some(r => r.uuid === rel.uuid)) {
        results.push({ type: "other", uuid: rel.uuid, label: rel.name });
      }
    }

    return results;
  }, // end getReadableRelationships

  // ===============================================================
  // Helper: Add relationship with same rules as buildRelationship
  // ===============================================================
  addRelationshipByType: async function(app, note, relatedHandle) {
    const plugin = this;
    const relatedNote = await app.notes.find(relatedHandle.uuid);

    const noteType = plugin.getNoteType(note);
    const relatedType = plugin.getNoteType(relatedNote);

    // 🚫 Prevent adding two-way relationship between two projects
    if (noteType.startsWith("project/") && relatedType.startsWith("project/")) {
      await app.alert("❌ Project-to-project relationships must be set as Parent/Child.");
      return;
    }

    const noteIdTag = await plugin.getNoteIdTag(app, note);
    const relatedNoteIdTag = await plugin.getNoteIdTag(app, relatedNote);

    const noteId = noteIdTag.split("/")[1];
    const relatedNoteId = relatedNoteIdTag.split("/")[1];

    if (noteType.startsWith("project/")) {
      await note.addTag(`r/${relatedType}/${relatedNoteId}`);
    } else if (relatedType.startsWith("project/")) {
      await relatedNote.addTag(`r/${noteType}/${noteId}`);
    } else {
      await note.addTag(`r/${relatedType}/${relatedNoteId}`);
      await relatedNote.addTag(`r/${noteType}/${noteId}`);
    }
  }, // end addRelationshipByType

  // ===============================================================
  // Helper: Remove relationship cleanly
  // ===============================================================
  removeRelationship: async function(app, note, relation) {
    const plugin = this;
    const target = await app.notes.find(relation.uuid);
    if (!target) return;

    const noteIdTag = await plugin.getNoteIdTag(app, note);
    const targetIdTag = await plugin.getNoteIdTag(app, target);
    const noteId = noteIdTag.split("/")[1];
    const targetId = targetIdTag.split("/")[1];

    if (relation.type === "parent") {
      await note.removeTag(`r/parent/${targetId}`);
      await target.removeTag(`r/child/${noteId}`);
    } else if (relation.type === "child") {
      await note.removeTag(`r/child/${targetId}`);
      await target.removeTag(`r/parent/${noteId}`);
    } else {
      // Remove from both sides if both have the tag
      await note.removeTag(`r/${plugin.getNoteType(target)}/${targetId}`);
      await target.removeTag(`r/${plugin.getNoteType(note)}/${noteId}`);
    }
  }, // end removeRelationship

// =================================================================================================
// =================================================================================================
//                                     List Update functions
// =================================================================================================
// =================================================================================================

  // ===============================================================================================
  // Updates any "Related *" sections with links to all related notes
  // Called from: 
  // ===============================================================================================
  updateAllRelatedSections: async function (app, noteUUID, domainTags = []) {
    const staticSections = [
      { name: "Related Tasks", fn: this.updateRelatedTasksSection },
      { name: "Related Projects", fn: this.updateRelatedProjectsSection },
      { name: "Related People", fn: this.updateRelatedPeopleSection },
      { name: "Related References", fn: this.updateRelatedReferencesSection },
      { name: "Related Software", fn: this.updateRelatedSoftwareSection },
      { name: "Related Vendors", fn: this.updateRelatedVendorsSection },
      { name: "Parent Projects", fn: this.updateParentProjectsSection },
      { name: "Child Projects", fn: this.updateChildProjectsSection }
    ];

    let totalUpdated = 0;
    let totalCount = 0;

    for (const section of staticSections) {
      const result = await section.fn.call(this, app, noteUUID, domainTags);
      if (result && result.updated) {
        totalUpdated++;
        totalCount += result.count || 0;
      }
    }

    return { updatedSections: totalUpdated, totalItems: totalCount };
  }, //end updateAllRelatedSections

  // ===============================================================================================
  // Updates any bracketed text sections with links to all related notes
  // Called from: 
  // ===============================================================================================
  updateBracketedSections: async function (app, note, listType, domainTags = []) {
    const plugin = this;
    const sections = await app.getNoteSections({ uuid: note.uuid });

    let totalUpdated = 0;
    let totalCount = 0;

    for (const section of sections) {
      if (!section.heading || !section.heading.text.includes("[")) continue;

      const match = section.heading.text.match(/\[([^\]]+)\]/);
      if (!match) continue;
      const subtag = match[1]; // e.g., "focus", "it-leadership"

      // Figure out the base tag for filtering
      let baseTag = "";
      switch (listType) {
        case "list/project":
        case "list/weekly-review": // ✅ same logic, but weeklyReview format
          baseTag = `project/${subtag}`;
          break;
        case "list/software":
          baseTag = `reference/software/${subtag}`;
          break;
        case "list/people":
          baseTag = `reference/people/${subtag}`;
          break;
        case "list/reference":
          baseTag = `reference/${subtag}`;
          break;
      }

      // Get all notes with the base tag, filtered by domain
      let matchingNotes = await this.getFilteredNotes(app, baseTag, domainTags);

      // Pick format depending on list type
      const format = (listType === "list/weekly-review") ? "weeklyReview" : "standard";

      // Build flat list with children
      const md = await plugin.buildNestedProjectList(app, {
        baseNotes: matchingNotes,
        groupByStatus: "flat",   // ✅ bracketed headings already group by status
        includeChildren: true,
        format
      });

      // Replace section content
      await app.replaceNoteContent(note.uuid, md, {
        section: { heading: { text: section.heading.text } }
      });

      totalUpdated++;
      totalCount += matchingNotes.length;
    }

    return { updatedSections: totalUpdated, totalItems: totalCount };
  }, //end updateBracketedSections

  // ===============================================================================================
  // Updates any existing Child Projects section with links to all child projects
  // Domain filtering intentionally omitted here because parent/child relationships 
  // are always within the same domain. Add domainTags filter if that changes.
  // Called from: 
  // ===============================================================================================
  updateChildProjectsSection: async function(app, noteUUID) {
    const sectionHeading = "Child Projects";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const children = await this.getChildNotes(app, noteUUID);
    children.sort((a, b) => a.name.localeCompare(b.name));

    const childList = children.length
      ? children.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No child projects)_";

    await app.replaceNoteContent(noteUUID, childList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: children.length };
  }, //end updateChildProjectsSection

  // ===============================================================================================
  // Updates any existing Parent Projects section with links to all parent projects
  // Domain filtering intentionally omitted here because parent/child relationships 
  // are always within the same domain. Add domainTags filter if that changes.
  // Called from: 
  // ===============================================================================================
  updateParentProjectsSection: async function(app, noteUUID) {
    const sectionHeading = "Parent Projects";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const parents = await this.getParentNotes(app, noteUUID);
    parents.sort((a, b) => a.name.localeCompare(b.name));

    const parentList = parents.length
      ? parents.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No parent projects)_";

    await app.replaceNoteContent(noteUUID, parentList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: parents.length };
  }, // end updateParentProjectsSection

  // ===============================================================================================
  // Updates any existing Related Tasks section with links to all related tasks
  // Called from: 
  // ===============================================================================================
  updateRelatedTasksSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related Tasks";

    // 1. Find the section (don't add if it doesn't exist)
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // 2. Get the current note handle for backlinks
    const note = await app.notes.find(noteUUID);

    // 3. Get all open tasks from the current note
    const ownTasks = await app.getNoteTasks(noteUUID);

    // 4. Get backlinks (notes linking to this note)
    let backlinks = await note.backlinks();

    // 🔹 Domain + exclusion filtering for backlink notes
    if (domainTags.length > 0) {
      backlinks = backlinks.filter(bn => {
        const noteDomainTags = bn.tags.filter(t => t.startsWith("d/"));
        return (
          (noteDomainTags.length === 0 || domainTags.some(dt => noteDomainTags.includes(dt))) &&
          !bn.tags.includes("archive") &&
          !bn.tags.includes("exclude")
        );
      });
    } else {
      // Even if no domain filter, still exclude archive/exclude
      backlinks = backlinks.filter(bn =>
        !bn.tags.includes("archive") &&
        !bn.tags.includes("exclude")
      );
    }

    // 5. From those notes, get tasks referencing this note
    let referencedTasks = [];
    for (const bn of backlinks) {
      const tasks = await app.getNoteTasks(bn.uuid);
      const matchingTasks = tasks.filter(t =>
        t.content.includes(note.name) || t.content.includes(noteUUID)
      );
      referencedTasks.push(...matchingTasks);
    }

    // 6. Merge own tasks + referenced tasks, deduplicate by UUID
    const allTasks = [...ownTasks, ...referencedTasks];
    const uniqueTasks = Array.from(new Map(allTasks.map(t => [t.uuid, t])).values());

    // 7. Sort by score descending
    uniqueTasks.sort((a, b) => (b.score || 0) - (a.score || 0));

    // 8. Build markdown list with deadlines & uniquified footnotes
    let counter = 1;
    const taskLines = uniqueTasks.map(task => {
      let taskText = task.content.trim();

      if (task.deadline) {
        const deadlineStr = this.convertDeadlineToPacific(task.deadline);
        taskText = `(${deadlineStr}) ${taskText}`;
      }

      const { updatedContent, nextCounter } = this.uniquifyFootnotes(taskText, counter);
      counter = nextCounter;

      return `- ${updatedContent}`;
    });

    // 9. Replace section content
    await app.replaceNoteContent(noteUUID, taskLines.join("\n"), {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: uniqueTasks.length };
  }, // end updateRelatedTasksSection

  // ===============================================================================================
  // Updates any existing Related Vendors section with links to all related vendors
  // Called from: 
  // ===============================================================================================
  updateRelatedVendorsSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related Vendors";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const note = await app.notes.find(noteUUID);
    const noteIdTag = await this.getNoteIdTag(app, note);
    const noteIdValue = noteIdTag.split("/")[1];

    // Find vendor matches, with domain filtering & exclusions handled by helper
    const vendorMatches = await this.getFilteredNotes(app, `r/vendor/${noteIdValue}`, domainTags);

    const relatedVendors = vendorMatches.map(n => this.normalizeNoteHandle(n));
    relatedVendors.sort((a, b) => a.name.localeCompare(b.name));

    const vendorList = relatedVendors.length
      ? relatedVendors.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related vendors)_";

    await app.replaceNoteContent(noteUUID, vendorList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: relatedVendors.length };
  }, // end updateRelatedVendorsSection

  // ===============================================================================================
  // Updates any existing Related Projects section with links to all related projects
  // Called from: 
  // ===============================================================================================
  updateRelatedProjectsSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related Projects";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const note = await app.notes.find(noteUUID);
    const noteIdTag = await this.getNoteIdTag(app, note);
    const noteIdValue = noteIdTag.split("/")[1];

    // Get all notes tagged with "r" (unfiltered first)
    let rTaggedNotes = await this.getFilteredNotes(app, "r", domainTags);

    const allMatches = rTaggedNotes.filter(n =>
      n.tags.some(t => t.startsWith("r/") && t.endsWith(`/${noteIdValue}`))
    );
    const projectMatches = allMatches.filter(n =>
      n.tags.some(t => t.startsWith("project/"))
    );
    const filteredMatches = projectMatches.filter(n =>
      !n.tags.some(t =>
        t.startsWith(`r/parent/${noteIdValue}`) ||
        t.startsWith(`r/child/${noteIdValue}`)
      )
    );

    const md = await this.buildNestedProjectList(app, {
      baseNotes: filteredMatches,
      groupByStatus: "full",
      includeChildren: true,
      format: "standard"
    });

    await app.replaceNoteContent(noteUUID, md, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: filteredMatches.length };
  }, // end updateRelatedProjectsSection

  // ===============================================================================================
  // Updates any existing Related People section with links to all related people
  // Called from: 
  // ===============================================================================================
  updateRelatedPeopleSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related People";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const note = await app.notes.find(noteUUID);
    const peopleTags = note.tags.filter(t => t.startsWith("r/people/"));
    if (peopleTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related people)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    const relatedPeople = [];
    for (const tag of peopleTags) {
      const noteId = tag.split("/")[2];

      // Use new helper to get matches, filtered by domain/exclusions
      let matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);

      if (matches.length > 0) {
        relatedPeople.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    relatedPeople.sort((a, b) => a.name.localeCompare(b.name));

    const peopleList = relatedPeople.length
      ? relatedPeople.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related people)_";

    await app.replaceNoteContent(noteUUID, peopleList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: relatedPeople.length };
  }, // end updateRelatedPeopleSection

  // ===============================================================================================
  // Updates any existing Related References section with links to all related references
  // Called from: 
  // ===============================================================================================
  updateRelatedReferencesSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related References";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const note = await app.notes.find(noteUUID);
    const referenceTags = note.tags.filter(t => t.startsWith("r/reference/"));
    if (referenceTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related references)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    const relatedRefs = [];
    for (const tag of referenceTags) {
      const noteId = tag.split("/")[2];

      // Use new helper to get matches, filtered by domain/exclusions
      let matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);

      if (matches.length > 0) {
        relatedRefs.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    relatedRefs.sort((a, b) => a.name.localeCompare(b.name));

    const refList = relatedRefs.length
      ? relatedRefs.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related references)_";

    await app.replaceNoteContent(noteUUID, refList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: relatedRefs.length };
  }, // end updateRelatedReferencesSection

  // ===============================================================================================
  // Updates any existing Related Software section with links to all related software
  // Called from: 
  // ===============================================================================================
  updateRelatedSoftwareSection: async function(app, noteUUID, domainTags = []) {
    const sectionHeading = "Related Software";

    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    const note = await app.notes.find(noteUUID);
    const softwareTags = note.tags.filter(t => t.startsWith("r/software/"));
    if (softwareTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related software)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    const relatedSoftware = [];
    for (const tag of softwareTags) {
      const noteId = tag.split("/")[2];

      // Use new helper to get matches, filtered by domain/exclusions
      let matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);

      if (matches.length > 0) {
        relatedSoftware.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    relatedSoftware.sort((a, b) => a.name.localeCompare(b.name));

    const softwareList = relatedSoftware.length
      ? relatedSoftware.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related software)_";

    await app.replaceNoteContent(noteUUID, softwareList, {
      section: { heading: { text: sectionHeading } }
    });

    return { updated: true, count: relatedSoftware.length };
  }, // end updateRelatedSoftwareSection

// =================================================================================================
// =================================================================================================
//                                     Link Actions
// =================================================================================================
// =================================================================================================
  linkOption: {

    // =============================================================================================
    // Calls setNoteTags to manage tags on current note
    // =============================================================================================
    "Update Tags": async function(app, link) {
      const uuidMatch = link.href?.match(/\/notes\/([a-f0-9-]+)$/);
      if (!uuidMatch) {
        await app.alert("❌ Invalid note link.");
        return;
      }
      await this.setNoteTags(app, uuidMatch[1]);
    }, // end Set Note Tags
  }, // end linkOption


// =================================================================================================
// =================================================================================================
//                                     Note Actions
// =================================================================================================
// =================================================================================================
  noteOption: {

    // =============================================================================================
    // Calls setNoteTags to manage tags on current note
    // =============================================================================================
    "Update Tags": async function(app, noteUUID) {
      //await app.alert("Getting ready to call setNoteTags");
      await this.setNoteTags(app, noteUUID);
    }, //end Set Note Tags

    // =============================================================================================
    // Update Note
    // This function is the orchestrator for updating the current note in whatever ways are 
    // appropriate
    // =============================================================================================
    "Update Note": async function (app, noteUUID) {
      const plugin = this;
      const note = await app.notes.find(noteUUID);

      // Detect any domain tags (d/work, d/home, etc.)
      const domainTags = note.tags.filter(t => t.startsWith("d/"));

      let summary = { updatedSections: 0, totalItems: 0 };

      const isListNote = note.tags.some(t => t.startsWith("list/"));
      if (isListNote) {
        const listType = note.tags.find(t => t.startsWith("list/"));

        switch (listType) {
          case "list/project":
          case "list/software":
          case "list/people":
          case "list/reference":
          case "list/weekly-review":
            // Bracketed text flat mode updates, filtered by domain
            summary = await plugin.updateBracketedSections(app, note, listType, domainTags);
            break;

          case "list/related":
            // Run existing Related * section updates, filtered by domain
            summary = await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
            break;
        }
      } else {
        // Non-list note → only update Related sections, filtered by domain
        summary = await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
      }

      await app.alert(
        `✅ Update complete for "${note.name}"\n` +
        `Sections updated: ${summary.updatedSections}\n` +
        `Total items updated: ${summary.totalItems}`
      );
    }, // end Update Note

    // ===============================================================================================
    // Note option wrapper to run Tagging Cleanup manually
    // ===============================================================================================
    "Run Tagging Cleanup": async function (app, noteUUID) {
      await this.taggingCleanup(app);
    }, // End Run Tagging Cleanup

/*
    // ===============================================================================================
    // Test function to identify bug in iOS app.
    // ===============================================================================================
    "iOS Tag Update Test": async function(app, noteUUID) {
      // Get the current note
      const note = await app.notes.find(noteUUID);

      // Show starting tags for the note
      // This works in all versions
      await app.alert(`Starting tags: ${note.tags.join(", ")}`);

      // First update: remove a 'project/*' tag from the note
      // This works in web, desktop, and iOS versions
      const oldStatus = note.tags.find(t => t.startsWith("project/"));
      if (oldStatus) {
        await note.removeTag(oldStatus);
      }

      // Second update: add the project/active tag
      // This works in web and desktop, but silently fails in iOS
      // Note: This *does* work in Chrome/Webkit on iOS... it only fails in the native app
      await note.addTag("project/active");

      // Verify final tags on the note
      // This works in web and desktop, but this alert does not display in the iOS app
      // Note: This also works in  Chrome/Webkit on iOS and only fails in the native app
      const updatedNote = await app.notes.find(noteUUID);
      await app.alert(`Ending tags: ${updatedNote.tags.join(", ")}`);
    }, // end iOS Tag Update Test

    // ===============================================================================================
    // Test function to identify bug in iOS app
    // ===============================================================================================
    "Test Two Adds": async function (app, noteUUID) {
      // Get the current note
      const note = await app.notes.find(noteUUID);
      if (!note) {
        await app.alert("Note not found");
        return;
      }

      // Show starting tags for the note
      // This works in all versions
      await app.alert("Before: " + JSON.stringify(note.tags));

      // First add a test tag
      // This works in all versions
      await note.addTag("test/tag1");

      // Add a second test tag
      // This silently fails on the native iOS app, but works everywhere else
      await note.addTag("test/tag2");

      // This alert does not show on the native iOS app
      const updatedNote = await app.notes.find(noteUUID);
      await app.alert("After: " + JSON.stringify(updatedNote.tags));
    }, // end Test Two Adds
*/

    // ===============================================================================================
    // Collects deadline tasks to display on the daily jot
    // ===============================================================================================
    "Refresh Deadline Tasks": async function(app, noteUUID) {
      const plugin = this;

      const currentNote = await app.notes.find(noteUUID);
      if (!currentNote.tags || !currentNote.tags.includes("daily-jots")) {
        await app.alert("❌ This action only works in a Daily Jot note.");
        return;
      }

      const allTasks = await plugin.getAllTasks(app);

      const deadlineTasks = [];
      let footnoteCounter = 1;

      for (const task of allTasks) {
        if (!task.deadline) continue;

        const daysLeft = plugin.daysUntilDeadline(task.deadline);
        if (daysLeft <= 7) {
          const pacificDeadline = plugin.convertDeadlineToPacific(task.deadline);
          const { updatedContent, nextCounter } = plugin.uniquifyFootnotes(task.content, footnoteCounter);
          footnoteCounter = nextCounter;

          deadlineTasks.push({
            content: `(Due: ${pacificDeadline}) ${updatedContent}`,
            daysLeft
          });
        }
      }

      deadlineTasks.sort((a, b) => a.daysLeft - b.daysLeft);

      const md = deadlineTasks.length
        ? deadlineTasks.map(t => `- ${t.content}`).join("\n")
        : "_No deadline tasks in next 7 days_";

      await app.replaceNoteContent(
        noteUUID,
        md,
        { section: { heading: { text: "Deadline Tasks" } } }
      );
    } // end Refresh Deadline Tasks
  } // end noteOption
} // end plugin
