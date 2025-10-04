(() => {
  const plugin = {
    //#region Utility Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                                     Utility Functions
    //
    // #################################################################################################
    // #################################################################################################

    // ===============================================================================================
    // Converts a deadline timestamp into Pacific date string
    // Called from: Refresh Deadline Tasks, updateRelatedTasksSection
    // ===============================================================================================
    convertDeadlineToPacific: function (deadlineTimestamp) {
      if (!deadlineTimestamp) return null;
      return new Date(deadlineTimestamp * 1000).toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }, // end convertDeadlineToPacific

    // ===============================================================================================
    // Returns days until deadline
    // Called from: Refresh Deadline Tasks
    // ===============================================================================================
    daysUntilDeadline: function (deadlineTimestamp) {
      if (!deadlineTimestamp) return null;
      return (deadlineTimestamp * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
    }, // end daysUntilDeadline

    // ===============================================================================================
    // Ensures footnote references are uniquely numbered to avoid clashes
    // Called from: Refresh Deadline Tasks, updateRelatedTasksSection
    // ===============================================================================================
    uniquifyFootnotes: function (content, counterStart) {
      let counter = counterStart;
      const refRegex = /\[\^([^\]\s]+?)\]/g;
      const defRegex = /^\[\^([^\]\s]+?)\]:/gm;
      const labelMap = {};

      const updatedContent = content
        .replace(refRegex, (match, label) => {
          if (!labelMap[label]) labelMap[label] = `fn${counter++}`;
          return `[^${labelMap[label]}]`;
        })
        .replace(defRegex, (match, label) => {
          return labelMap[label] ? `[^${labelMap[label]}]:` : match;
        });

      return { updatedContent, nextCounter: counter };
    }, // end uniquifyFootnotes

    // ===============================================================================================
    // Returns a copy of the given note handle with a .url property added.
    // Preserves all original metadata provided by Amplenote (created, updated, tags, etc.).
    // ===============================================================================================
    normalizeNoteHandle: function (note) {
      return {
        ...note,
        url: `https://www.amplenote.com/notes/${note.uuid}`,
      };
    }, // end normalizeNoteHandle

    // ===============================================================================================
    // Determines note type
    // Called from:
    // ===============================================================================================
    getNoteType: function (note) {
      // Priorities: list/*, project/*, reference/subtype, plain single-word types
      const tag = note.tags.find(
        (t) =>
          t.startsWith('list/') ||
          t.startsWith('project/') ||
          t.startsWith('reference/') ||
          ['people', 'software', 'vendor', 'horizon'].includes(t),
      );
      if (!tag) return null;

      if (tag.startsWith('project/')) {
        return 'project';
      }

      if (tag.startsWith('reference/')) {
        const subtype = tag.split('/')[1];
        if (['people', 'software', 'vendor', 'horizon'].includes(subtype)) {
          return subtype; // drop the "reference/" for r/ tags
        }
      }
      return tag;
    }, // end getNoteType

    // ===============================================================================================
    // Normalizes indentation for sub-bullets for Recent Updates using four spaces per indent
    // Called from: updateRecentUpdatesSection
    // ===============================================================================================
    normalizeIndentationForSubtree: function (markdown, indentSpaces = 4) {
      // 4 spaces per bullet
      // split the input markdown by line
      const lines = markdown.split('\n');
      // Variable to hold return value
      const normalizedLines = [];
      // Variable to track footnote blocks
      let inFootnoteBlock = false;

      // Step 1: Find minimum indent (ignore footnotes, blank, etc.)
      const contentLines = lines.filter((line) => line.trim() !== '' && !line.match(/^\[\^.+?\]:/));
      const minIndentSpaces =
        contentLines.length > 0
          ? Math.min(...contentLines.map((line) => line.match(/^ */)[0].length))
          : 0;

      const shiftLeftBy = Math.max(0, minIndentSpaces - indentSpaces);

      // Step 2: Normalize all lines, correctly skipping any lines in a footnote definition
      for (const line of lines) {
        const isFootnoteDef = line.match(/^\[\^.+?\]:/);
        const isBlank = line.trim() === '';

        // if this line is the start of a footnote definition, push it as is and
        // note that the footnote block has started
        if (isFootnoteDef) {
          inFootnoteBlock = true;
          normalizedLines.push(line); // leave as-is
          continue;
        }

        // If footnote block ends (non-blank, non-indented line), exit mode
        if (inFootnoteBlock && !isBlank && !line.startsWith('    ')) {
          inFootnoteBlock = false;
        }

        if (inFootnoteBlock || isBlank) {
          normalizedLines.push(line); // don't touch footnotes or blank lines
        } else {
          normalizedLines.push(line.slice(shiftLeftBy)); //shift each line equally
        }
      }
      return normalizedLines.join('\n');
    }, // end normalizeIndentationForSubtree

    // ===============================================================================================
    // Strips indentation comments from backlinked markdown so they don't mess with indentation
    // Called from: updateRecentUpdatesSection
    // ===============================================================================================
    stripAmplenoteIndentComments: function (markdown) {
      return markdown.replace(/<!--\s*\{["']?indent["']?:\s*\d+\s*\}\s*-->/g, '');
    }, // end stripAmplenoteIndentComments
    //#endregion

    //#region Note Filtering and Retrieval Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                                Note Filtering and Retrieval Functions
    //
    // #################################################################################################
    // #################################################################################################

    // ===============================================================================================
    // Returns notes matching an optional given base tag, filtered by optional domain tags,
    // excluding any notes tagged with 'archive' or 'exclude'.
    // Called from anywhere instead of app.filterNotes to apply consistent exclusions
    // Calls: app.filterNotes
    // Called from: getAllTasks, buildNestedNoteList, buildNestedProjectList, buildNestedReferenceList,
    // updateBracketedSections, updateRelated* functions, generateUniqueNoteIdTag
    // ===============================================================================================
    getFilteredNotes: async function (app, baseTag = '', domainTags = []) {
      let query = baseTag ? `${baseTag},^archive,^exclude` : '^archive,^exclude';
      let notes = await app.filterNotes({ tag: query });

      if (domainTags.length > 0) {
        notes = notes.filter((n) => {
          const noteDomainTags = n.tags.filter((t) => t.startsWith('d/'));
          return (
            noteDomainTags.length === 0 || domainTags.some((dt) => noteDomainTags.includes(dt))
          );
        });
      }
      return notes;
    }, // end getFilteredNotes

    // ===============================================================================================
    // Returns all tasks matching an optional given base tag, filtered by optional domain tags,
    // excluding any tasks on notes tagged with 'archive' or 'exclude' (due to getFilteredNotes).
    // Called from anywhere tasks are needed to apply consistent exclusions.
    // Calls: getFilteredNotes, app.notes.find, note.tasks
    // Called from: Refresh Deadline Tasks
    // ===============================================================================================
    getAllTasks: async function (app, baseTag = '', domainTags = []) {
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
    // Returns an array of parent notes for the given noteUUID.
    // Looks for r/parent/* tags on the note and fetches each parent note.
    // ===============================================================================================
    getParentNotes: async function (app, noteUUID) {
      const note = await app.notes.find(noteUUID);
      if (!note) throw new Error('Note not found.');

      const parentTags = note.tags.filter((t) => t.startsWith('r/parent/'));
      if (parentTags.length === 0) return [];

      // Extract note-id portion
      const parentIds = parentTags.map((t) => t.split('/')[2]);

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
      if (!note) throw new Error('Note not found.');

      const childTags = note.tags.filter((t) => t.startsWith('r/child/'));
      if (childTags.length === 0) return [];

      const childIds = childTags.map((t) => t.split('/')[2]);

      const children = [];
      for (const cid of childIds) {
        const matches = await app.filterNotes({ tag: `note-id/${cid}` });
        if (matches.length > 0) children.push(this.normalizeNoteHandle(matches[0]));
      }
      return children;
    }, // end getChildNotes
    //#endregion

    //#region Note ID & Relationship Management Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                             Note ID & Relationship Management Functions
    //
    // #################################################################################################
    // #################################################################################################

    // ===============================================================================================
    // Generates a unique note ID for tagging notes, based on the note's create timestamp.
    // Uses a regex to pull just numbers from the ISO 8601 datestamp and then checks to see if
    // there's a note-id collision (two notes created in the same second). If a collision is
    // detected, add a counter value and recheck until a unique value is found.
    // Called from:
    // ===============================================================================================
    generateUniqueNoteIdTag: async function (app, note) {
      // Use regex to extract YYYYMMDDHHMMSS from ISO 8601 string
      const match = note.created.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (!match) {
        throw new Error('Invalid note.created format');
      }

      const [, year, month, day, hour, minute, second] = match;
      const baseId = `${year}${month}${day}${hour}${minute}${second}`;
      let candidate = `note-id/${baseId}`;
      let counter = 1;

      // Loop to ensure uniqueness (if note-id/20250726141507 already exists)
      while ((await app.filterNotes({ tag: candidate })).some((n) => n.uuid !== note.uuid)) {
        candidate = `note-id/${baseId}-${counter++}`;
      }

      return candidate;
    }, // end generateUniqueNoteIdTag

    // ===============================================================================================
    // Returns a note's note-id tag if it exists, creating it if necessary. This function is only
    // called if a relationship needs to be established between two notes.
    // Called from:
    // ===============================================================================================
    getNoteIdTag: async function (app, note) {
      // Return existing note-id/* if present
      const existing = note.tags.find((t) => t.startsWith('note-id/'));
      if (existing) return existing;

      // Use your existing generator from v2 (already robust)
      // We call through “this” so it can live alongside your helpers
      const noteHandle = await app.findNote({ uuid: note.uuid }); // fills created/title/tags
      const tag = await this.generateUniqueNoteIdTag(app, noteHandle);
      const added = await note.addTag(tag); // returns boolean
      if (!added) throw new Error('Could not add note-id tag');
      return tag;
    }, // end getNoteIdTag

    // ===============================================================================================
    // Establishes a parent/child relationship between two notes.
    // Ensures both notes have a note-id tag, and confirms both notes are of the same type.
    // Supported types: project, reference/people, reference/software, reference/horizon
    // ===============================================================================================
    setParentChildRelationship: async function (app, childUUID, parentUUID) {
      const plugin = this;

      // 1. Load notes
      const child = await app.notes.find(childUUID);
      const parent = await app.notes.find(parentUUID);
      if (!child || !parent) {
        await app.alert('❌ Could not find parent or child note.');
        return;
      }

      // 2. Get note types
      const childType = plugin.getNoteType(child);
      const parentType = plugin.getNoteType(parent);

      // 3. Enforce type matching
      if (childType !== parentType) {
        await app.alert(
          `❌ Cannot link ${child.name} to ${parent.name}: note types do not match.\n\n` +
            `• Child is type: ${childType || 'unknown'}\n` +
            `• Parent is type: ${parentType || 'unknown'}\n\n` +
            `Parent/child relationships must be between notes of the same type.`,
        );
        return;
      }

      // 4. Ensure both have note-id tags
      const childIdTag = await plugin.getNoteIdTag(app, child);
      const childId = childIdTag.split('/')[1];
      const parentIdTag = await plugin.getNoteIdTag(app, parent);
      const parentId = parentIdTag.split('/')[1];

      // 5. Add tags for parent/child relationship
      await child.addTag(`r/parent/${parentId}`);
      await parent.addTag(`r/child/${childId}`);
    }, // end setParentChildRelationship

    // ===============================================================
    // Helper: Get readable relationships for dropdown
    // ===============================================================
    getReadableRelationships: async function (app, note) {
      const plugin = this;
      const results = [];

      // === Parent relationships ===
      const parents = await plugin.getParentNotes(app, note.uuid);
      parents.forEach((p) =>
        results.push({ type: 'parent', uuid: p.uuid, label: `(Parent) ${p.name}` }),
      );

      // === Child relationships ===
      const children = await plugin.getChildNotes(app, note.uuid);
      children.forEach((c) =>
        results.push({ type: 'child', uuid: c.uuid, label: `(Child) ${c.name}` }),
      );

      // === Direct r/* relationships from this note (excluding parent/child) ===
      const directRTags = note.tags.filter(
        (t) => t.startsWith('r/') && !t.startsWith('r/parent/') && !t.startsWith('r/child/'),
      );

      for (const tag of directRTags) {
        const parts = tag.split('/');
        if (parts.length < 3) continue; // malformed tag

        const noteId = parts[parts.length - 1];
        const type = parts.slice(1, -1).join('/'); // everything between r/ and note-id

        const matches = await app.filterNotes({ tag: `note-id/${noteId}` });
        if (matches.length > 0) {
          const handle = plugin.normalizeNoteHandle(matches[0]);
          // Avoid duplicates
          if (!results.some((r) => r.uuid === handle.uuid)) {
            results.push({ type, uuid: handle.uuid, label: handle.name });
          }
        }
      }

      // === Reverse lookup: find notes pointing to this one ===
      const noteIdTag = await plugin.getNoteIdTag(app, note);
      const noteIdValue = noteIdTag.split('/')[1];

      let allNotes = await app.filterNotes({ tag: '^archive,^exclude' });
      const relatedNotes = allNotes.filter((n) =>
        n.tags.some((t) => t.startsWith('r/') && t.endsWith(`/${noteIdValue}`)),
      );

      for (const rel of relatedNotes) {
        if (parents.some((p) => p.uuid === rel.uuid) || children.some((c) => c.uuid === rel.uuid))
          continue;
        if (!results.some((r) => r.uuid === rel.uuid)) {
          results.push({ type: 'other', uuid: rel.uuid, label: rel.name });
        }
      }

      return results;
    }, // end getReadableRelationships

    // ===============================================================
    // Helper: Add relationship with same rules as buildRelationship
    // ===============================================================
    addRelationshipByType: async function (app, note, relatedHandle) {
      const plugin = this;
      const relatedNote = await app.notes.find(relatedHandle.uuid);

      const noteType = plugin.getNoteType(note);
      const relatedType = plugin.getNoteType(relatedNote);

      // 🚫 Prevent adding two-way relationship between two projects
      if (noteType.startsWith('project/') && relatedType.startsWith('project/')) {
        await app.alert('❌ Project-to-project relationships must be set as Parent/Child.');
        return;
      }

      const noteIdTag = await plugin.getNoteIdTag(app, note);
      const relatedNoteIdTag = await plugin.getNoteIdTag(app, relatedNote);

      const noteId = noteIdTag.split('/')[1];
      const relatedNoteId = relatedNoteIdTag.split('/')[1];

      if (noteType.startsWith('project/')) {
        await note.addTag(`r/${relatedType}/${relatedNoteId}`);
      } else if (relatedType.startsWith('project/')) {
        await relatedNote.addTag(`r/${noteType}/${noteId}`);
      } else {
        await note.addTag(`r/${relatedType}/${relatedNoteId}`);
        await relatedNote.addTag(`r/${noteType}/${noteId}`);
      }
    }, // end addRelationshipByType

    // ===============================================================
    // Helper: Remove relationship cleanly
    // ===============================================================
    removeRelationship: async function (app, note, relation) {
      const plugin = this;
      const target = await app.notes.find(relation.uuid);
      if (!target) return;

      const noteIdTag = await plugin.getNoteIdTag(app, note);
      const targetIdTag = await plugin.getNoteIdTag(app, target);
      const noteId = noteIdTag.split('/')[1];
      const targetId = targetIdTag.split('/')[1];

      if (relation.type === 'parent') {
        await note.removeTag(`r/parent/${targetId}`);
        await target.removeTag(`r/child/${noteId}`);
      } else if (relation.type === 'child') {
        await note.removeTag(`r/child/${targetId}`);
        await target.removeTag(`r/parent/${noteId}`);
      } else {
        // Remove from both sides if both have the tag
        await note.removeTag(`r/${plugin.getNoteType(target)}/${targetId}`);
        await target.removeTag(`r/${plugin.getNoteType(note)}/${noteId}`);
      }
    }, // end removeRelationship
    //#endregion

    //#region List Builder Functions (Markdown Output)
    // #################################################################################################
    // #################################################################################################
    //
    //                              List Builder Functions (Markdown Output)
    //
    // #################################################################################################
    // #################################################################################################
    // ===============================================================================================
    // Recursively build a nested list of related notes, using parent/child tag relationships.
    // Optional: customize how each note is displayed using formatLabel(note, handle).
    // ===============================================================================================
    buildNestedNoteList: async function (app, notes, options) {
      const plugin = this;
      const {
        noteIdPrefix = 'note-id/', // tag used to uniquely identify a note (e.g., "note-id/20250823...")
        parentTagPrefix = 'r/parent/', // tag prefix used on child notes to point to their parent
        // not currently used (included for symmetry)
        childTagPrefix = 'r/child/', // eslint-disable-line no-unused-vars
        includeChildren = true, // whether to include child notes
        indentLevel = 0, // how far to indent this level of the list
        visited = new Set(), // keeps track of rendered notes to avoid infinite loops
        formatLabel = null, // optional function to customize the label text
      } = options;

      // Helper: extract the note ID from a tag like "note-id/20250823104500"
      const getNoteId = (note) =>
        note.tags.find((t) => t.startsWith(noteIdPrefix))?.split('/')[1] || null;

      const normalize = plugin.normalizeNoteHandle; // returns { name, url, tags }
      const indent = '    '.repeat(indentLevel); // 4 spaces per level
      let output = '';

      for (const note of notes) {
        if (!note) continue;

        // Skip notes we've already rendered (prevents cycles)
        if (visited.has(note.uuid)) continue;
        visited.add(note.uuid);

        // Format the basic bullet label
        const handle = normalize(note);
        let label = `[${handle.name}](${handle.url})`;

        // Allow custom formatting of the label (e.g., show completion date)
        if (typeof formatLabel === 'function') {
          label = formatLabel(note, handle);
        }

        // Render the note as a bullet point
        output += `${indent}- ${label}\n`;

        // If not rendering children, move to next note
        if (!includeChildren) continue;

        const noteId = getNoteId(note);
        if (!noteId) continue;

        // Find notes that reference this one as their parent
        const children = await plugin.getFilteredNotes(app, `${parentTagPrefix}${noteId}`);
        children.sort((a, b) => a.name.localeCompare(b.name));

        // Recursively build list for child notes
        const childMarkdown = await plugin.buildNestedNoteList(app, children, {
          ...options,
          indentLevel: indentLevel + 1,
          visited: new Set(visited), // clone set to allow shared children across branches
        });

        output += childMarkdown;
      }

      return output;
    }, // end buildNestedNoteList

    // ===============================================================================================
    // Builds a nested list of reference notes (people, software, or horizon)
    // ===============================================================================================
    buildNestedReferenceList: async function (
      app,
      {
        baseNotes, // array of reference notes
        noteType = 'people', // one of: "people", "software", "horizon"
        includeChildren = true, // whether to show nested child notes
        indentLevel = 0, // optional starting indent level
      },
    ) {
      const plugin = this;

      const noteIdPrefix = 'note-id/';
      const parentTagPrefix = 'r/parent/';
      const childTagPrefix = 'r/child/';

      // Step 1: Only include notes of the specified type (e.g. "people")
      const filtered = baseNotes.filter((n) => plugin.getNoteType(n) === noteType);

      // Step 2: From those, exclude any notes that are declared children
      const topLevel = filtered.filter(
        (n) => !n.tags.some((tag) => tag.startsWith(parentTagPrefix)),
      );

      // Step 3: Sort top-level notes alphabetically
      topLevel.sort((a, b) => a.name.localeCompare(b.name));

      // Step 4: Build the nested markdown list
      const md = await plugin.buildNestedNoteList(app, topLevel, {
        noteIdPrefix,
        parentTagPrefix,
        childTagPrefix,
        includeChildren,
        indentLevel,
        formatLabel: (note, handle) => `[${handle.name}](${handle.url})`,
      });

      return md.trim();
    }, // end buildNestedReferenceList

    // ===============================================================================================
    // Build a nested list of projects from the provided notes, grouped by status if requested
    // ===============================================================================================
    buildNestedProjectList: async function (
      app,
      {
        baseNotes, // array of notes to include in the list
        groupByStatus = 'full', // "flat" or "full" grouping style
        includeChildren = true, // whether to include child projects
        // placeholder for future use
        format = 'standard', // eslint-disable-line no-unused-vars
        sortCompletedByDate = true, // if true, completed projects sorted newest first
        ignoreParentFiltering = false, // ✅ if true, allow child projects to be listed top-level
      },
    ) {
      const plugin = this;

      const projectStatuses = [
        { tag: 'project/focus', label: 'Focus Projects' },
        { tag: 'project/active', label: 'Active Projects' },
        { tag: 'project/tracking', label: 'Tracking Projects' },
        { tag: 'project/on-hold', label: 'On Hold Projects' },
        { tag: 'project/future', label: 'Future Projects' },
        { tag: 'project/someday', label: 'Someday Projects' },
        { tag: 'project/completed', label: 'Completed Projects' },
        { tag: 'project/canceled', label: 'Canceled Projects' },
      ];

      const getNoteId = (note) =>
        note.tags.find((t) => t.startsWith('note-id/'))?.split('/')[1] || null;

      const hasParentTag = (note) => note.tags.some((t) => t.startsWith('r/parent/'));
      const hasChildTag = (note) => note.tags.some((t) => t.startsWith('r/child/'));
      const getParentIds = (note) =>
        note.tags.filter((t) => t.startsWith('r/parent/')).map((t) => t.split('/')[2]);

      const byNoteId = new Map();
      const getByNoteId = async (noteId) => {
        if (!noteId) return null;
        if (byNoteId.has(noteId)) return byNoteId.get(noteId);
        const matches = await plugin.getFilteredNotes(app, `note-id/${noteId}`);
        const n = matches?.[0] || null;
        byNoteId.set(noteId, n);
        return n;
      };

      const getTopAncestor = async (note) => {
        let current = note;
        while (true) {
          const parentIds = getParentIds(current);
          if (parentIds.length === 0) return current;

          const firstParent = await getByNoteId(parentIds[0]);
          if (!firstParent) return current;

          current = firstParent;
        }
      };

      const formatProjectLabel = (note, handle) => {
        let label = `[${handle.name}](${handle.url})`;

        const dateTag = handle.tags.find((t) => t.startsWith('project/completed/'))?.split('/')[2];
        if (dateTag && /^\d{6}$/.test(dateTag)) {
          const year = dateTag.slice(0, 4);
          const month = dateTag.slice(4);
          const dateObj = new Date(`${year}-${month}-15`);
          const formatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' });
          label += ` (${formatter.format(dateObj)})`;
        } else if (dateTag) {
          label += ` (${dateTag})`;
        }

        return label;
      };

      let md = '';

      // =====================
      // FLAT MODE: no status grouping
      // =====================
      if (groupByStatus === 'flat') {
        const roots = baseNotes
          .filter((n) => n.tags.some((t) => t.startsWith('project/')))
          .filter((n) => ignoreParentFiltering || !hasParentTag(n))
          .sort((a, b) => {
            if (sortCompletedByDate) {
              const getDate = (n) =>
                n.tags.find((t) => t.startsWith('project/completed/'))?.split('/')[2] || '';
              return getDate(b).localeCompare(getDate(a)); // newest first
            } else {
              return a.name.localeCompare(b.name);
            }
          });

        md += await plugin.buildNestedNoteList(app, roots, {
          noteIdPrefix: 'note-id/',
          parentTagPrefix: 'r/parent/',
          childTagPrefix: 'r/child/',
          includeChildren,
          indentLevel: 0,
          formatLabel: formatProjectLabel,
        });

        return md.trim();
      }

      // =====================
      // FULL MODE: group by project status
      // =====================
      // (unchanged from your current version)

      const secondLevelRoots = new Map();

      for (const n of baseNotes) {
        const nid = getNoteId(n);
        if (nid) byNoteId.set(nid, n);
      }

      for (const n of baseNotes) {
        if (!hasParentTag(n) && !hasChildTag(n)) secondLevelRoots.set(n.uuid, n);
        else if (!hasParentTag(n) && hasChildTag(n)) secondLevelRoots.set(n.uuid, n);
      }

      for (const n of baseNotes) {
        if (hasParentTag(n)) {
          const top = await getTopAncestor(n);
          if (top) secondLevelRoots.set(top.uuid, top);
        }
      }

      const rootsByStatus = new Map(projectStatuses.map((s) => [s.tag, []]));
      for (const root of secondLevelRoots.values()) {
        const statusTag = root.tags.find((t) => t.startsWith('project/'));
        if (!statusTag) continue;

        for (const [prefix, list] of rootsByStatus.entries()) {
          if (statusTag === prefix || statusTag.startsWith(prefix + '/')) {
            list.push(root);
            break;
          }
        }
      }

      for (const status of projectStatuses) {
        md += `- ${status.label}\n`;

        const roots = rootsByStatus.get(status.tag) || [];

        if (roots.length === 0) {
          md += `    - *No matching projects*\n\n`;
          continue;
        }

        if (status.tag === 'project/completed' && sortCompletedByDate) {
          roots.sort((a, b) => {
            const ta = a.tags.find((t) => t.startsWith('project/completed/'))?.split('/')[2] || '';
            const tb = b.tags.find((t) => t.startsWith('project/completed/'))?.split('/')[2] || '';
            return tb.localeCompare(ta);
          });
        } else {
          roots.sort((a, b) => a.name.localeCompare(b.name));
        }

        md += await plugin.buildNestedNoteList(app, roots, {
          noteIdPrefix: 'note-id/',
          parentTagPrefix: 'r/parent/',
          childTagPrefix: 'r/child/',
          includeChildren,
          indentLevel: 1,
          formatLabel: formatProjectLabel,
        });

        md += '\n';
      }

      return md.trim();
    }, // end buildNestedProjectList
    //#endregion

    //#region Related Section Updater Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                              Related Section Updater Functions
    //
    // #################################################################################################
    // #################################################################################################
    // ===============================================================================================
    // Updates any "Related *" sections with links to all related notes
    // Called from:
    // ===============================================================================================
    updateAllRelatedSections: async function (app, noteUUID, domainTags = []) {
      const staticSections = [
        //{ name: "Recent Updates", fn: this.updateRecentUpdatesSection },
        { name: 'Related Tasks', fn: this.updateRelatedTasksSection },
        { name: 'Related Projects', fn: this.updateRelatedProjectsSection },
        { name: 'Related People', fn: this.updateRelatedPeopleSection },
        { name: 'Related References', fn: this.updateRelatedReferencesSection },
        { name: 'Related Software', fn: this.updateRelatedSoftwareSection },
        { name: 'Parent Notes', fn: this.updateParentNotesSection },
        { name: 'Child Notes', fn: this.updateChildNotesSection },
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
    // Updates any existing Recent Updates section with backlinks from recent Daily Jots
    // Called from:
    // ===============================================================================================
    updateRecentUpdatesSection: async function (app, noteUUID) {
      const sectionHeading = 'Recent Updates';

      // Utility to remove ordinal suffixes from day numbers in Jot names
      function cleanDateString(dateStr) {
        return dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
      }

      // 1. Find the section (don't add if it doesn't exist)
      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      // 1. Get all noteHandles that reference this project note
      const backlinks = await app.getNoteBacklinks({ uuid: noteUUID });

      // 2. Filter to only those tagged with 'daily-jots'
      const jots = backlinks.filter((n) => n.tags.includes('daily-jots'));

      // 3. Limit to jots from the last 14 days
      const lookBackDate = new Date();
      lookBackDate.setDate(lookBackDate.getDate() - 14);

      // 4. Need to filter jots for those with titles greater than 14 daya ago
      const recentJots = jots
        .map((jot) => {
          const cleaned = cleanDateString(jot.name);
          const parsedDate = new Date(cleaned);
          return { jot, parsedDate };
        })
        .filter(({ parsedDate }) => !isNaN(parsedDate) && parsedDate >= lookBackDate)
        .sort((a, b) => b.parsedDate - a.parsedDate) // most recent first
        .map(({ jot }) => jot); // unwrap original jot object

      // await app.alert(JSON.stringify(recentJots));

      // 5. Iterate through recentJots and pull out context and contents
      const targetNoteHandle = { uuid: noteUUID };
      let footnoteCounter = 1;

      const updates = [];
      for (const jot of recentJots) {
        const sourceNoteHandle = jot;
        const backlinkContents = await app.getNoteBacklinkContents(
          targetNoteHandle,
          sourceNoteHandle,
        );

        // if there isn't any backlink content, skip
        if (backlinkContents.length === 0) continue;

        // Normalize the Jot name and url
        const jotLink = this.normalizeNoteHandle(jot);

        // Append each backlink with date + content
        backlinkContents.forEach((content) => {
          // skip if this is just a plain link (no sub-bullets)
          const isEmptyLinkOnly = content
            .trim()
            .match(/^\[.*?\]\(https:\/\/www\.amplenote\.com\/notes\/[a-z0-9-]+\)$/i);
          if (isEmptyLinkOnly) return;
          // strip out any embedded comments that might affect indentation
          const cleanedContent = this.stripAmplenoteIndentComments(content);
          // uniquify any footnotes so they don't conflict
          const { updatedContent, nextCounter } = this.uniquifyFootnotes(
            cleanedContent,
            footnoteCounter,
          );
          footnoteCounter = nextCounter;

          //await app.alert("updatedContent:\n" + updatedContent);
          // Adjust indentation to align with top level bullets
          const indentedContent = this.normalizeIndentationForSubtree(updatedContent);

          updates.push({
            name: jotLink.name,
            noteURL: jotLink.url,
            markdown: indentedContent,
          });
        });
      }

      // 6. Build markdown for output
      const markdown = updates
        .map((u) => `- [${u.name}](${u.noteURL})\n${u.markdown}`)
        .join('\n\n');

      // 7. Replace section content
      await app.replaceNoteContent(noteUUID, markdown, {
        section: { heading: { text: sectionHeading } },
      });
    }, //end updateRecentUpdatesSection

    // ===============================================================================================
    // Updates any existing Related Tasks section with links to all related tasks
    // Called from:
    // ===============================================================================================
    updateRelatedTasksSection: async function (app, noteUUID, domainTags = []) {
      const sectionHeading = 'Related Tasks';

      // 1. Find the section (don't add if it doesn't exist)
      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
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
        backlinks = backlinks.filter((bn) => {
          const noteDomainTags = bn.tags.filter((t) => t.startsWith('d/'));
          return (
            (noteDomainTags.length === 0 || domainTags.some((dt) => noteDomainTags.includes(dt))) &&
            !bn.tags.includes('archive') &&
            !bn.tags.includes('exclude')
          );
        });
      } else {
        // Even if no domain filter, still exclude archive/exclude
        backlinks = backlinks.filter(
          (bn) => !bn.tags.includes('archive') && !bn.tags.includes('exclude'),
        );
      }

      // 5. From those notes, get tasks referencing this note
      let referencedTasks = [];
      for (const bn of backlinks) {
        const tasks = await app.getNoteTasks(bn.uuid);
        const matchingTasks = tasks.filter(
          (t) => t.content.includes(note.name) || t.content.includes(noteUUID),
        );
        referencedTasks.push(...matchingTasks);
      }

      // 6. Merge own tasks + referenced tasks, deduplicate by UUID
      const allTasks = [...ownTasks, ...referencedTasks];
      const uniqueTasks = Array.from(new Map(allTasks.map((t) => [t.uuid, t])).values());

      // 7. Sort by score descending
      uniqueTasks.sort((a, b) => (b.score || 0) - (a.score || 0));

      // 8. Build markdown list with deadlines & uniquified footnotes
      let counter = 1;
      const taskLines = uniqueTasks.map((task) => {
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
      await app.replaceNoteContent(noteUUID, taskLines.join('\n'), {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: uniqueTasks.length };
    }, // end updateRelatedTasksSection

    // ===============================================================================================
    // Updates any existing Related Projects section with links to all related projects
    // Called from:
    // ===============================================================================================
    updateRelatedProjectsSection: async function (app, noteUUID, domainTags = []) {
      const sectionHeading = 'Related Projects';

      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      const note = await app.notes.find(noteUUID);
      const noteIdTag = await this.getNoteIdTag(app, note);
      const noteIdValue = noteIdTag.split('/')[1];

      // Get all notes tagged with "r" (unfiltered first)
      let rTaggedNotes = await this.getFilteredNotes(app, 'r', domainTags);

      const allMatches = rTaggedNotes.filter((n) =>
        n.tags.some((t) => t.startsWith('r/') && t.endsWith(`/${noteIdValue}`)),
      );
      const projectMatches = allMatches.filter((n) => n.tags.some((t) => t.startsWith('project/')));
      const filteredMatches = projectMatches.filter(
        (n) =>
          !n.tags.some(
            (t) =>
              t.startsWith(`r/parent/${noteIdValue}`) || t.startsWith(`r/child/${noteIdValue}`),
          ),
      );

      const md = await this.buildNestedProjectList(app, {
        baseNotes: filteredMatches,
        groupByStatus: 'full',
        includeChildren: true,
        format: 'standard',
      });

      await app.replaceNoteContent(noteUUID, md, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: filteredMatches.length };
    }, // end updateRelatedProjectsSection

    // ===============================================================================================
    // Updates any existing Related People section with links to all related people
    // Called from:
    // ===============================================================================================
    updateRelatedPeopleSection: async function (app, noteUUID, domainTags = []) {
      const sectionHeading = 'Related People';

      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      const note = await app.notes.find(noteUUID);
      const peopleTags = note.tags.filter((t) => t.startsWith('r/people/'));
      if (peopleTags.length === 0) {
        await app.replaceNoteContent(noteUUID, '_(No related people)_', {
          section: { heading: { text: sectionHeading, index: targetSection.heading.index } },
        });
        return { updated: true, count: 0 };
      }

      const relatedPeople = [];
      for (const tag of peopleTags) {
        const noteId = tag.split('/')[2];

        // Use new helper to get matches, filtered by domain/exclusions
        let matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);

        if (matches.length > 0) {
          relatedPeople.push(this.normalizeNoteHandle(matches[0]));
        }
      }

      relatedPeople.sort((a, b) => a.name.localeCompare(b.name));

      const peopleList = relatedPeople.length
        ? relatedPeople.map((n) => `- [${n.name}](${n.url})`).join('\n')
        : '_(No related people)_';

      await app.replaceNoteContent(noteUUID, peopleList, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: relatedPeople.length };
    }, // end updateRelatedPeopleSection

    // ===============================================================================================
    // Updates any existing Related References section with links to all related references
    // Called from:
    // ===============================================================================================
    updateRelatedReferencesSection: async function (app, noteUUID, domainTags = []) {
      const sectionHeading = 'Related References';

      // 1. Locate the section in the note
      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      // 2. Load the current note
      const note = await app.notes.find(noteUUID);

      // 3. Get all r/reference/... tags (any depth)
      const referenceTags = note.tags.filter(
        (t) => t.startsWith('r/reference/') && t.split('/').length >= 3,
      );

      if (referenceTags.length === 0) {
        await app.replaceNoteContent(noteUUID, '_(No related references)_', {
          section: { heading: { text: sectionHeading, index: targetSection.heading.index } },
        });
        return { updated: true, count: 0 };
      }

      // 4. Resolve note-ids and fetch matching notes
      const relatedRefs = [];
      for (const tag of referenceTags) {
        const noteId = tag.split('/').pop(); // Support arbitrarily deep paths
        const matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);
        if (matches.length > 0) {
          const handle = this.normalizeNoteHandle(matches[0]);

          // ⛔ Exclude notes that are actually people or software (just in case)
          const isPeople = handle.tags.some((t) => t.startsWith('reference/people'));
          const isSoftware = handle.tags.some((t) => t.startsWith('reference/software'));
          if (!isPeople && !isSoftware) {
            relatedRefs.push(handle);
          }
        }
      }

      // 5. Sort alphabetically
      relatedRefs.sort((a, b) => a.name.localeCompare(b.name));

      // 6. Build markdown output
      const refList = relatedRefs.length
        ? relatedRefs.map((n) => `- [${n.name}](${n.url})`).join('\n')
        : '_(No related references)_';

      // 7. Replace section content
      await app.replaceNoteContent(noteUUID, refList, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: relatedRefs.length };
    }, // end updateRelatedReferencesSection

    // ===============================================================================================
    // Updates any existing Related Software section with links to all related software
    // Called from:
    // ===============================================================================================
    updateRelatedSoftwareSection: async function (app, noteUUID, domainTags = []) {
      const sectionHeading = 'Related Software';

      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      const note = await app.notes.find(noteUUID);
      const softwareTags = note.tags.filter((t) => t.startsWith('r/software/'));
      if (softwareTags.length === 0) {
        await app.replaceNoteContent(noteUUID, '_(No related software)_', {
          section: { heading: { text: sectionHeading, index: targetSection.heading.index } },
        });
        return { updated: true, count: 0 };
      }

      const relatedSoftware = [];
      for (const tag of softwareTags) {
        const noteId = tag.split('/')[2];

        // Use new helper to get matches, filtered by domain/exclusions
        let matches = await this.getFilteredNotes(app, `note-id/${noteId}`, domainTags);

        if (matches.length > 0) {
          relatedSoftware.push(this.normalizeNoteHandle(matches[0]));
        }
      }

      relatedSoftware.sort((a, b) => a.name.localeCompare(b.name));

      const softwareList = relatedSoftware.length
        ? relatedSoftware.map((n) => `- [${n.name}](${n.url})`).join('\n')
        : '_(No related software)_';

      await app.replaceNoteContent(noteUUID, softwareList, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: relatedSoftware.length };
    }, // end updateRelatedSoftwareSection

    // ===============================================================================================
    // Updates any existing Parent Projects section with links to all parent projects
    // Domain filtering intentionally omitted here because parent/child relationships
    // are always within the same domain. Add domainTags filter if that changes.
    // Called from:
    // ===============================================================================================
    updateParentNotesSection: async function (app, noteUUID) {
      const sectionHeading = 'Parent Notes';

      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      const parents = await this.getParentNotes(app, noteUUID);
      parents.sort((a, b) => a.name.localeCompare(b.name));

      const parentList = parents.length
        ? parents.map((n) => `- [${n.name}](${n.url})`).join('\n')
        : '_(No parent notes)_';

      await app.replaceNoteContent(noteUUID, parentList, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: parents.length };
    }, // end updateParentNotessSection

    // ===============================================================================================
    // Updates any existing Child Projects section with links to all child projects
    // Domain filtering intentionally omitted here because parent/child relationships
    // are always within the same domain. Add domainTags filter if that changes.
    // Called from:
    // ===============================================================================================
    updateChildNotesSection: async function (app, noteUUID) {
      const sectionHeading = 'Child Notes';

      const sections = await app.getNoteSections({ uuid: noteUUID });
      const targetSection = sections.find(
        (s) => s.heading && s.heading.text.toLowerCase() === sectionHeading.toLowerCase(),
      );
      if (!targetSection) return { updated: false, count: 0 };

      const children = await this.getChildNotes(app, noteUUID);
      children.sort((a, b) => a.name.localeCompare(b.name));

      const childList = children.length
        ? children.map((n) => `- [${n.name}](${n.url})`).join('\n')
        : '_(No child notes)_';

      await app.replaceNoteContent(noteUUID, childList, {
        section: { heading: { text: sectionHeading } },
      });

      return { updated: true, count: children.length };
    }, //end updateChildNotesSection
    //#endregion

    //#region Bracketed Section Updater Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                              Bracketed Section Updater Functions
    //
    // #################################################################################################
    // #################################################################################################
    // ===============================================================================================
    // Updates sections in a list note that use [bracketed] subtags to display dynamic content
    // ===============================================================================================
    updateBracketedSections: async function (app, note, listType, domainTags = []) {
      const plugin = this;

      // Fetch all section headings from the note
      const sections = await app.getNoteSections({ uuid: note.uuid });

      let totalUpdated = 0; // Tracks how many sections were updated
      let totalCount = 0; // Tracks how many notes were inserted across all sections

      for (const section of sections) {
        // Skip sections without bracketed text in their headings
        if (!section.heading || !section.heading.text.includes('[')) continue;

        const match = section.heading.text.match(/\[([^\]]+)\]/);
        if (!match) continue;

        const subtag = match[1]; // Extract the subtag from brackets, e.g., "focus" from [focus]

        // Determine which tag prefix to use based on list type and subtag
        let baseTag = '';
        switch (listType) {
          case 'list/project':
            baseTag = `project/${subtag}`;
            break;
          case 'list/software':
            baseTag = `reference/software/${subtag}`;
            break;
          case 'list/people':
            baseTag = `reference/people/${subtag}`;
            break;
          case 'list/horizon':
            baseTag = `reference/horizon/${subtag}`;
            break;
          case 'list/reference':
            baseTag = `reference/${subtag}`;
            break;
        }

        // Fetch all notes matching the baseTag, filtered by domain
        let matchingNotes = await plugin.getFilteredNotes(app, baseTag, domainTags);

        let md = ''; // Markdown output to insert into this section

        // -------------------------------------------------------------------------------------------
        // 🗂 Special rendering for project list — uses nested hierarchy with grouping options
        // -------------------------------------------------------------------------------------------
        if (listType === 'list/project') {
          const sortCompletedByDate = subtag === 'completed'; // Sort completed by date

          // Filter to only project notes
          matchingNotes = matchingNotes.filter((n) => n.tags.some((t) => t.startsWith('project/')));

          // Render nested list using buildNestedProjectList
          md = await plugin.buildNestedProjectList(app, {
            baseNotes: matchingNotes,
            groupByStatus: 'flat', // One section per tag (e.g., [active], [completed])
            includeChildren: true, // Include child projects nested
            format: 'standard', // Future expansion
            sortCompletedByDate, // Only apply date sort to completed section
            ignoreParentFiltering: sortCompletedByDate, // Completed child projects shown as top-level
          });

          if (!md.trim()) {
            md = '- _No matching notes_';
          }

          // -------------------------------------------------------------------------------------------
          // 🧑 Nested people, software, and horizon lists
          // -------------------------------------------------------------------------------------------
        } else if (
          listType === 'list/people' ||
          listType === 'list/software' ||
          listType === 'list/horizon'
        ) {
          const noteType = listType.split('/')[1]; // "people", "software", or "horizon"

          // Only include notes that match the requested type
          matchingNotes = matchingNotes.filter((n) => plugin.getNoteType(n) === noteType);

          // Render nested list using buildNestedReferenceList
          md = await plugin.buildNestedReferenceList(app, {
            baseNotes: matchingNotes,
            noteType,
            includeChildren: true,
          });

          if (!md.trim()) {
            md = '- _No matching notes_';
          }

          // -------------------------------------------------------------------------------------------
          // 📃 Default flat alphabetical list
          // -------------------------------------------------------------------------------------------
        } else {
          matchingNotes.sort((a, b) => a.name.localeCompare(b.name));

          md = matchingNotes.length
            ? matchingNotes
                .map((n) => `- [${n.name}](https://www.amplenote.com/notes/${n.uuid})`)
                .join('\n')
            : '- _No matching notes_';
        }

        // Replace the content inside just this section (preserves rest of note)
        await app.replaceNoteContent(note.uuid, md, {
          section: { heading: { text: section.heading.text } },
        });

        totalUpdated++;
        totalCount += matchingNotes.length;
      }

      // Return a summary of updates for logging or user feedback
      return { updatedSections: totalUpdated, totalItems: totalCount };
    }, // end updateBracketedSections
    //#endregion

    //#region Tagging & Classification Functions
    // #################################################################################################
    // #################################################################################################
    //
    //                              Tagging & Classification Functions
    //
    // #################################################################################################
    // #################################################################################################

    // ===============================================================
    // setNoteTags: function to allow user to manage tags via prompt
    // ===============================================================
    setNoteTags: async function (app, noteUUID) {
      const plugin = this;

      // Helper: Load category data from the "System Categories" note
      async function getCategoryDataFromSystemNote(app) {
        const note = await app.findNote({ name: 'System Categories' });
        if (!note) {
          await app.alert("⚠️ Could not find 'System Categories' note.");
          return null;
        }

        const content = await app.getNoteContent(note);
        const match = content.match(/```json\n([\s\S]*?)```/);
        if (!match) {
          await app.alert("⚠️ Could not find a valid ```json block in 'System Categories'.");
          return null;
        }

        try {
          return JSON.parse(match[1]);
        } catch (err) {
          await app.alert('⚠️ Failed to parse category JSON:\n' + err.message);
          return null;
        }
      }

      let note = await app.notes.find(noteUUID);
      if (!note) {
        await app.alert('❌ Could not find the current note.');
        return;
      }

      // === Step 0: Bootstrap new notes with no tags ===
      if (note.tags.length === 0) {
        const setupResult = await app.prompt(`Set up new note: "${note.name}"`, {
          inputs: [
            {
              label: 'Domain',
              type: 'radio',
              options: [
                { label: 'None', value: '' },
                { label: 'Home', value: 'd/home' },
                { label: 'Work', value: 'd/work' },
              ],
              value: '',
            },
            {
              label: 'Note Type',
              type: 'radio',
              options: [
                { label: 'Project', value: 'project' },
                { label: 'People', value: 'people' },
                { label: 'Software', value: 'software' },
                { label: 'Horizon', value: 'horizon' },
                { label: 'Reference', value: 'reference' },
              ],
            },
          ],
        });

        if (!setupResult) return;

        const [domainTag, noteType] = setupResult;
        if (domainTag) await note.addTag(domainTag);

        let typeTag = '',
          templateName = '';
        switch (noteType) {
          case 'project':
            typeTag = 'project/active';
            templateName = 'Project Heading Template';
            break;
          case 'people':
            typeTag = 'reference/people/uncategorized';
            templateName = 'People Heading Template';
            break;
          case 'software':
            typeTag = 'reference/software/uncategorized';
            templateName = 'Software Heading Template';
            break;
          case 'horizon':
            typeTag = 'reference/horizon/uncategorized';
            templateName = 'Horizon Heading Template';
            break;
          case 'reference':
            typeTag = 'reference/uncategorized';
            templateName = 'Reference Heading Template';
            break;
        }

        if (typeTag) await note.addTag(typeTag);

        if (templateName) {
          const templateNote = await app.findNote({ name: templateName });
          if (!templateNote) {
            await app.alert(`❌ Template note "${templateName}" not found.`);
          } else {
            const content = await app.getNoteContent(templateNote);
            await app.insertNoteContent({ uuid: note.uuid }, content, { atEnd: true });
          }
        }
      }

      // Refetch the note to make sure new tags/content are included
      note = await app.notes.find(noteUUID);

      const isProjectNote = note.tags.some((t) => t.startsWith('project/'));
      const isPeopleNote = note.tags.some((t) => t.startsWith('reference/people/'));
      const isSoftwareNote = note.tags.some((t) => t.startsWith('reference/software/'));
      const isHorizonNote = note.tags.some((t) => t.startsWith('reference/horizon/'));

      const currentRelations = await plugin.getReadableRelationships(app, note);
      const categoryData = await getCategoryDataFromSystemNote(app);

      const inputs = [];

      // === Add project-specific inputs ===
      if (isProjectNote) {
        inputs.push({
          label: 'Project Status',
          type: 'select',
          options: [
            { label: '', value: '' },
            { label: 'Focus', value: 'project/focus' },
            { label: 'Active', value: 'project/active' },
            { label: 'Tracking', value: 'project/tracking' },
            { label: 'On hold', value: 'project/on-hold' },
            { label: 'Future', value: 'project/future' },
            { label: 'Someday', value: 'project/someday' },
            { label: 'Completed', value: 'project/completed' },
            { label: 'Canceled', value: 'project/canceled' },
          ],
        });
        inputs.push({ label: 'Parent Note', type: 'note' });
      }
      if (isPeopleNote || isSoftwareNote || isHorizonNote) {
        inputs.push({ label: 'Parent Note', type: 'note' });
      }

      // === Add dynamic category dropdowns if category data is available ===
      if (categoryData) {
        if (note.tags.some((t) => t.startsWith('reference/people/'))) {
          inputs.push({
            label: 'People Category',
            type: 'select',
            options: [
              { label: '', value: '' },
              ...categoryData.people.map((tag) => ({
                label: tag,
                value: 'reference/people/' + tag,
              })),
            ],
          });
        }

        if (note.tags.some((t) => t.startsWith('reference/software/'))) {
          inputs.push({
            label: 'Software Category',
            type: 'select',
            options: [
              { label: '', value: '' },
              ...categoryData.software.map((tag) => ({
                label: tag,
                value: 'reference/software/' + tag,
              })),
            ],
          });
        }

        if (note.tags.some((t) => t.startsWith('reference/horizon/'))) {
          inputs.push({
            label: 'Horizon Category',
            type: 'select',
            options: [
              { label: '', value: '' },
              ...categoryData.horizon.map((tag) => ({
                label: tag,
                value: 'reference/horizon/' + tag,
              })),
            ],
          });
        }

        if (
          note.tags.some((t) => t.startsWith('reference/')) &&
          !note.tags.some(
            (t) =>
              t.startsWith('reference/people/') ||
              t.startsWith('reference/software/') ||
              t.startsWith('reference/horizon/'),
          )
        ) {
          inputs.push({
            label: 'Reference Category',
            type: 'select',
            options: [
              { label: '', value: '' },
              ...categoryData.reference.map((tag) => ({
                label: tag,
                value: 'reference/' + tag,
              })),
            ],
          });
        }
      }

      // === Add relationship options ===
      inputs.push({ label: 'Add Relationship', type: 'note' });

      if (currentRelations.length > 0) {
        inputs.push({
          label: 'Remove Relationship',
          type: 'select',
          options: [
            { label: '', value: '' },
            ...currentRelations.map((r) => ({ label: r.label, value: r.label })),
          ],
        });
      }

      // === Show prompt ===
      const result = await app.prompt(`Set tags for "${note.name}"`, {
        inputs,
        actions: [{ label: 'Continue', value: 'continue' }],
      });

      if (!result) return;

      const actionValue = result[result.length - 1];
      const actionWasContinue = actionValue === 'continue';

      // === Parse responses ===
      let idx = 0;
      const getNext = () => result[idx++];

      const projectStatusValue = isProjectNote ? getNext() : null;
      const parentProjectValue = isProjectNote ? getNext() : null;
      const parentReferenceValue =
        isPeopleNote || isSoftwareNote || isHorizonNote ? getNext() : null;

      const peopleCategoryValue =
        categoryData && note.tags.some((t) => t.startsWith('reference/people/')) ? getNext() : null;
      const softwareCategoryValue =
        categoryData && note.tags.some((t) => t.startsWith('reference/software/'))
          ? getNext()
          : null;
      const horizonCategoryValue =
        categoryData && note.tags.some((t) => t.startsWith('reference/horizon/'))
          ? getNext()
          : null;

      const referenceCategoryValue =
        categoryData &&
        note.tags.some((t) => t.startsWith('reference/')) &&
        !note.tags.some(
          (t) =>
            t.startsWith('reference/people/') ||
            t.startsWith('reference/software/') ||
            t.startsWith('reference/horizon/'),
        )
          ? getNext()
          : null;

      const addRelationshipValue = getNext();
      const removeRelationshipValue = currentRelations.length > 0 ? getNext() : null;

      // === Apply changes ===

      // Project status
      if (isProjectNote && projectStatusValue) {
        const oldStatus = note.tags.find((t) => t.startsWith('project/'));
        if (oldStatus) await note.removeTag(oldStatus);

        if (projectStatusValue === 'project/completed') {
          const now = new Date();
          const datestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
          await note.addTag(`project/completed/${datestamp}`);
        } else {
          await note.addTag(projectStatusValue);
        }
      }

      // Parent project
      if (isProjectNote && parentProjectValue?.uuid) {
        await plugin.setParentChildRelationship(app, noteUUID, parentProjectValue.uuid);
      }

      // Parent people, software, or horizon
      if ((isPeopleNote || isSoftwareNote || isHorizonNote) && parentReferenceValue?.uuid) {
        await plugin.setParentChildRelationship(app, noteUUID, parentReferenceValue.uuid);
      }

      // People category
      if (peopleCategoryValue) {
        const old = note.tags.find((t) => t.startsWith('reference/people/'));
        if (old) await note.removeTag(old);
        await note.addTag(peopleCategoryValue);
      }

      // Software category
      if (softwareCategoryValue) {
        const old = note.tags.find((t) => t.startsWith('reference/software/'));
        if (old) await note.removeTag(old);
        await note.addTag(softwareCategoryValue);
      }

      // Horizon category
      if (horizonCategoryValue) {
        const old = note.tags.find((t) => t.startsWith('reference/horizon/'));
        if (old) await note.removeTag(old);
        await note.addTag(horizonCategoryValue);
      }

      // Reference category
      if (referenceCategoryValue) {
        const old = note.tags.find(
          (t) =>
            t.startsWith('reference/') &&
            !t.startsWith('reference/people/') &&
            !t.startsWith('reference/software/') &&
            !t.startsWith('reference/horizon/'),
        );
        if (old) await note.removeTag(old);
        await note.addTag(referenceCategoryValue);
      }

      // Relationships
      if (addRelationshipValue?.uuid) {
        await plugin.addRelationshipByType(app, note, addRelationshipValue);
      }

      if (removeRelationshipValue) {
        const relation = currentRelations.find((r) => r.label === removeRelationshipValue);
        if (relation) {
          await plugin.removeRelationship(app, note, relation);
        }
      }

      // === Refresh related note sections ===
      //const domainTags = note.tags.filter(t => t.startsWith("d/"));
      //await plugin.updateAllRelatedSections(app, noteUUID, domainTags);

      // === Loop if requested ===
      if (actionWasContinue) {
        await plugin.setNoteTags(app, noteUUID);
      }
      // run taggingCleanup to make sure it's current
      //await this.taggingCleanup(app);
    }, // end setNoteTags

    // ===============================================================================================
    // Removes all tags from the specified note
    // ===============================================================================================
    clearAllTags: async function (app, noteUUID) {
      const note = await app.notes.find(noteUUID);
      if (!note) {
        await app.alert('❌ Could not find the note.');
        return;
      }

      for (const tag of note.tags) {
        await note.removeTag(tag);
      }

      await app.alert(`✅ Cleared ${note.tags.length} tags from "${note.name}"`);
    }, // end clearAllTags

    // ===============================================================================================
    // Runs the tagging cleanup process and updates the "Tagging Cleanup" section in the Inbox note
    // ===============================================================================================
    taggingCleanup: async function (app) {
      const plugin = this;
      const cleanupResults = [];

      // Helper to normalize, sort, and link notes
      const formatNoteList = (notes) => {
        return notes
          .map((n) => plugin.normalizeNoteHandle(n))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((handle) => `    - [${handle.name}](${handle.url})`)
          .join('\n');
      };

      // A: Missing critical tag
      let allNotes = await app.filterNotes({ tag: '^archive,^exclude' });
      const criticalPrefixes = ['daily-jots', 'list/', 'reference/', 'system', 'project/'];
      const missingCritical = allNotes.filter(
        (n) => !n.tags.some((tag) => criticalPrefixes.some((prefix) => tag.startsWith(prefix))),
      );
      if (missingCritical.length > 0) {
        cleanupResults.push({ reason: 'Missing critical tag', notes: missingCritical });
      }

      // B: Active project notes with no r/people tag
      const projectStatuses = [
        'project/active',
        'project/focus',
        'project/on-hold',
        'project/tracking',
      ];
      let missingPeople = [];
      for (const status of projectStatuses) {
        const projects = await plugin.getFilteredNotes(app, status);
        missingPeople.push(
          ...projects.filter((n) => !n.tags.some((tag) => tag.startsWith('r/people/'))),
        );
      }
      if (missingPeople.length > 0) {
        cleanupResults.push({
          reason: 'Active project notes with no r/people tag',
          notes: missingPeople,
        });
      }

      // C: Multiple domain tags
      const notesWithMultipleDomains = allNotes.filter(
        (n) => n.tags.filter((t) => t.startsWith('d/')).length > 1,
      );
      if (notesWithMultipleDomains.length > 0) {
        cleanupResults.push({ reason: 'Multiple domain tags', notes: notesWithMultipleDomains });
      }

      // D: Multiple project status tags
      const notesWithMultipleProjectStatus = allNotes.filter(
        (n) => n.tags.filter((t) => t.startsWith('project/')).length > 1,
      );
      if (notesWithMultipleProjectStatus.length > 0) {
        cleanupResults.push({
          reason: 'Multiple project status tags',
          notes: notesWithMultipleProjectStatus,
        });
      }

      // E: Parent projects with no child projects
      const parentProjects = allNotes.filter((n) => n.tags.some((t) => t.startsWith('r/child/')));
      const noChildren = [];
      for (const parent of parentProjects) {
        const children = await plugin.getChildNotes(app, parent.uuid);
        if (children.length === 0) noChildren.push(parent);
      }
      if (noChildren.length > 0) {
        cleanupResults.push({
          reason: 'Parent projects with no child projects',
          notes: noChildren,
        });
      }

      // F: Child projects with no parent project
      const childProjects = allNotes.filter((n) => n.tags.some((t) => t.startsWith('r/parent/')));
      const noParent = [];
      for (const child of childProjects) {
        const parents = await plugin.getParentNotes(app, child.uuid);
        if (parents.length === 0) noParent.push(child);
      }
      if (noParent.length > 0) {
        cleanupResults.push({ reason: 'Child projects with no parent project', notes: noParent });
      }

      // G: Uncategorized reference notes
      const uncategorizedTags = [
        'reference/uncategorized',
        'reference/people/uncategorized',
        'reference/software/uncategorized',
      ];

      const uncategorized = [];
      for (const tag of uncategorizedTags) {
        const notes = await app.filterNotes({ tag });
        uncategorized.push(...notes);
      }

      if (uncategorized.length > 0) {
        cleanupResults.push({ reason: 'Uncategorized reference notes', notes: uncategorized });
      }

      // H: Mismatched parent/child types
      const notesWithRelationships = allNotes.filter((n) =>
        n.tags.some((t) => t.startsWith('r/parent/') || t.startsWith('r/child/')),
      );

      const mismatches = [];

      for (const note of notesWithRelationships) {
        const thisType = plugin.getNoteType(note);
        const relationshipTags = note.tags.filter(
          (t) => t.startsWith('r/parent/') || t.startsWith('r/child/'),
        );

        for (const tag of relationshipTags) {
          const targetId = tag.split('/')[2];
          if (!targetId) continue;

          const related = allNotes.find((n) => n.tags.includes(`note-id/${targetId}`));
          if (!related) continue;

          const relatedType = plugin.getNoteType(related);

          // ✅ Only compare simplified base types (like 'project', 'people', 'software')
          if (thisType && relatedType && thisType !== relatedType) {
            mismatches.push(note);
            mismatches.push(related);
          }
        }
      }

      if (mismatches.length > 0) {
        cleanupResults.push({
          reason: 'Mismatched parent/child note types',
          notes: mismatches,
        });
      }

      // Build Markdown for the Tagging Cleanup section
      let md = '';
      if (cleanupResults.length === 0) {
        md = '_No cleanup issues found_';
      } else {
        for (const group of cleanupResults) {
          md += `- ${group.reason}\n`;
          md += formatNoteList(group.notes) + '\n';
        }
      }

      // Find the Inbox note and update the Tagging Cleanup section
      const inbox = await app.findNote({ name: 'Inbox' });
      if (!inbox) {
        await app.alert('❌ Inbox note not found.');
        return;
      }
      await app.replaceNoteContent(inbox.uuid, md, {
        section: { heading: { text: 'Tagging Cleanup' } },
      });

      // Update the System Categories note, which is used by setNoteTags to build category lists
      await plugin.updateSystemCategories(app);

      // await app.alert("✅ Tagging Cleanup section updated in Inbox.");
    }, // end taggingCleanup

    // ===============================================================================================
    // updateSystemCategories iterates through reference categories and builds a list to
    // populate the System Categories note that will be used by the setNoteTags function to
    // set categories on people, software, and reference notes
    // ===============================================================================================
    updateSystemCategories: async function (app) {
      //const plugin = this;

      /**
       * Extracts all unique subtags from reference notes,
       * including intermediate paths like "travel" if "travel/gartner" exists.
       *
       * @param {string} baseTag - e.g., "reference", "reference/people"
       * @param {string[]} excludeFirstLevel - top-level types to exclude (e.g., ["people", "software"])
       * @returns {Promise<string[]>} - Sorted list of category paths
       */
      async function getReferenceCategories(baseTag, excludeFirstLevel = []) {
        const notes = await app.filterNotes({ tag: baseTag });
        const categories = new Set();

        for (let note of notes) {
          for (let tag of note.tags) {
            if (!tag.startsWith(baseTag + '/')) continue;

            // Subtag is everything after baseTag (e.g., "travel/gartner")
            const subtagParts = tag.split('/').slice(baseTag.split('/').length);
            const first = subtagParts[0];

            // Skip excluded root-level categories
            if (!first || excludeFirstLevel.includes(first)) continue;

            // Add all intermediate paths
            for (let i = 1; i <= subtagParts.length; i++) {
              const partial = subtagParts.slice(0, i).join('/');
              categories.add(partial);
            }
          }
        }

        return Array.from(categories).sort();
      }

      // === Step 1: Collect categories for each note type ===
      const peopleCats = await getReferenceCategories('reference/people');
      const softwareCats = await getReferenceCategories('reference/software');
      const horizonCats = await getReferenceCategories('reference/horizon');
      const refCats = await getReferenceCategories('reference', ['people', 'software', 'horizon']);

      // Build final JSON structure
      const categoryData = {
        people: peopleCats,
        software: softwareCats,
        horizon: horizonCats,
        reference: refCats,
      };

      // === Step 2: Locate the "System: Categories" note ===
      const categoryNote = await app.findNote({ name: 'System Categories' });

      if (!categoryNote) {
        await app.alert("❌ Could not find 'System: Categories' note.");
        return;
      }

      const content = await app.getNoteContent(categoryNote);

      // === Step 3: Replace or append the ```json block ===
      const newJsonBlock = '```json\n' + JSON.stringify(categoryData, null, 2) + '\n```';

      let newContent;
      const jsonBlockRegex = /```json[\s\S]*?```/;

      if (jsonBlockRegex.test(content)) {
        // Replace the existing json block
        newContent = content.replace(jsonBlockRegex, newJsonBlock);
      } else {
        // Append json block to end of note
        newContent = content + '\n\n' + newJsonBlock;
      }

      // === Step 4: Save the updated note ===
      await app.replaceNoteContent(categoryNote, newContent);

      // await app.alert("✅ Categories updated in 'System: Categories' note.");
    }, // end updateSystemCategories
    //#endregion

    //#region App Actions
    // #################################################################################################
    // #################################################################################################
    //                                          App Actions
    // #################################################################################################
    // #################################################################################################

    appOption: {
      // =============================================================================================
      // Update All Lists
      // This function is the orchestrator for updating all list notes in whatever ways are
      // appropriate
      // =============================================================================================

      'Update All Lists': async function (app) {
        const plugin = this;

        // 1. Get all list/* notes
        const listNotes = await plugin.getFilteredNotes(app, 'list');

        let totalNotes = 0;
        let totalSections = 0;
        let totalItems = 0;

        // 2. Update each list note using existing logic
        for (const note of listNotes) {
          const domainTags = note.tags.filter((t) => t.startsWith('d/'));
          const listType = note.tags.find((t) => t.startsWith('list/'));

          let summary = { updatedSections: 0, totalItems: 0 };

          switch (listType) {
            case 'list/project':
            case 'list/software':
            case 'list/people':
            case 'list/reference':
              summary = await plugin.updateBracketedSections(app, note, listType, domainTags);
              break;
            case 'list/related':
              summary = await plugin.updateAllRelatedSections(app, note.uuid, domainTags);
              break;
          }

          totalNotes++;
          totalSections += summary.updatedSections;
          totalItems += summary.totalItems;
        }

        await app.alert(
          `✅ Updated ${totalNotes} list notes\n` +
            `Sections refreshed: ${totalSections}\n` +
            `Total items updated: ${totalItems}`,
        );
      }, // end Update All Lists
    }, // end appOption
    //#endregion

    //#region Link Actions
    // #################################################################################################
    // #################################################################################################
    //                                          Link Actions
    // #################################################################################################
    // #################################################################################################

    linkOption: {
      // =============================================================================================
      // Calls setNoteTags to manage tags on current note
      // =============================================================================================
      'Update Tags': async function (app, link) {
        const uuidMatch = link.href?.match(/\/notes\/([a-f0-9-]+)$/);
        if (!uuidMatch) {
          await app.alert('❌ Invalid note link.');
          return;
        }
        await this.setNoteTags(app, uuidMatch[1]);
      }, // end Set Note Tags

      // ===============================================================================================
      // Note option wrapper to clear all tags
      // ===============================================================================================
      'Clear Tags': async function (app, noteUUID) {
        await this.clearAllTags(app, noteUUID);
      }, // end Clear Tags
    }, // end linkOption
    //#endregion

    //#region Note Actions
    // #################################################################################################
    // #################################################################################################
    //                                      Note Actions
    // #################################################################################################
    // #################################################################################################

    noteOption: {
      // =============================================================================================
      // Calls setNoteTags to manage tags on current note
      // =============================================================================================
      'Update Tags': async function (app, noteUUID) {
        //await app.alert("Getting ready to call setNoteTags");
        await this.setNoteTags(app, noteUUID);
      }, //end Set Note Tags

      // =============================================================================================
      // Update Note
      // This function is the orchestrator for updating the current note in whatever ways are
      // appropriate
      // =============================================================================================
      'Update Note': async function (app, noteUUID) {
        //const plugin = this;
        const note = await app.notes.find(noteUUID);

        // Detect any domain tags (d/work, d/home, etc.)
        const domainTags = note.tags.filter((t) => t.startsWith('d/'));

        //let summary = { updatedSections: 0, totalItems: 0 };

        const isListNote = note.tags.some((t) => t.startsWith('list/'));
        if (isListNote) {
          const listType = note.tags.find((t) => t.startsWith('list/'));

          switch (listType) {
            case 'list/project':
            case 'list/software':
            case 'list/people':
            case 'list/reference':
              // Bracketed text flat mode updates, filtered by domain
              //summary = await plugin.updateBracketedSections(app, note, listType, domainTags);
              await plugin.updateBracketedSections(app, note, listType, domainTags);
              break;

            case 'list/related':
              // Run existing Related * section updates, filtered by domain
              //summary = await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
              await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
              break;
          }
        } else {
          // Non-list note → only update Related sections, filtered by domain
          //summary = await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
          await plugin.updateAllRelatedSections(app, noteUUID, domainTags);
        }

        /*
        await app.alert(
          `✅ Update complete for "${note.name}"\n` +
            `Sections updated: ${summary.updatedSections}\n` +
            `Total items updated: ${summary.totalItems}`,
        );
        */
      }, // end Update Note

      // ===============================================================================================
      // Note option wrapper to run Tagging Cleanup manually
      // ===============================================================================================
      'Run Tagging Cleanup': async function (app) {
        await this.taggingCleanup(app);
      }, // End Run Tagging Cleanup

      // ===============================================================================================
      // Note option wrapper to clear all tags
      // ===============================================================================================
      'Clear Tags': async function (app, noteUUID) {
        await this.clearAllTags(app, noteUUID);
      }, // end Clear Tags

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
      // Testing Recent Updates function
      // ===============================================================================================
      'Test Recent Updates': async function (app, noteUUID) {
        const note = await app.notes.find(noteUUID);

        // Detect any domain tags (d/work, d/home, etc.)
        const domainTags = note.tags.filter((t) => t.startsWith('d/'));

        await this.updateRecentUpdatesSection(app, noteUUID, domainTags);
      }, // end Test Recent Updates
      // ===============================================================================================
      // Collects deadline tasks to display on the daily jot
      // ===============================================================================================
      'Refresh Deadline Tasks': async function (app, noteUUID) {
        const plugin = this;

        const currentNote = await app.notes.find(noteUUID);
        if (!currentNote.tags || !currentNote.tags.includes('daily-jots')) {
          await app.alert('❌ This action only works in a Daily Jot note.');
          return;
        }

        const allTasks = await plugin.getAllTasks(app);

        const deadlineTasks = [];
        let footnoteCounter = 1;

        for (const task of allTasks) {
          if (!task.deadline) continue;

          const daysLeft = plugin.daysUntilDeadline(task.deadline);
          if (daysLeft <= 2) {
            const pacificDeadline = plugin.convertDeadlineToPacific(task.deadline);
            const { updatedContent, nextCounter } = plugin.uniquifyFootnotes(
              task.content,
              footnoteCounter,
            );
            footnoteCounter = nextCounter;

            deadlineTasks.push({
              content: `(Due: ${pacificDeadline}) ${updatedContent}`,
              daysLeft,
            });
          }
        }

        deadlineTasks.sort((a, b) => a.daysLeft - b.daysLeft);

        const md = deadlineTasks.length
          ? deadlineTasks.map((t) => `- ${t.content}`).join('\n')
          : '_No deadline tasks in next 2 days_';

        await app.replaceNoteContent(noteUUID, md, {
          section: { heading: { text: 'Deadline Tasks' } },
        });
      }, // end Refresh Deadline Tasks
    }, // end noteOption
    //#endregion
  }; // end plugin object
  return plugin;
  // using prettier-ignore below so it doesn't warn about a missing trailing semicolon
  // which is not allowed by Amplenote
})() // prettier-ignore
