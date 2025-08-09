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
  },

  // ===============================================================================================
  // Extracts the first text found inside square brackets from the note title
  // Called from: Find Related Items (to extract r/ tag from title)
  // ===============================================================================================
  extractBracketText: function(title) {
    const match = title.match(/\[(.*?)\]/);
    return match ? match[1] : "";
  },

  // ===============================================================================================
  // Extracts bracketed domain from note titles (e.g. "[work]" → "work")
  // Called from: Update Lists (to detect domains)
  // ===============================================================================================
  extractDomainFromTitle: function(title) {
    const match = title.match(/\[(.*?)\]$/);
    return match ? match[1].toLowerCase() : null;
  },

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
  },


  // ===============================================================================================
  // Determines if a note is people/software for use in r/ tag lookups
  // Called from: Find Related Items
  // ===============================================================================================
  classifyNoteType: function(tags) {
    if (tags.some(tag => tag.startsWith("people"))) return "people";
    if (tags.some(tag => tag.startsWith("software"))) return "software";
    return "unknown";
  },

  // ===============================================================================================
  // Formats grouped projects into markdown list with optional fallback
  // Called from: Find Related Items
  // ===============================================================================================
  formatMarkdownList: function(title, projects) {
    if (projects.length === 0) return `- ${title}\n    - _No matching projects_`;
    return `- ${title}\n` + projects.map(p => `    - [${p.title}](${p.url})`).join("\n");
  },

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
  },

  // ===============================================================================================
  // Returns days until deadline
  // Called from: Refresh Relevant Tasks
  // ===============================================================================================
  daysUntilDeadline: function(deadlineTimestamp) {
    if (!deadlineTimestamp) return null;
    return (deadlineTimestamp * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
  },

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
  },

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
  },

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
  },
// ===============================================================================================
// Generates a unique note ID for tagging notes
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
},

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
  }, // End Update Project Tags
*/

