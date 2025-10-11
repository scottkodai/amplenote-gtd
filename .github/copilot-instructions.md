# AI Agent Instructions for amplenote-gtd

This document guides AI coding agents working in the amplenote-gtd plugin codebase.

## Project Overview

This is an Amplenote plugin implementing Getting Things Done (GTD) methodology with robust note organization and task management capabilities. The plugin manages relationships between notes, categorizes content, and maintains dynamic sections through caching and tag-based filtering.

## Key Architecture Components

- **Cache Management**: Implements note and task caching with TTL (15 minutes) to optimize performance
  - See cache implementation in `gtd.js` around line 10
  - Use `_getCachedNotes()` and `_getCachedTasks()` instead of direct API calls

- **Note Organization**:
  - Notes are categorized using tags (projects, references, people, software, etc.)
  - Parent/child relationships managed through `r/parent/` and `r/child/` tags
  - Domain separation using `d/work` and `d/home` tags
  - Reference categories stored in "System Categories" note as JSON

- **Dynamic Sections**:
  - List notes use [bracketed] section headings for dynamic content
  - Related sections (Tasks, Projects, People, etc.) auto-update based on relationships
  - Recent Updates section pulls from Daily Jots backlinks

## Critical Workflows

### Building
```bash
npm run build        # One-time build
npm run watch        # Development with watch mode
```

### Note Types and Tags
- Project notes: `project/{focus,active,tracking,on-hold,future,someday,completed,canceled}`
- Reference notes: `reference/{people,software,horizon}/<category>`
- List notes: `list/{project,software,people,reference,related}`
- Domain tags: `d/{work,home}`

### Development Guidelines
1. Always use caching methods (`_getCachedNotes`, `_getCachedTasks`) instead of direct API calls
2. Maintain parent/child type consistency (e.g., projects can only parent other projects)
3. Use `normalizeNoteHandle()` when working with note references
4. Preserve section headings and formatting when updating note content
5. Handle domain tag filtering in relevant functions

## Integration Points

- **Amplenote API**: Primary external dependency via `app` object
  - Note operations: `app.notes`, `app.filterNotes`
  - Content management: `app.replaceNoteContent`, `app.getNoteSections`
  - Task management: `app.getNoteTasks`

- **Note Templates**: System notes provide templates for different note types
  - "Project Heading Template"
  - "People Heading Template"
  - "Software Heading Template"
  - "Reference Heading Template"
  - "System Categories" for reference categorization

## Project Conventions

- **File Structure**:
  - `gtd.js`: Main plugin code
  - `esbuild.config.cjs`: Build configuration
  - `src/`: Core plugin modules (options, sections, services, utils)

- **Code Organization**:
  - Code is organized using region markers that group related functionality
  - Thorough JSDoc comments on major functions
  - Consistent error handling with user-friendly alerts

- **Plugin Functions**:
  - `appOption`: Global plugin actions
  - `noteOption`: Per-note operations
  - `linkOption`: Link-specific operations

## Common Operations

1. **Updating Note Content**:
   ```javascript
   await app.replaceNoteContent(noteUUID, content, {
     section: { heading: { text: "Section Name" } }
   });
   ```

2. **Working with Tags**:
   ```javascript
   await note.addTag("project/active");
   await note.removeTag(oldTag);
   ```

3. **Relationships**:
   ```javascript
   const parents = await plugin.getParentNotes(app, noteUUID);
   const children = await plugin.getChildNotes(app, noteUUID);
   ```

Remember to run `taggingCleanup()` when making significant tag changes to maintain data integrity.