{
// =================================================================================================
// =================================================================================================
//                                     Utility Functions
// =================================================================================================
// =================================================================================================

  // ===============================================================================================
  // Escapes square brackets from titles for literal matching in markdown links
  // Called from: Find Related Items, used to escape brackets in task content comparisons
  // ===============================================================================================
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
  // Returns notes matching a given base tag, filtered by optional domain tags,
  // excluding any notes tagged with 'archive' or 'exclude'.
  // Called from anywhere instead of app.filterNotes to apply consistent exclusions.
  // ===============================================================================================
  getFilteredNotes: async function (app, baseTag, domainTags = []) {
    let notes = await app.filterNotes({ tag: baseTag + ",^archive,^exclude" });

    if (domainTags.length > 0) {
      notes = notes.filter(n => {
        const noteDomainTags = n.tags.filter(t => t.startsWith("d/"));
        return noteDomainTags.length === 0 || domainTags.some(dt => noteDomainTags.includes(dt));
      });
    }

    return notes;
  }, // end getFilteredNotes


  // ===============================================================================================
  // Helper function to build a list of project notes. Paremeters allow for different formats:
  // - groupByStatus: 
  // -- "full" means a bulleted list with statuses as top-level bullets
  // -- "flat" means a list of projects without top-level status bullets (for [bracketed text] lists)
  // -- "none" means a list of all projects with no grouping
  // - includeChildren:
  // -- "true" means that children will be nested under parents
  // -- "false" means that children will be listed as standalone projects
  // - format:
  // -- "standard" means just lists of projects
  // -- "weeklyReview" means additional metadata about each project listed as sub-bullets
  // - sortCompletedByDate:
  // -- "true" means that completed projects will be sorted by date desc (based on subtag) instead of alphabetically
  // -- "false" means that completed projects will be sorted alphabetically
  // ===============================================================================================
  buildNestedProjectList: async function(app, {
    baseNotes,
    groupByStatus = "full", // "full" or "flat" (we'll leave "none" for later if needed)
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

    // Track displayed projects to avoid duplicates
    const displayed = new Set();

    // Recursive child renderer
    const getChildMarkdown = async (parentUUID, indentLevel) => {
      const parentNote = await app.notes.find(parentUUID);
      const parentNoteIdTag = await this.getNoteIdTag(app, parentNote);
      const parentNoteIdValue = parentNoteIdTag.split("/")[1];

      const related = await this.getFilteredNotes(app, `r/parent/${parentNoteIdValue}`);

      const children = related
        .filter(n => n.tags.some(t => t.startsWith("project/")))
        .map(n => ({ handle: this.normalizeNoteHandle(n), uuid: n.uuid }))
        .sort((a, b) => a.handle.name.localeCompare(b.handle.name));

      let md = "";
      for (const child of children) {
        if (displayed.has(child.uuid)) continue;
        displayed.add(child.uuid);
        md += `${"    ".repeat(indentLevel)}- [${child.handle.name}](${child.handle.url})\n\n`;
        md += await getChildMarkdown(child.uuid, indentLevel + 1);
      }
      return md;
    };

    let md = "";

    if (groupByStatus === "full") {
      // Group projects by status
      const grouped = {};
      for (const status of projectStatuses) {
        grouped[status.tag] = [];
      }

      for (const proj of baseNotes) {
        const handle = this.normalizeNoteHandle(proj);
        const statusTag = proj.tags.find(t => t.startsWith("project/"));
        if (grouped[statusTag]) {
          grouped[statusTag].push({ handle, uuid: proj.uuid, tags: proj.tags });
        }
      }

      for (const status of projectStatuses) {
        md += `- ${status.label}\n\n`;
        if (grouped[status.tag].length > 0) {
          grouped[status.tag].sort((a, b) => a.handle.name.localeCompare(b.handle.name));
          for (const { handle, uuid } of grouped[status.tag]) {
            if (displayed.has(uuid)) continue;
            displayed.add(uuid);
            md += `    - [${handle.name}](${handle.url})\n\n`;
            if (includeChildren) {
              md += await getChildMarkdown(uuid, 2);
            }
          }
        } else {
          md += `    - *No matching projects*\n\n`;
        }
      }

    } else if (groupByStatus === "flat") {
      // Just output the list, no top-level status headings
      const sorted = baseNotes
        .map(n => ({ handle: this.normalizeNoteHandle(n), uuid: n.uuid }))
        .sort((a, b) => a.handle.name.localeCompare(b.handle.name));

      for (const { handle, uuid } of sorted) {
        if (displayed.has(uuid)) continue;
        displayed.add(uuid);
        md += `- [${handle.name}](${handle.url})\n\n`;
        if (includeChildren) {
          md += await getChildMarkdown(uuid, 1);
        }
      }
    }

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
  // Verifies top level type tags (domain, project, reference) are in place and 
  // uses app.prompt to fix if needed
  // Called from: 
  // ===============================================================================================
  ensureDomainAndTypeTags: async function (app, noteUUID) {
    const note = await app.notes.find(noteUUID);
    const existingTags = note.tags || [];

    // Check if we already have at least one domain tag
    const hasDomain = existingTags.some(tag => tag.startsWith("d/"));
    // Check if we already have a top-level type tag (project/* or reference/*)
    const hasType = existingTags.some(tag => tag.startsWith("project/") || tag.startsWith("reference/"));

    // If both are present, nothing to do
    if (hasDomain && hasType) return;

    // Build prompt inputs dynamically based on what's missing
    const inputs = [];

    if (!hasDomain) {
      inputs.push({
        label: "Select domain tag(s)",
        type: "tags",
        limit: 2, // Allow d/home and/or d/work
        placeholder: "Pick d/home, d/work, or both"
      });
    }

    if (!hasType) {
      inputs.push({
        label: "Select top-level type tag",
        type: "tags",
        limit: 1, // Only one type tag allowed
        placeholder: "Pick a project/* or reference/* tag"
      });
    }

    if (inputs.length === 0) return; // Safety

    const result = await app.prompt("Add missing tags for this note", { inputs });
    if (!result) return; // User canceled

    // result will be an array matching `inputs` order
    let idx = 0;
    if (!hasDomain) {
      const domainTags = result[idx++];
      if (domainTags) {
        for (const tag of domainTags.split(",")) {
          await note.addTag(tag.trim());
        }
      }
    }

    if (!hasType) {
      const typeTag = result[idx++];
      if (typeTag) {
        await note.addTag(typeTag.trim());
      }
    }
  }, // end ensureDomainAndTypeTags

  // ===============================================================================================
  // Uses app.prompt to help create relationships based on note-id
  // Called from: either noteOption or linkOption
  // ===============================================================================================
  createRelationship: async function (app, noteUUID) {
    // Step 1: Ensure domain and type tags before any relationship prompts
    await this.ensureDomainAndTypeTags(app, noteUUID);

    const note = await app.notes.find(noteUUID);

    // Step 2: Ask for relationship type + related note in one prompt
    const result = await app.prompt("Create a relationship", {
      inputs: [
        {
          label: "Select a relationship type",
          type: "select",
          options: [
            { label: "Parent Project", value: "parent" },
            { label: "Child Project", value: "child" },
            { label: "Related Person", value: "person" },
            { label: "Related Software", value: "software" },
            { label: "Related Reference", value: "reference" },
            { label: "Related Vendor", value: "vendor" }
          ]
        },
        {
          label: "Select related note",
          type: "note" // lets user pick any note
        }
      ],
      actions: [
        { label: "Add Another", value: "add" },
        { label: "Done", value: "done" }
      ]
    });

    if (!result) return; // user canceled

    const [relType, relatedNote, action] = result;

    // Step 3: Validate relationship type vs. selected note type if needed
    // (Example validation logic placeholder)
    const valid = await this.validateRelationshipType(app, relatedNote, relType);
    if (!valid) {
      await app.alert(`The selected note is not valid for a "${relType}" relationship.`);
      return;
    }

    // Step 4: Apply relationship
    if (relType === "parent" || relType === "child") {
      await this.setParentChildRelationship(app, note, relatedNote, relType);
    } else {
      const noteIdTag = await this.getNoteIdTag(app, relatedNote);
      await note.addTag(`r/${relType}/${noteIdTag}`);
    }

    // Step 5: Repeat if user chose Add Another
    if (action === "add") {
      await this.createRelationship(app, noteUUID);
    }
  }, // end createRelationship

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
    const parentProjects = allNotes.filter(n => n.tags.some(t => t.startsWith("r/parent/")));
    const noChildren = [];
    for (const parent of parentProjects) {
      const children = await plugin.getChildNotes(app, parent.uuid);
      if (children.length === 0) noChildren.push(parent);
    }
    if (noChildren.length > 0) {
      cleanupResults.push({ reason: "Parent projects with no child projects", notes: noChildren });
    }

    // F: Child projects with no parent project
    const childProjects = allNotes.filter(n => n.tags.some(t => t.startsWith("r/child/")));
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

      // Get all notes with the base tag
      //let matchingNotes = await app.filterNotes({ tag: baseTag });
      let matchingNotes = await this.getFilteredNotes(app, baseTag, domainTags);

      // Apply domain filter: include notes with matching domain OR no domain tag
      if (domainTags.length > 0) {
        const domainTag = domainTags[0];
        matchingNotes = matchingNotes.filter(n => {
          const noteDomainTags = n.tags.filter(t => t.startsWith("d/"));
          return (
            noteDomainTags.length === 0 || // no domain tag → include
            noteDomainTags.includes(domainTag) // matches current domain → include
          );
        });
      }

      // Build flat list with children
      const md = await plugin.buildNestedProjectList(app, {
        baseNotes: matchingNotes,
        groupByStatus: "flat",
        includeChildren: true,
        format: "standard"
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
    // Uses app.prompt to update project tags (deprecated)
    // =============================================================================================
/*
    "Update Project Tags": async function(app, link) {
      const plugin = this;

      // Step 1: Extract UUID from the link href
      const uuidMatch = link.href?.match(/\/notes\/([a-f0-9-]+)$/);
      if (!uuidMatch) {
        await app.alert("Invalid note link.");
        return;
      }
      const noteUUID = uuidMatch[1];

      // Step 2: Load the note
      const note = await app.notes.find(noteUUID);
      if (!note) {
        await app.alert("Note not found.");
        return;
      }

      // Step 3: Validate that it’s a project (has a project/* tag)
      const currentStatusTag = note.tags.find(tag => tag.startsWith("project/"));
      if (!currentStatusTag) {
        await app.alert("This note isn't tagged as a project (missing project/* tag).");
        return;
      }

      // Step 4: Get current d/* tag (domain)
      const currentDomainTag = note.tags.find(tag => tag.startsWith("d/")) || "d/work"; // fallback default

      // Step 5: Show prompt with current values preselected
      const response = await app.prompt(
        `Update tags for project:\n${note.name}`,
        {
          inputs: [
            {
              label: "Domain",
              type: "radio",
              value: currentDomainTag,
              options: [
                { label: "Work", value: "d/work" },
                { label: "Home", value: "d/home" }
              ]
            },
            {
              label: "Project Status",
              type: "radio",
              value: currentStatusTag,
              options: [
                { label: "Focus", value: "project/focus" },
                { label: "Active", value: "project/active" },
                { label: "On Hold", value: "project/on-hold" },
                { label: "Tracking", value: "project/tracking" },
                { label: "Future", value: "project/future" },
                { label: "Someday", value: "project/someday" },
                { label: "Completed", value: "project/completed" },
                { label: "Canceled", value: "project/canceled" }
              ]
            }
          ]
        }
      );

      if (!response) {
        await app.alert("Cancelled.");
        return;
      }

      const [domainTag, statusTag] = response;

      // Step 6: Remove any existing d/* and project/* tags
      for (const tag of note.tags) {
        if (tag.startsWith("d/") || tag.startsWith("project/")) {
          await note.removeTag(tag);
        }
      }

      // Step 7: Add new ones
      await note.addTag(domainTag);
      await note.addTag(statusTag);

      // Update the current list
      await plugin["Update Current List"](app, app.context.noteUUID);

      // await app.alert(`Tags updated:\n- ${domainTag}\n- ${statusTag}`);
    }
*/
  }, // End Update Project Tags


// =================================================================================================
// =================================================================================================
//                                     Note Actions
// =================================================================================================
// =================================================================================================
  noteOption: {

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

    // =============================================================================================
    // Set Parent
    // This function is a placeholder for testing parent child relationships
    // =============================================================================================
    "Set Parent": async function(app, noteUUID) {
    const plugin = this;

    const result = await app.prompt("Select the parent note:", {
        inputs: [
          {
            label: "Parent Note",
            type: "note"
          }
        ]
      });

      if (!result) return; // user cancelled

      // When only one input is given, result will be the value itself (not an array)
      const parentHandle = result;

      if (!parentHandle || !parentHandle.uuid) {
        await app.alert("No note selected.");
        return;
      }

      try {
        await plugin.setParentChildRelationship(app, noteUUID, parentHandle.uuid);
        await app.alert("Parent/child relationship established.");
      } catch (err) {
        await app.alert(`Error: ${err.message}`);
      }
    }, // End Set Parent

    // =============================================================================================
    // Get note-id
    // This function returns the current note's note-id (and sets one if it doesn't exist yet)
    // =============================================================================================
    "Get note-id": async function (app, noteUUID) {
      const plugin = this;

      // Step 1: Get the current note
      const note = await app.notes.find(noteUUID);
      if (!note) {
        await app.alert("❌ Could not find the note.");
        return;
      }

      // Step 2: Get or create the note-id tag
      const noteIdTag = await plugin.getNoteIdTag(app, note);

      // Step 3: Show the result
      await app.alert(`Note ID for "${note.name}":\n${noteIdTag.replace("note-id/", "")}`);
    },  // end Get note-id

    // ===============================================================================================
    // Note option wrapper to run Tagging Cleanup manually
    // ===============================================================================================
      "Run Tagging Cleanup": async function (app, noteUUID) {
        await this.taggingCleanup(app);
      }, // End Run Tagging Cleanup

    // =============================================================================================
    // Testing
    // This function is a placeholder for unit testing global functions or any other testing
    // =============================================================================================
    "Testing": async function(app, noteUUID) {
    const plugin = this;

    // Get parent notes
    const parents = await this.getParentNotes(app, noteUUID);
    const parentList = parents.length
      ? parents.map(n => `- **${n.name}**`).join("\n")
      : "_(No parents)_";

    // Get child notes
    const children = await this.getChildNotes(app, noteUUID);
    const childList = children.length
      ? children.map(n => `- **${n.name}**`).join("\n")
      : "_(No children)_";

    // Show results in markdown
    const md = `**Parents:**\n${parentList}\n\n**Children:**\n${childList}`;
    await app.alert(md);
    } // End Testing
  }
}