// =================================================================================================
// =================================================================================================
//                                     Note Actions
// =================================================================================================
// =================================================================================================
  noteOption: {

    // =============================================================================================
    // Find Related Items
    // Populates the current note with related tasks, project links, and reference notes
    // =============================================================================================
/*
    "Find Related Items": async function(app, noteUUID) {
      const plugin = this;
      const taskCache = {}; //used to cache tasks to speed up processing
      // Get the current note
      const note = await app.notes.find(noteUUID);
      // Figure out what type of note this is (to determine the related r/ tag)
      // This function only works for people or software type notes
      const noteType = plugin.classifyNoteType(note.tags);
      if (noteType === "unknown") {
        await app.alert("Missing people or software tag");
        return;
      }
      // Extract the bracketed text from the note title
      const bracketText = plugin.extractBracketText(note.name);
      // Contruct a fully qualified tag name from the type and bracketed text
      const tagName = `r/${noteType}/${bracketText}`;
      // Find all notes tagged with that tag
      const relatedNotes = await app.filterNotes({ tag: tagName });
      // Categorize all of those notes that have a project/ tag (indicating that they
      // are projects)
      // TODO: need to handle reference type notes as well with a separate function
      const categorizedProjects = await plugin.categorizeProjectNotes(app, relatedNotes);
      // Build markdown for project list
      const projectSection = Object.entries(categorizedProjects)
        .map(([title, notes]) => plugin.formatMarkdownList(title, notes))
        .join("\n\n");
      // Replace the content of the Related Projects section (if it exists)
        await app.replaceNoteContent(noteUUID, projectSection, {
        section: { heading: { text: "Related Projects" } }
      });

      // Now find all related tasks for this note
      // First, get all tasks for the work domain (d/work tag)
      const allTasks = await plugin.getAllTasksForTag(app, "d/work", taskCache);
      // Get the note title with escaped brackets for filtering
      const noteTitleBracketed = `[${plugin.escapeBrackets(note.name)}]`;
      // Filter all tasks for incomplete tasks that have this note's title in-line tagged
      const referencedTasks = allTasks.filter(task =>
        !task.completed && task.content.includes(noteTitleBracketed)
      );
      // Build markdown for inserting into the note
      const taskListMarkdown = referencedTasks.length
        ? referencedTasks.map(t => `- ${t.content}`).join("\n")
        : "- _No related tasks found_";
      // Replace the Related Tasks section (if it exists) with the the bulleted
      // list of task contents
        await app.replaceNoteContent(noteUUID, taskListMarkdown, {
        section: { heading: { text: "Related Tasks" } }
      });

      // Now find all related references for this note
      // Filter relatedNotes to just those tagged with 'reference'
      const referenceNotes = [];
      for (const handle of relatedNotes) {
        const note = await app.notes.find(handle.uuid);
        if (note?.tags?.includes("reference")) {
          referenceNotes.push({
            title: note.name,
            url: `https://www.amplenote.com/notes/${note.uuid}`
          });
        }
      }

      // Sort alphabetically by title
      referenceNotes.sort((a, b) => a.title.localeCompare(b.title));

      // Format as a markdown list
      const referencesMarkdown = referenceNotes.length > 0
        ? referenceNotes.map(r => `- [${r.title}](${r.url})`).join("\n")
        : "- _No related references found_";

      // Replace the 'Related References' section of the note
      await app.replaceNoteContent(noteUUID, referencesMarkdown, {
        section: { heading: { text: "Related References" } }
      });
    }, // End "Find Related Items"
*/

    // =============================================================================================
    // Refresh Relevant Tasks
    // Builds a prioritized list of upcoming or high-priority tasks in a Daily Jot note
    // =============================================================================================
/*
    "Refresh Relevant Tasks": async function(app, noteUUID) {
      const plugin = this;
      const taskCache = {}; //used to cache tasks to speed up processing
      // Get current note
      const currentNote = await app.notes.find(noteUUID);
      // If this note is not a daily-jot, display an error and exit
      if (!currentNote.tags || !currentNote.tags.includes('daily-jots')) {
        await app.alert("This action only works in a Daily Jot note.");
        return;
      }

      // Get all tasks in the work domain (tagged d/work)
      //const allTasks = await plugin.getAllTasksForTag(app, "d/work", taskCache);
      const allTasks = await plugin.getAllTasksForTag(app, "d/work", {}); //sending blank object to force cache refresh

      // Define arrays to hold the tasks in various categories
      const deadlineTasks = []; // tasks with a deadline
      const primaryTasks = []; // tasks that are both important and urgent
      const importantTasks = []; // tasks that are important
      const urgentTasks = []; // tasks that are urgent
      const otherTasks = []; // tasks that are neither important, nor urgent
      const quickTasks = []; // tasks that are tagged as quick

      // Initialize a counter to ensure unique footnote references
      let footnoteCounter = 1;

      // Iterate through all tasks
      for (const task of allTasks) {
        // retrieve metadata about the current task
        const { content, score, urgent, important, deadline } = task;
        // update rich text footnote references to ensure uniqueness
        const { updatedContent, nextCounter } = plugin.uniquifyFootnotes(content, footnoteCounter);
        footnoteCounter = nextCounter;
        const taskContent = updatedContent;

        // If there's a deadline, convert the timestamp to Pacific time and calculate
        // the number of days until the deadline. If <= 7, insert the task into the array
        if (deadline != null) {
          const pacificDeadline = plugin.convertDeadlineToPacific(deadline);
          const daysLeft = plugin.daysUntilDeadline(deadline);
          if (daysLeft <= 7) {
            deadlineTasks.push({
              // Inserts the due date in front of the task content
              content: `(Due: ${pacificDeadline}): ${taskContent}`,
              deadlineDaysLeft: daysLeft
            });
            continue;
          }
        }

        // Skip any task that is tagged @waiting or @on hold
        if (taskContent.match(/@waiting\b/) || taskContent.match(/@on hold\b/)) {
          continue;
        }

        // Identify any task that is tagged @quick
        if (taskContent.match(/@quick\b/)) {
          quickTasks.push({ content: taskContent, score });
        }

        // Filter tags by important and urgent
        if (important && urgent) {
          primaryTasks.push({ content: taskContent, score });
        } else if (important) {
          importantTasks.push({ content: taskContent, score });
        } else if (urgent) {
          urgentTasks.push({ content: taskContent, score });
        } else {
          otherTasks.push({ content: taskContent, score });
        }
      }

      // Sort deadline tasks by deadline date
      deadlineTasks.sort((a, b) => a.deadlineDaysLeft - b.deadlineDaysLeft);
      // Sort other tasks by task score
      [primaryTasks, importantTasks, urgentTasks, otherTasks, quickTasks]
        .forEach(arr => arr.sort((a, b) => b.score - a.score));

      // build finalTasks array of strings with task content strings
      const finalTasks = [
        ...deadlineTasks.map(t => `D: ${t.content.trim()}`),
        ...primaryTasks.slice(0, 5).map(t => `P: ${t.content.trim()}`),
        ...importantTasks.slice(0, 5).map(t => `I: ${t.content.trim()}`),
        ...urgentTasks.slice(0, 5).map(t => `U: ${t.content.trim()}`),
        ...quickTasks.slice(0, 5).map(t => `Q: ${t.content.trim()}`)
      ];

      // convert the array into a markdown list of tasks
      const md = finalTasks.map(line => `- ${line}`).join("\n");

      // Replace Relevant Tasks section (if it exists) with updated markdown list
      await app.replaceNoteContent(
        { uuid: noteUUID },
        md,
        { section: { heading: { text: "Relevant Tasks" } } }
      );
    }, // End "Refresh Relevant Tasks"
*/

    // =============================================================================================
    // Update Lists
    // This function will automate the refreshing of many different GTD related lists.
    // It uses one-pass loading of all notes, bracketed titles to identify domains, and 
    // bracketed headers to dynamically populate sections in list notes.
    // =============================================================================================
/*
    "Update Lists": async function(app, noteUUID) {
      const plugin = this;
      const taskCache = {}; //used to cache tasks to speed up processing

      // List of expected base note types for each domain
      const baseNoteTypes = [
        "People List", "Software List", "Reference List",
        "Active Project List", "Completed Project List",
        "Canceled Project List", "Horizons of Focus"
      ];

      // Step 1: Find all notes tagged as 'list' and store notehandles in listNotes
      const listNotes = await app.filterNotes({ tag: "list" });

      // Step 2: Determine which domains are present by extracting [domain] from titles
      // The .filter(Boolean) option strips out any domains that are null (no brackets in
      // note title)
      // A "Set" is a built-in Javascript object that removes duplicates
      // The spread operator (...) converts the Set back into an array
      // The final result means that domains ends up being an array of all domains found
      // in the note titles of all 'list' notes. Adding a new 'list' note with a different
      // [domain] will create a new domain for this code (so make sure you've got a matching tag)
      const domains = [...new Set(
        listNotes.map(n => plugin.extractDomainFromTitle(n.name)).filter(Boolean)
      )];

      // Step 3: Alert if expected notes are missing, but continue on without creating any notes
      const expectedTitles = baseNoteTypes.flatMap(base =>
        domains.map(domain => `${base} [${domain}]`)
      );
      const existingTitles = listNotes.map(n => n.name);
      const missingTitles = expectedTitles.filter(t => !existingTitles.includes(t));
      if (missingTitles.length > 0) {
        await app.alert("Missing list notes:\n" + missingTitles.join("\n"));
      }

      // Step 4: Load all notes with a domain tag (d/*) once and categorize them 
      // by tag (e.g. people/it-leadership)
      
      // First get all notes in any domain
      const allNotes = await app.filterNotes({ tag: "d" });

      // loop through the notes and built category arrays.
      // Note: this code ignores top-level tags, so be sure not to use them
      // Categorized tags will be stored as 'software/general' etc
      const categorized = {};
      for (const note of allNotes) {
        for (const tag of note.tags) {
          if (tag.includes("/")) {
            if (!categorized[tag]) categorized[tag] = [];
            categorized[tag].push({
              title: note.name,
              url: `https://www.amplenote.com/notes/${note.uuid}`,
              uuid: note.uuid,
              tags: note.tags
            });
          }
        }
      }

      // Initialize footnoteCounter
      let footnoteCounter = 1;

      // Step 5: For each list note, find and replace sections with bracketed [subtag] headers
      for (const listNote of listNotes) {
        const sections = await app.getNoteSections({ uuid: listNote.uuid });

        // Filter for sections whose heading ends in [bracketed-text]
        const targetedSections = sections.filter(
          s => s.heading && s.heading.text.match(/\[(.*?)\]$/)
        );

        for (const section of targetedSections) {
          const headingText = section.heading.text;
          const subtagMatch = headingText.match(/\[(.*?)\]$/);
          const subtag = subtagMatch ? subtagMatch[1] : null;
          if (!subtag) continue;

          // Get note types allowed for linking on the current list note
          // e.g., People List only allows links to notes tagged with 'people/*'
          const allowedPrefixes = plugin.getAllowedTagPrefixesForNoteTitle(listNote.name);
          // Get the domain of the current list note from its title
          const domain = plugin.extractDomainFromTitle(listNote.name);

          // If this section should use project/ tags (project lists or horizons)
          if (allowedPrefixes.length === 1 && allowedPrefixes[0] === "project") {
            const projectTag = `project/${subtag}`;
            const matchingProjects = (categorized[projectTag] || []).filter(n =>
              n.tags.includes(`d/${domain}`)
            );

            matchingProjects.sort((a, b) => a.title.localeCompare(b.title));

            // Fetch related tasks (project note tasks + tasks from other notes that reference the project)
            const projectMarkdownBlocks = [];

            for (const project of matchingProjects) {
              // Get tasks from the project note itself
              const projectTasks = await app.getNoteTasks({ uuid: project.uuid });

              // Get all tasks from notes tagged with the domain
              const domainTasks = await plugin.getAllTasksForTag(app, `d/${domain}`, taskCache);

              // Find tasks in other notes that link to the project note
              const linkedTasks = domainTasks.filter(t =>
                !t.completed && t.content.includes(`[${plugin.escapeBrackets(project.title)}]`)
              );

              // Compile all tasks into one array
              const allTasks = [
                ...projectTasks.filter(t => !t.completed),
                ...linkedTasks
              ];

              // Remove duplicates using a Map keyed by task.uuid
              const uniqueTasksMap = new Map();
              for (const task of allTasks) {
                uniqueTasksMap.set(task.uuid, task);
              }
              const allRelatedTasks = Array.from(uniqueTasksMap.values());

              let subBullets = "";
              for (const t of allRelatedTasks) {
                const { updatedContent, nextCounter } = plugin.uniquifyFootnotes(t.content.trim(), footnoteCounter);
                footnoteCounter = nextCounter;
                subBullets += `    - ${updatedContent}\n`;
              }

              projectMarkdownBlocks.push(`- [${project.title}](${project.url})\n${subBullets}`);
            }

            const listNoteProjectMarkdown = projectMarkdownBlocks.length > 0
              ? projectMarkdownBlocks.join("\n")
              : "- _No matching projects found_";
              
            await app.replaceNoteContent(listNote.uuid, listNoteProjectMarkdown, {
              section: { heading: { text: headingText } }
            });

            continue; // skip the rest of the loop — already handled project/ tag
          }

          // Regular tag matching for non-project sections
          const tagVariants = allowedPrefixes.map(prefix => `${prefix}/${subtag}`);

          // filter the matching notes to match the current list note domain
          const matchingNotes = tagVariants.flatMap(tag =>
            (categorized[tag] || []).filter(n => n.tags.includes(`d/${domain}`))
          );
          matchingNotes.sort((a, b) => a.title.localeCompare(b.title));

          const listNoteMarkdown = matchingNotes.length > 0
            ? matchingNotes.map(n => `- [${n.title}](${n.url})`).join("\n")
            : "- _No matching notes found_";

          // await app.alert(`Updating section: ${headingText} in note: ${listNote.name}\nItems:\n${listNoteMarkdown}`);

          await app.replaceNoteContent(listNote.uuid, listNoteMarkdown, {
            section: { heading: { text: headingText } }
          });
        }
      }
      await app.alert("All lists updated!");
    }, // End Update Lists
*/

    // =============================================================================================
    // Update Current List
    // This function updates only the current list note. It applies the same logic as Update Lists:
    // - Uses [domain] in the title to scope notes
    // - Uses [subtag] in section headings to filter content
    // - Projects include tasks; others do not
    // - Uses getAllowedTagPrefixesForNoteTitle to determine which tags apply
    // =============================================================================================
/*
    "Update Current List": async function(app, noteUUID) {
      const plugin = this;
      const taskCache = {}; //used to cache tasks to speed up processing

      const listNote = await app.notes.find(noteUUID);
      if (!listNote || !listNote.tags.includes("list")) {
        await app.alert("This note is not tagged with 'list'.");
        return;
      }

      // Extract the domain from the note title (e.g., "People List [work]" => "work")
      const domain = plugin.extractDomainFromTitle(listNote.name);
      if (!domain) {
        await app.alert("Note title must contain a [domain] (e.g., [work], [home]).");
        return;
      }

      // Get all notes tagged with this domain
      const allNotes = await app.filterNotes({ tag: `d/${domain}` });

      // Build categorized lookup for matching notes by full tag (e.g., people/it-leadership)
      const categorized = {};
      for (const note of allNotes) {
        for (const tag of note.tags) {
          if (tag.includes("/")) {
            if (!categorized[tag]) categorized[tag] = [];
            categorized[tag].push({
              title: note.name,
              url: `https://www.amplenote.com/notes/${note.uuid}`,
              uuid: note.uuid,
              tags: note.tags
            });
          }
        }
      }

      // Get all sections of the current note
      const sections = await app.getNoteSections({ uuid: noteUUID });

      // Only look at sections with headings ending in [bracketed-text]
      const targetedSections = sections.filter(
        s => s.heading && s.heading.text.match(/\[(.*?)\]$/)
      );

      // Initialize footnoteCounter
      let footnoteCounter = 1;

      for (const section of targetedSections) {
        const headingText = section.heading.text;
        const subtagMatch = headingText.match(/\[(.*?)\]$/);
        const subtag = subtagMatch ? subtagMatch[1] : null;
        if (!subtag) continue;

        // Use the centralized function to determine what tag types are allowed
        const allowedPrefixes = plugin.getAllowedTagPrefixesForNoteTitle(listNote.name);
        const tagVariants = allowedPrefixes.map(prefix => `${prefix}/${subtag}`);

        // Gather matching notes for this section
        const matchingNotes = tagVariants.flatMap(tag =>
          (categorized[tag] || []).filter(n => n.tags.includes(`d/${domain}`))
        );
        matchingNotes.sort((a, b) => a.title.localeCompare(b.title));

        // Special handling for project lists (tagged with project/)
        const isProjectList = allowedPrefixes.includes("project");
        const projectMarkdownBlocks = [];

        if (isProjectList) {
          for (const project of matchingNotes) {
            // Get tasks from the project note itself
            const projectTasks = await app.getNoteTasks({ uuid: project.uuid });

            // Get tasks from other domain notes that reference this project
            const domainTasks = await plugin.getAllTasksForTag(app, `d/${domain}`, taskCache);
            const backlinkTasks = domainTasks.filter(
              t =>
                !t.completed &&
                t.noteUUID !== project.uuid &&
                t.content.includes(`[${plugin.escapeBrackets(project.title)}]`)
            );

            // Combine and deduplicate tasks
            const allRelatedTasks = [
              ...projectTasks.filter(t => !t.completed),
              ...backlinkTasks
            ];
            const seenContent = new Set();
            const uniqueTasks = allRelatedTasks.filter(t => {
              const trimmed = t.content.trim();
              if (seenContent.has(trimmed)) return false;
              seenContent.add(trimmed);
              return true;
            });

            // Format with sub-bullets for tasks
            let subBullets = "";
            for (const t of uniqueTasks) {
              const { updatedContent, nextCounter } = plugin.uniquifyFootnotes(t.content.trim(), footnoteCounter);
              footnoteCounter = nextCounter;
              subBullets += `    - ${updatedContent}\n`;
            }

            projectMarkdownBlocks.push(`- [${project.title}](${project.url})\n${subBullets}`);
          }

          const sectionMarkdown = projectMarkdownBlocks.length > 0
            ? projectMarkdownBlocks.join("\n")
            : "- _No matching projects found_";

          await app.replaceNoteContent(listNote.uuid, sectionMarkdown, {
            section: { heading: { text: headingText } }
          });

        } else {
          // For all non-project sections, just render links
          const markdown = matchingNotes.length > 0
            ? matchingNotes.map(n => `- [${n.title}](${n.url})`).join("\n")
            : "- _No matching notes found_";

          await app.replaceNoteContent(listNote.uuid, markdown, {
            section: { heading: { text: headingText } }
          });
        }
      }
      // await app.alert("Current list updated!");
    }, // End Update Current List
*/

    // =============================================================================================
    // Testing
    // This function is a placeholder for unit testing global functions or any other testing
    // =============================================================================================
    "Testing": async function(app, noteUUID) {

    

    } // End Testing
  }
}
