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
  // Extracts bracketed domain from note titles (e.g. "[work]" → "work")
  // Called from: Update Lists (to detect domains)
  // ===============================================================================================
  extractDomainFromTitle: function(title) {
    const match = title.match(/\[(.*?)\]$/);
    return match ? match[1].toLowerCase() : null;
  }, // end extractDomainFromTitle

  // ===============================================================================================
  // Returns allowed top-level tag prefixes for a given list note title
  // Called from: Update Lists (to limit types of note links to include in list notes)
  // ===============================================================================================
  getAllowedTagPrefixesForNoteTitle: function(title) {
    if (title.startsWith("People List")) return ["people"];
    if (title.startsWith("Reference List")) return ["reference"];
    if (title.startsWith("Software List")) return ["software"];
    if (title.startsWith("Horizons of Focus")) return ["project"]; // project notes only
    if (title.startsWith("Active Project List")) return ["project"];
    if (title.startsWith("Completed Project List")) return ["project"];
    if (title.startsWith("Canceled Project List")) return ["project"];
    return ["people", "reference", "software", "horizon"]; // fallback
  }, // end getAllowedTagPrefixesForNoteTitle


  // ===============================================================================================
  // Determines if a note is people/software for use in r/ tag lookups
  // Called from: Find Related Items
  // ===============================================================================================
  classifyNoteType: function(tags) {
    if (tags.some(tag => tag.startsWith("people"))) return "people";
    if (tags.some(tag => tag.startsWith("software"))) return "software";
    return "unknown";
  }, // end classifyNoteType

  // ===============================================================================================
  // Formats grouped projects into markdown list with optional fallback
  // Called from: Find Related Items
  // ===============================================================================================
  formatMarkdownList: function(title, projects) {
    if (projects.length === 0) return `- ${title}\n    - _No matching projects_`;
    return `- ${title}\n` + projects.map(p => `    - [${p.title}](${p.url})`).join("\n");
  }, // end formatMarkdownList

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
  // Loads all tasks from notes with a domain tag (e.g. d/work)
  // Called from: Find Related Items, Refresh Relevant Tasks
  // ===============================================================================================
  getAllTasksForTag: async function(app, tag, cache = {}) {
    if (cache[tag]) return cache[tag]; //return cached tasks if already loaded

    const noteHandles = await app.filterNotes({ tag });
    const tasks = [];
    for (const handle of noteHandles) {
      const noteTasks = await app.getNoteTasks({ uuid: handle.uuid });
      tasks.push(...noteTasks);
    }

    cache[tag] = tasks; //store result in cache
    return tasks;
  }, // end getAllTasksForTag

  // ===============================================================================================
  // Categorizes project notes by tag group (e.g. p/active, p/focus)
  // Called from: Find Related Items
  // ===============================================================================================
  categorizeProjectNotes: async function(app, noteHandles) {
    const categories = {
      "Focus Projects": [],
      "Active Projects": [],
      "Tracking Projects": [],
      "On Hold Projects": [],
      "Future Projects": [],
      "Someday Projects": [],
      "Completed Projects": [],
      "Canceled Projects": []
    };

    for (const handle of noteHandles) {
      const note = await app.notes.find(handle.uuid);
      if (!note) continue;
      const noteData = {
        title: note.name,
        url: `https://www.amplenote.com/notes/${note.uuid}`,
        modified: new Date(note.updated)
      };

      if (note.tags.includes("project/focus")) categories["Focus Projects"].push(noteData);
      else if (note.tags.includes("project/active")) categories["Active Projects"].push(noteData);
      else if (note.tags.includes("project/tracking")) categories["Tracking Projects"].push(noteData);
      else if (note.tags.includes("project/on-hold")) categories["On Hold Projects"].push(noteData);
      else if (note.tags.includes("project/future")) categories["Future Projects"].push(noteData);
      else if (note.tags.includes("project/someday")) categories["Someday Projects"].push(noteData);
      else if (note.tags.includes("project/completed")) categories["Completed Projects"].push(noteData);
      else if (note.tags.includes("project/canceled")) categories["Canceled Projects"].push(noteData);
    }

    Object.entries(categories).forEach(([title, list]) => {
      if (title === "Completed Projects" || title === "Canceled Projects") {
        list.sort((a, b) => b.modified - a.modified);
      } else {
        list.sort((a, b) => a.title.localeCompare(b.title));
      }
    });

    return categories;
  }, // end categorizeProjectNotes

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

