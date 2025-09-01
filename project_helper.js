(() => {
  // ========== CONSTANTS ==========
  const OPENAI_KEY_LABEL = "OpenAI API Key";
  const AI_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
  const DEFAULT_OPENAI_MODEL = "gpt-5";
  const QUESTION_ANSWER_PROMPT = "What would you like to know?";
  const BASE_PROJECT_STATUS_PROMPT = `
  You are an assistant trained to generate structured project updates from Amplenote notes, using GTD methodology.

  You will receive:
  1. A primary project note (title, content, and current date)
  2. Context from related backlinked notes (which will contain recent notes)
  
  Each project may either:
  - Be a TDX project (a formal project tracked by a TDX number found in the title, body, or backlinks), or
  - A GTD-style project (an objective requiring multiple actions, without a TDX number)
  
  Please generate a Markdown summary with the following structure. Use the provided date as the “Last Updated” value.
   
  **Recent Updates**  
  Summarize the backlink content in one paragraph. 
  Focus on recent progress, but also include any blockers or current critical path tasks. 
  Make sure this paragraph has proper punctuation and complete sentences, but use a sixth grade language level as a target.
  
  **Timeline**
  - Bullet points with important dates, milestones, delays, or projected completion timeframes.  
  - Use language from the note or backlinks—specific dates or approximate markers like “next month” or “by Q4”.
`;

  // ========== PROMPT GENERATION ==========
  const PROMPT_KEYS = ["answer", "answerSelection", "complete", "reviseContent", "reviseText", "summarize"];

  function systemPromptFromPromptKey(promptKey) {
    const SYSTEM_PROMPTS = {
      defaultPrompt: "You are a helpful assistant that responds with markdown-formatted content.",
      reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
      reviseText: "You are a helpful assistant that revises text, as instructed.",
      summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted."
    };
    return SYSTEM_PROMPTS[promptKey] || SYSTEM_PROMPTS.defaultPrompt;
  }

  function messageArrayFromPrompt(promptKey, promptParams) {
    const userPrompts = {
      answer: ({ instruction }) => [
        `Succinctly answer the following question: ${instruction}`,
        "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation."
      ],
      answerSelection: ({ text }) => [text],
      complete: ({ noteContent }) => `Continue the following markdown-formatted content:\n\n${noteContent}`,
      reviseContent: ({ noteContent, instruction }) => [instruction, noteContent],
      reviseText: ({ instruction, text }) => [instruction, text],
      summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:\n\n${noteContent}`
    };
    return userPrompts[promptKey](promptParams);
  }

  // ========== OPENAI COMMUNICATION ==========
  async function callOpenAI(apiKey, model, messages, promptKey) {
    const body = {
      model: model,
      messages: messages.map((content, i) => ({
        role: i === 0 ? "system" : "user",
        content: content
      }))
    };
    // Use JSON output for summarize/revise/answerSelection if you want, otherwise standard output
    const url = "https://api.openai.com/v1/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    const data = await response.json();
    // Handle both chat and standard outputs
    return data.choices?.[0]?.message?.content ?? "";
  }

  // ========== PLUGIN IMPLEMENTATION ==========
  var plugin = {
    constants: {
      labelApiKey: OPENAI_KEY_LABEL,
      labelAiModel: AI_MODEL_LABEL,
      pluginName: "Project Helper",
      requestTimeoutSeconds: 30
    },

    // ========== APP-LEVEL OPTIONS ==========
    appOption: {
      "Answer": async function(app) {
        // Get OpenAI API key
        let apiKey = app.settings[OPENAI_KEY_LABEL];
        if (!apiKey) {
          apiKey = await app.prompt("Enter your OpenAI API Key:");
          app.setSetting(OPENAI_KEY_LABEL, apiKey);
        }
        const model = app.settings[AI_MODEL_LABEL] || DEFAULT_OPENAI_MODEL;
        // Ask user for a question
        const instruction = await app.prompt(QUESTION_ANSWER_PROMPT);
        if (!instruction) return;
        const messages = messageArrayFromPrompt("answer", { instruction });
        const systemPrompt = systemPromptFromPromptKey("answer");
        const allMessages = [systemPrompt, ...messages];
        const result = await callOpenAI(apiKey, model, allMessages, "answer");
        await app.alert(result);
      }
    },

    // ========== NOTE OPTIONS ==========
    noteOption: {
      /*
      // ----------- Summarize -----------
      "Summarize": async function(app, noteUUID) {
        let apiKey = app.settings[OPENAI_KEY_LABEL];
        if (!apiKey) {
          apiKey = await app.prompt("Enter your OpenAI API Key:");
          app.setSetting(OPENAI_KEY_LABEL, apiKey);
        }
        const model = app.settings[AI_MODEL_LABEL] || DEFAULT_OPENAI_MODEL;
        const note = await app.notes.find(noteUUID);
        const noteContent = await note.content();
        const messages = messageArrayFromPrompt("summarize", { noteContent });
        const systemPrompt = systemPromptFromPromptKey("summarize");
        const allMessages = [systemPrompt, ...messages];
        const result = await callOpenAI(apiKey, model, allMessages, "summarize");
        await app.alert(result);
      }, // End Summarize
      */

      // ----------- Generate Project Status -----------
      "Generate Project Status": async function(app, noteUUID) {
        // Retrieve the OpenAI API key from plugin settings, or prompt the user for it if missing.
        let apiKey = app.settings[OPENAI_KEY_LABEL];
        if (!apiKey) {
          apiKey = await app.prompt("Enter your OpenAI API Key:");
          app.setSetting(OPENAI_KEY_LABEL, apiKey);
        }
        // Get the preferred OpenAI model from settings, or use the default if not set.
        const model = app.settings[AI_MODEL_LABEL] || DEFAULT_OPENAI_MODEL;
        
        // Fetch the current note using the provided noteUUID.
        const note = await app.notes.find(noteUUID);
        
        // Read the entire content of the main project note.
        const noteContent = await note.content();

        // Extract the "Last Updated:" date from the note contents
        let lastUpdatedMatch = noteContent.match(/Last Updated[^:\d]*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
        let lastUpdatedDate = lastUpdatedMatch
          ? new Date(`${lastUpdatedMatch[3]}-${lastUpdatedMatch[1].padStart(2, '0')}-${lastUpdatedMatch[2].padStart(2, '0')}`)
          : new Date(0); // If not found, default to very old date (1970)

        //await app.alert("Last Updated from main note: " + lastUpdatedDate)
        // Get all notes that link to this note (i.e., backlinks).
        const backlinks = await app.getNoteBacklinks(noteUUID);
        
         // 4. Build array of backlink notes with their update dates, filtering as we go
        const backlinksToProcess = [];
        for (let backlinkHandle of backlinks) {
          // fetches the actual note corresponding to this backlink
          //await app.alert("backlinkHandle: " + JSON.stringify(backlinkHandle));
          const backlinkNote = await app.notes.find(backlinkHandle.uuid);
          const backlinkNoteContents = await backlinkNote.content();
          //await app.alert("Backlink note contents: " + backlinkNoteContents);
          if (!backlinkNote) continue;
          const backlinkUpdatedAt = backlinkNote.updated ? new Date(backlinkNote.updated) : null;
          // if the backlinked note has an updated date AND that date is greater than the main note 
          // updated date, then add it to the list
          //await app.alert("Backlinked note update date: " + backlinkUpdatedAt + "Main updated: " + lastUpdatedDate);
          if (backlinkUpdatedAt && backlinkUpdatedAt > lastUpdatedDate) {
            backlinksToProcess.push(backlinkHandle);
          }
          //await app.alert("Backlinks to process: " + JSON.stringify(backlinksToProcess));
        }

        // Loop through each backlinking note.
        let backlinkContents = [];
        for (let backlinkHandle of backlinksToProcess) {
          // Load the backlink contents
          const backlinkNote = await app.getNoteBacklinkContents(noteUUID,backlinkHandle);
          // review what each backlink looks like before trimming
          //await app.alert ("Before trimming: " + JSON.stringify(backlinkNote,null,2));

          // Pull the raw string into a variable
          let str = backlinkNote[0];
          
          // Remove the URL and its surrounding parentheses
          str = str.replace(/\]\([^)]+\)/, ']');

          // Remove all indentation instructions
          str = str.replace(/<!--\s*\{["']?indent["']?:\d+\}\s*-->/g, '');

          // Split the string on double newlines
          let result = str.split(/\n{2,}/);

          // Trim whitespace from each block
          result = result.map(block => block.trim()).filter(block => block.length > 0);
          
          //await app.alert ("After trimming: " + result);
          // Push the contents into backlinkContents
          backlinkContents.push(result);
        }
        // Review backlinkContents
        // await app.alert(JSON.stringify(backlinkContents, null, 2));
        
        // Construct a prompt for the AI that includes the main note and the context from backlinks.
        const prompt = `${BASE_PROJECT_STATUS_PROMPT}

        Main Project Note:
        Title: ${note.name}
        Date: ${new Date().toLocaleDateString()}
        Content:
        ${noteContent}

        Context from Backlinked Notes:
        ${JSON.stringify(backlinkContents, null, 2)}
        `;
        // Show the AI prompt for review
        //await app.alert(prompt);
        
        // Prepare the prompt in the format expected by OpenAI
        const messages = messageArrayFromPrompt("answer", { instruction: prompt });
        const systemPrompt = systemPromptFromPromptKey("answer");
        const allMessages = [systemPrompt, ...messages];
        // Send prompt to OpenAI and get the project status 
        // ############## Commented out OpenAI call while troubleshooting ###############
        const result = await callOpenAI(apiKey, model, allMessages, "answer");
        // Show the generated project status to the user
        //await app.alert(result); 
        
       //replace the Project Update section contents with the results of the prompt
       const section = {heading:{text:"Project Update"}};
       // ############## Commented out replaceNoteContent call while troubleshooting ###############
       await app.replaceNoteContent(noteUUID,result,{section});
      } //End Generate Project Status
/*
      // ----------- Revise Note -----------
      "Revise": async function(app, noteUUID) {
        let apiKey = app.settings[OPENAI_KEY_LABEL];
        if (!apiKey) {
          apiKey = await app.prompt("Enter your OpenAI API Key:");
          app.setSetting(OPENAI_KEY_LABEL, apiKey);
        }
        const model = app.settings[AI_MODEL_LABEL] || DEFAULT_OPENAI_MODEL;
        const note = await app.notes.find(noteUUID);
        const noteContent = await note.content();
        const instruction = await app.prompt("How should this note be revised?");
        if (!instruction) return;
        const messages = messageArrayFromPrompt("reviseContent", { noteContent, instruction });
        const systemPrompt = systemPromptFromPromptKey("reviseContent");
        const allMessages = [systemPrompt, ...messages];
        const result = await callOpenAI(apiKey, model, allMessages, "reviseContent");
        await app.alert(result);
      } // End Revise
*/
    }
  };

  return plugin;
})()
