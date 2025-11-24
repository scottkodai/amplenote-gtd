{
  Settings: class {
    constructor(dailyJotLink, sectionHeader) {
      this.dailyJotLink = dailyJotLink;
      this.sectionHeader = sectionHeader
    }
  },

  constants: {
    version: "1.0.0",
    settingDailyJotLinkName: "Link to Daily Jot (true/false, default true)",
    settingSectionHeaderName: "Section header (default 'Calendar')",
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#noteOption
  noteOption: {
    "Month": async function(app) {
      const settings = new this.Settings(
        app.settings[this.constants.settingDailyJotLinkName] !== "false",
        app.settings[this.constants.settingSectionHeaderName] || "Calendar",
      );

      const sections = await app.getNoteSections({ uuid: app.context.noteUUID });
      const section = sections.find((section) => section.heading?.text === "Calendar");
      if (section === undefined) {
        app.alert("There needs to be a 'Calendar' section");
        return;
      }

      const dailyJots = settings.dailyJotLink ? await this._getDailyJotsForMonth(app) : new Map();
      app.replaceNoteContent({ uuid: app.context.noteUUID }, this._createMonthlyCalendar(dailyJots), { section });
    },
  },

  // --------------------------------------------------------------------------
  // Impure Functions
  async _getDailyJotsForMonth(app) {
    const today = new Date();
    const month = today.toLocaleString("default", { month: "long" });
    const year = today.getFullYear();
    const dailyJots = await app.filterNotes({ tag: "daily-jots", query: `${month} ${year}` });
    const map = dailyJots.reduce((map, jot) => {
      map.set(jot.name.split(" ")[1].replace(/(st,|rd,|th,|nd,)/, ""), jot);
      return map;
    }, new Map());
    return map;
  },

  // --------------------------------------------------------------------------
  // Pure Functions
  _createMonthlyCalendar(dailyJots) {
    const today = new Date(); // Creates: Date object for right now (e.g., "November 24, 2025 10:30:45 AM")
    today.setDate(1); // Set the date to the first day of month to calculate day of week correctly
    const dayOfWeek = today.getDay(); // returns a number: 0=Sunday, 1=Monday, ..., 6=Saturday
    // Gets total days in the month by calling .getDate() on the day before the first of the next month (day 0 of next month)
    const totalDays = (new Date(today.getFullYear(), today.getMonth() + 1, 0)).getDate();
    // Create an array with leading empty spaces for days before the 1st, followed by the days of the month
    // .repeat(dayOfWeek) creates a string with the correct number of empty spaces for the first week
    // Array.from converts that string into an array of individual space characters
    // Array.from({length: totalDays}, (e,i) => `${i + 1}`) creates an array of day numbers as strings (e= element, i=index)
    // and element is unused so we use a placeholder variable name. Result: ["1", "2", "3", ..., "30"] for a 30-day month
    // .concat merges the two arrays together and provides the list of days to print in the calendar (including leading spaces)
    const daysToPrint = Array.from(" ".repeat(dayOfWeek)).concat(Array.from({length: totalDays}, (e,i) => `${i + 1}`));

    const reducer = (content, day, index) => {
      const dayCell = dailyJots.has(day) ? `[${day}](https://www.amplenote.com/notes/${dailyJots.get(day).uuid})` : day;
      return content +
        "|" +
        dayCell +
        ((index + 1) % 7 === 0 ? "|\n" : ""); // If we have reached Sunday start a new row
    };

    const initialValue = "|S|M|T|W|T|F|S|\n|-|-|-|-|-|-|-|-|\n";

    const calendar = daysToPrint.reduce(reducer, initialValue);
    return calendar;
  },
}