// =================================================================================================
// =================================================================================================
//                                     List Update functions
// =================================================================================================
// =================================================================================================

  // ===============================================================================================
  // Updates any existing Child Projects section with links to all child projects
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
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: children.length };
  }, //end updateChildProjectsSection

  // ===============================================================================================
  // Updates any existing Parent Projects section with links to all parent projects
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
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: parents.length };
  }, // end updateParentProjectsSection

  // ===============================================================================================
  // Updates any existing Related Tasks section with links to all related tasks
  // Called from: 
  // ===============================================================================================
  updateRelatedTasksSection: async function(app, noteUUID) {
    const sectionHeading = "Related Tasks";

    // 1. Find the section (don't add if it doesn't exist)
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // 2. Get the current note handle for title-based backlink search
    const note = await app.notes.find(noteUUID);

    // 3. Get all open tasks from the current note
    const ownTasks = await app.getNoteTasks(note);

    // 4. Find other notes that reference this note (by UUID or title link)
    const backlinks = await app.filterNotes({ text: noteUUID }); // UUID search
    const backlinksByName = await app.filterNotes({ text: note.name }); // Title link search

    // Merge backlink lists
    const backlinkNotes = [...backlinks, ...backlinksByName]
      .filter(n => n.uuid !== noteUUID); // Exclude current note

    // 5. From those notes, get tasks referencing this note
    let referencedTasks = [];
    for (const bn of backlinkNotes) {
      const tasks = await app.getNoteTasks(bn);
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

      // Prepend deadline if present
      if (task.deadline) {
        const deadlineStr = this.convertDeadlineToPacific(task.deadline);
        taskText = `(${deadlineStr}) ${taskText}`;
      }

      // Uniquify footnotes (handles refs & defs in one pass)
      const { updatedContent, nextCounter } = this.uniquifyFootnotes(taskText, counter);
      counter = nextCounter;

      return `- ${updatedContent}`;
    });

    // 9. Replace section content
    await app.replaceNoteContent(noteUUID, taskLines.join("\n"), {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: uniqueTasks.length };
  }, // end updateRelatedTasksSection

  // ===============================================================================================
  // Updates any existing Related Vendors section with links to all related vendors
  // Called from: 
  // ===============================================================================================
  updateRelatedVendorsSection: async function(app, noteUUID) {
    const sectionHeading = "Related Vendors";

    // Get all sections for the note
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // Ensure the current note has a note-id
    const note = await app.notes.find(noteUUID);
    const noteIdTag = await this.getNoteIdTag(app, note);
    const noteIdValue = noteIdTag.split("/")[1];

    // Find all vendor notes that reference this note's ID
    const vendorMatches = await app.filterNotes({ tag: `r/vendor/${noteIdValue}` });

    // Normalize and sort
    const relatedVendors = vendorMatches.map(n => this.normalizeNoteHandle(n));
    relatedVendors.sort((a, b) => a.name.localeCompare(b.name));

    // Build markdown list
    const vendorList = relatedVendors.length
      ? relatedVendors.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related vendors)_";

    // Replace section content
    await app.replaceNoteContent(noteUUID, vendorList, {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: relatedVendors.length };
  }, // end updateRelatedVendorsSection

  // ===============================================================================================
  // Updates any existing Related Projects section with links to all related projects
  // Called from: 
  // ===============================================================================================
  updateRelatedProjectsSection: async function(app, noteUUID) {
    const sectionHeading = "Related Projects";

    // Get all sections for the note
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // Ensure the current note has a note-id
    const note = await app.notes.find(noteUUID);
    const noteIdTag = await this.getNoteIdTag(app, note); // returns existing or creates new
    const noteIdValue = noteIdTag.split("/")[1]; // the actual ID portion

    // Find all notes with a relationship to this note-id
    const allMatches = await app.filterNotes({ tag: `r/*/${noteIdValue}` });

    // Filter down to project notes only
    const projectMatches = allMatches.filter(n =>
      n.tags.some(t => t.startsWith("project/"))
    );

    // Remove matches that are parent/child relationships
    const filteredMatches = projectMatches.filter(n =>
      !n.tags.some(t =>
        t.startsWith(`r/parent/${noteIdValue}`) ||
        t.startsWith(`r/child/${noteIdValue}`)
      )
    );

    // Normalize and sort
    const relatedProjects = filteredMatches.map(n => this.normalizeNoteHandle(n));
    relatedProjects.sort((a, b) => a.name.localeCompare(b.name));

    // Build markdown list
    const projectList = relatedProjects.length
      ? relatedProjects.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related projects)_";

    // Replace section content
    await app.replaceNoteContent(noteUUID, projectList, {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: relatedProjects.length };
  }, // end updateRelatedProjectsSection

  // ===============================================================================================
  // Updates any existing Related People section with links to all related people
  // Called from: 
  // ===============================================================================================
  updateRelatedPeopleSection: async function(app, noteUUID) {
    const sectionHeading = "Related People";

    // Get all sections for the note
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // Find all r/people/* tags on the current note
    const note = await app.notes.find(noteUUID);
    const peopleTags = note.tags.filter(t => t.startsWith("r/people/"));
    if (peopleTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related people)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    // Get matching people notes by note-id
    const relatedPeople = [];
    for (const tag of peopleTags) {
      const noteId = tag.split("/")[2];
      const matches = await app.filterNotes({ tag: `note-id/${noteId}` });
      if (matches.length > 0) {
        relatedPeople.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    // Sort alphabetically
    relatedPeople.sort((a, b) => a.name.localeCompare(b.name));

    // Build markdown list
    const peopleList = relatedPeople.length
      ? relatedPeople.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related people)_";

    // Replace section content
    await app.replaceNoteContent(noteUUID, peopleList, {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: relatedPeople.length };
  }, // end updateRelatedPeopleSection

  // ===============================================================================================
  // Updates any existing Related References section with links to all related references
  // Called from: 
  // ===============================================================================================
  updateRelatedReferencesSection: async function(app, noteUUID) {
    const sectionHeading = "Related References";

    // Get all sections for the note
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // Find all r/reference/* tags on the current note
    const note = await app.notes.find(noteUUID);
    const referenceTags = note.tags.filter(t => t.startsWith("r/reference/"));
    if (referenceTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related references)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    // Get matching reference notes by note-id
    const relatedRefs = [];
    for (const tag of referenceTags) {
      const noteId = tag.split("/")[2];
      const matches = await app.filterNotes({ tag: `note-id/${noteId}` });
      if (matches.length > 0) {
        relatedRefs.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    // Sort alphabetically
    relatedRefs.sort((a, b) => a.name.localeCompare(b.name));

    // Build markdown list
    const refList = relatedRefs.length
      ? relatedRefs.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related references)_";

    // Replace section content
    await app.replaceNoteContent(noteUUID, refList, {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
    });

    return { updated: true, count: relatedRefs.length };
  }, // end updateRelatedReferencesSection

  // ===============================================================================================
  // Updates any existing Related Software section with links to all related software
  // Called from: 
  // ===============================================================================================
  updateRelatedSoftwareSection: async function(app, noteUUID) {
    const sectionHeading = "Related Software";

    // Get all sections for the note
    const sections = await app.getNoteSections({ uuid: noteUUID });
    const targetSection = sections.find(s =>
      s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase()
    );
    if (!targetSection) return { updated: false, count: 0 };

    // Find all r/software/* tags on the current note
    const note = await app.notes.find(noteUUID);
    const softwareTags = note.tags.filter(t => t.startsWith("r/software/"));
    if (softwareTags.length === 0) {
      await app.replaceNoteContent(noteUUID, "_(No related software)_", {
        section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
      });
      return { updated: true, count: 0 };
    }

    // Get matching software notes by note-id
    const relatedSoftware = [];
    for (const tag of softwareTags) {
      const noteId = tag.split("/")[2];
      const matches = await app.filterNotes({ tag: `note-id/${noteId}` });
      if (matches.length > 0) {
        relatedSoftware.push(this.normalizeNoteHandle(matches[0]));
      }
    }

    // Sort alphabetically
    relatedSoftware.sort((a, b) => a.name.localeCompare(b.name));

    // Build markdown list
    const softwareList = relatedSoftware.length
      ? relatedSoftware.map(n => `- [${n.name}](${n.url})`).join("\n")
      : "_(No related software)_";

    // Replace section content
    await app.replaceNoteContent(noteUUID, softwareList, {
      section: { heading: { text: sectionHeading, index: targetSection.heading.index } }
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
    "Update Note": async function(app, noteUUID) {
    const plugin = this;
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

      const results = [];
      for (const { name, fn } of staticSections) {
        const result = await fn.call(this, app, noteUUID);
        if (result.updated) {
          results.push(`✅ ${name}: ${result.count} item(s)`);
        }
      }

      const summary = results.length
        ? results.join("\n")
        : "No sections updated.";
      await app.alert(summary);
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
